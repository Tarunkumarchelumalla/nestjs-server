import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import axios from 'axios';
import FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { GenerateUgcDto } from './dto/generate-ugc.dto';

@Injectable()
export class UgcVideoService {
  private supabase: SupabaseClient;
  private ai: GoogleGenAI;

  constructor() {

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_KEY || '',
    );
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });
  }

  async generateUgcVideo(dto: GenerateUgcDto, imageFile?: Express.Multer.File) {
    const { data, error } = await this.supabase
      .from('ugc_video_jobs')
      .insert({
        status: 'pending',
        prompt: dto.prompt,
        voice_id: dto.voiceId || null,
        image_url: imageFile ? null : (dto.imageUrl || null),
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error('Failed to create job: ' + error?.message);
    }

    const jobId = data.id as string;

    this.runPipeline(jobId, dto, imageFile).catch((err) =>
      console.error('[ugc-video] Pipeline error:', err?.message || err),
    );

    return { message: 'UGC video generation started.', jobId };
  }

  async getJobStatus(jobId: string) {
    const { data, error } = await this.supabase
      .from('ugc_video_jobs')
      .select('id, status, video_url, error, created_at, updated_at')
      .eq('id', jobId)
      .single();

    if (error || !data) return { error: 'Job not found' };
    return data;
  }

  private async runPipeline(
    jobId: string,
    dto: GenerateUgcDto,
    imageFile?: Express.Multer.File,
  ): Promise<void> {
    try {
      await this.updateJob(jobId, { status: 'processing' });

      // Step 1: Get image as base64
      console.log(`[ugc-video] [${jobId}] Loading image...`);
      let imageBase64: string;
      let mimeType = 'image/jpeg';

      if (imageFile) {
        imageBase64 = fs.readFileSync(imageFile.path).toString('base64');
        mimeType = imageFile.mimetype || 'image/jpeg';
      } else if (dto.imageUrl) {
        const resp = await axios.get(dto.imageUrl, { responseType: 'arraybuffer' });
        imageBase64 = Buffer.from(resp.data).toString('base64');
      } else {
        throw new Error('No image provided');
      }

      // Step 2: Submit to Veo Lite
      console.log(`[ugc-video] [${jobId}] Submitting to Veo Lite...`);
      let operation = await this.ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: dto.prompt,
        config: { aspectRatio: '9:16' },
        image: { imageBytes: imageBase64, mimeType },
      });

      // Step 3: Poll until done
      while (!operation.done) {
        console.log(`[ugc-video] [${jobId}] Waiting for Veo...`);
        await new Promise((r) => setTimeout(r, 10000));
        operation = await this.ai.operations.getVideosOperation({ operation });
      }

      console.log(`[ugc-video] [${jobId}] Veo response:`, JSON.stringify(operation.response, null, 2));
      const videoFile = operation.response?.generatedVideos?.[0]?.video;
      if (!videoFile) throw new Error('No video in Veo response: ' + JSON.stringify(operation.response));

      // Step 4: Download raw Veo video directly via URI + API key
      const videosDir = path.resolve('uploads/videos');
      if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

      const rawVideoName = `veo_raw_${jobId}.mp4`;
      const rawVideoPath = path.join(videosDir, rawVideoName);

      const videoUri = videoFile.uri;
      if (!videoUri) throw new Error('No URI in Veo video response');

      console.log(`[ugc-video] [${jobId}] Downloading video from: ${videoUri}`);
      const videoResp = await axios.get(videoUri, {
        headers: { 'x-goog-api-key': process.env.GOOGLE_API_KEY || '' },
        responseType: 'arraybuffer',
        maxRedirects: 5,
      });
      fs.writeFileSync(rawVideoPath, Buffer.from(videoResp.data));
      console.log(`[ugc-video] [${jobId}] Raw video saved: ${rawVideoPath} (${videoResp.data.byteLength} bytes)`);

      // If no voiceId → done, serve raw video
      if (!dto.voiceId) {
        const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
        const videoUrl = `${baseUrl}/uploads/videos/${rawVideoName}`;
        await this.updateJob(jobId, { status: 'completed', video_url: videoUrl });
        console.log(`[ugc-video] [${jobId}] Done (no voice swap). videoUrl=${videoUrl}`);
        return;
      }

      // Step 5: Extract audio from generated video
      const audioDir = path.resolve('uploads/audio');
      if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

      const extractedAudioPath = path.join(audioDir, `extracted_${jobId}.mp3`);
      console.log(`[ugc-video] [${jobId}] Extracting audio from video...`);
      try {
        const extractResult = execSync(
          `ffmpeg -i "${rawVideoPath}" -vn -acodec libmp3lame -q:a 2 -y "${extractedAudioPath}"`,
          { encoding: 'utf8' },
        );
        console.log(`[ugc-video] [${jobId}] ffmpeg extract stdout:`, extractResult);
      } catch (ffErr: any) {
        console.error(`[ugc-video] [${jobId}] ffmpeg extract stderr:`, ffErr.stderr);
        throw new Error('ffmpeg audio extract failed: ' + ffErr.stderr?.slice(0, 300));
      }
      const extractedSize = fs.existsSync(extractedAudioPath) ? fs.statSync(extractedAudioPath).size : 0;
      console.log(`[ugc-video] [${jobId}] Audio extracted: ${extractedAudioPath} (${extractedSize} bytes)`);
      if (extractedSize === 0) throw new Error('Extracted audio file is empty — video may have no audio stream');

      // Step 6: Convert extracted audio via ElevenLabs STS
      console.log(`[ugc-video] [${jobId}] Converting audio via ElevenLabs STS (voiceId=${dto.voiceId})...`);
      const form = new FormData();
      form.append('audio', fs.createReadStream(extractedAudioPath), {
        filename: `extracted_${jobId}.mp3`,
        contentType: 'audio/mpeg',
      });
      form.append('model_id', 'eleven_english_sts_v2');
      form.append(
        'voice_settings',
        JSON.stringify({
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
        }),
      );

      const elevenResp = await axios.post(
        `https://api.elevenlabs.io/v1/speech-to-speech/${dto.voiceId}`,
        form,
        {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY || '',
            ...form.getHeaders(),
          },
          responseType: 'arraybuffer',
        },
      );
      console.log(`[ugc-video] [${jobId}] ElevenLabs response size: ${elevenResp.data.byteLength} bytes, status: ${elevenResp.status}`);

      const convertedAudioPath = path.join(audioDir, `converted_${jobId}.mp3`);
      fs.writeFileSync(convertedAudioPath, Buffer.from(elevenResp.data));
      console.log(`[ugc-video] [${jobId}] ElevenLabs audio saved: ${convertedAudioPath}`);

      // Step 7: Merge converted audio back into video
      const finalVideoName = `ugc_final_${jobId}.mp4`;
      const finalVideoPath = path.join(videosDir, finalVideoName);
      console.log(`[ugc-video] [${jobId}] Merging new audio into video...`);
      try {
        const mergeResult = execSync(
          `ffmpeg -i "${rawVideoPath}" -i "${convertedAudioPath}" -map 0:v -map 1:a -c:v copy -shortest -y "${finalVideoPath}"`,
          { encoding: 'utf8' },
        );
        console.log(`[ugc-video] [${jobId}] ffmpeg merge stdout:`, mergeResult);
      } catch (ffErr: any) {
        console.error(`[ugc-video] [${jobId}] ffmpeg merge stderr:`, ffErr.stderr);
        throw new Error('ffmpeg merge failed: ' + ffErr.stderr?.slice(0, 300));
      }
      console.log(`[ugc-video] [${jobId}] Final video ready: ${finalVideoPath}`);

      // Step 8: Persist final URL
      const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
      const videoUrl = `${baseUrl}/uploads/videos/${finalVideoName}`;
      await this.updateJob(jobId, { status: 'completed', video_url: videoUrl });
      console.log(`[ugc-video] [${jobId}] Done. videoUrl=${videoUrl}`);

      // Cleanup intermediate files
      for (const p of [extractedAudioPath, convertedAudioPath]) {
        if (fs.existsSync(p)) fs.unlinkSync(p);
      }
    } catch (err:any) {
      const message = err?.message || String(err);
      console.error(`[ugc-video] [${jobId}] Failed:`, message);
      await this.updateJob(jobId, { status: 'failed', error: message });
    } finally {
      if (imageFile?.path && fs.existsSync(imageFile.path)) fs.unlinkSync(imageFile.path);
    }
  }

  private async updateJob(jobId: string, fields: Record<string, any>) {
    await this.supabase
      .from('ugc_video_jobs')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }
}
