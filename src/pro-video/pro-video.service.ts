import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateProVideoDto } from './dto/generate-pro-video.dto';

const SEEDANCE_BASE = 'https://ark.ap-southeast.bytepluses.com/api/v3/contents/generations/tasks';
const MODEL = 'dreamina-seedance-2-0-260128';

@Injectable()
export class ProVideoService {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_KEY || '',
    );
  }

  async generateProVideo(dto: GenerateProVideoDto) {
    // Handle multiple images via imageUrls array
    if (dto.imageUrls && dto.imageUrls.length > 0) {
      return this.generateProVideoBatch(dto);
    }

    // Single image fallback (backward compatibility)
    const imageUrl = dto.imageUrl || '';
    const { data, error } = await this.supabase
      .from('ugc_video_jobs')
      .insert({
        status: 'pending',
        prompt: dto.prompt || 'gnerate a video state of the art and use upbeat music and make it viral on tiktok',
        image_url: imageUrl,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error('Failed to create job: ' + error?.message);
    }

    const jobId = data.id as string;

    this.runPipeline(jobId, imageUrl, dto.prompt).catch((err) =>
      console.error('[pro-video] Pipeline error:', err?.message || err),
    );

    return { message: 'Pro video generation started.', jobId };
  }

  async generateProVideoBatch(dto: GenerateProVideoDto) {
    const imageUrls = dto.imageUrls || (dto.imageUrl ? [dto.imageUrl] : []);

    if (!imageUrls || imageUrls.length === 0) {
      throw new Error('No image URLs provided');
    }

    const defaultPrompt = dto.prompt || 'gnerate a video state of the art and use upbeat music and make it viral on tiktok';

    // Create all jobs in parallel
    const jobPromises = imageUrls.map((imageUrl) =>
      this.supabase
        .from('ugc_video_jobs')
        .insert({
          status: 'pending',
          prompt: defaultPrompt,
          image_url: imageUrl,
        })
        .select('id')
        .single(),
    );

    const results = await Promise.all(jobPromises);

    const jobIds: string[] = [];
    const errors: string[] = [];

    results.forEach((result, index) => {
      if (result.error || !result.data) {
        errors.push(`Image ${index}: ${result.error?.message}`);
      } else {
        const jobId = result.data.id as string;
        jobIds.push(jobId);
        // Start pipeline asynchronously for each job
        this.runPipeline(jobId, imageUrls[index], defaultPrompt).catch((err) =>
          console.error('[pro-video] Pipeline error:', err?.message || err),
        );
      }
    });

    if (jobIds.length === 0) {
      throw new Error('Failed to create jobs: ' + errors.join('; '));
    }

    return {
      message: `Pro video generation started for ${jobIds.length}/${imageUrls.length} images.`,
      jobIds,
      ...(errors.length > 0 && { warnings: errors }),
    };
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

  private async runPipeline(jobId: string, imageUrl: string, prompt: string): Promise<void> {
    try {
      await this.updateJob(jobId, { status: 'processing' });

      // Step 1: Submit to Seedance
      console.log(`[pro-video] [${jobId}] Submitting to Seedance...`);
      const submitResp = await axios.post(
        SEEDANCE_BASE,
        {
          model: MODEL,
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: { url: imageUrl },
              role: 'reference_image',
            },
          ],
          generate_audio: true,
          ratio: '9:16',
          duration: 12,
          watermark: false,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SEEDANCE_API_KEY || ''}`,
          },
        },
      );

      const seedanceTaskId: string = submitResp.data?.id;
      if (!seedanceTaskId) throw new Error('No task ID in Seedance response: ' + JSON.stringify(submitResp.data));

      console.log(`[pro-video] [${jobId}] Seedance task created: ${seedanceTaskId}. Waiting 30s before polling...`);

      // Step 2: Initial 30s wait
      await new Promise((r) => setTimeout(r, 30000));

      // Step 3: Poll every 5s until succeeded/failed
      let videoUrl: string | null = null;
      while (true) {
        const pollResp = await axios.get(`${SEEDANCE_BASE}/${seedanceTaskId}`, {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.SEEDANCE_API_KEY || ''}`,
          },
        });

        const status: string = pollResp.data?.status;
        console.log(`[pro-video] [${jobId}] Seedance status: ${status}`);

        if (status === 'succeeded') {
          videoUrl = pollResp.data?.content?.video_url;
          break;
        }

        if (status === 'failed') {
          throw new Error('Seedance task failed: ' + JSON.stringify(pollResp.data));
        }

        await new Promise((r) => setTimeout(r, 5000));
      }

      if (!videoUrl) throw new Error('No video_url in Seedance response');

      // Step 4: Download video locally
      console.log(`[pro-video] [${jobId}] Downloading video from Seedance CDN...`);
      const videosDir = path.resolve('uploads/videos');
      if (!fs.existsSync(videosDir)) fs.mkdirSync(videosDir, { recursive: true });

      const fileName = `pro_video_${jobId}.mp4`;
      const filePath = path.join(videosDir, fileName);

      const videoResp = await axios.get(videoUrl, {
        responseType: 'arraybuffer',
        maxRedirects: 5,
      });
      fs.writeFileSync(filePath, Buffer.from(videoResp.data));
      console.log(`[pro-video] [${jobId}] Video saved: ${filePath} (${videoResp.data.byteLength} bytes)`);

      // Step 5: Return local URL
      const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
      const localVideoUrl = `${baseUrl}/uploads/videos/${fileName}`;
      await this.updateJob(jobId, { status: 'completed', video_url: localVideoUrl });
      console.log(`[pro-video] [${jobId}] Done. videoUrl=${localVideoUrl}`);
    } catch (err: any) {
      const message = err?.message || String(err);
      console.error(`[pro-video] [${jobId}] Failed:`, message);
      await this.updateJob(jobId, { status: 'failed', error: message });
    }
  }

  private async updateJob(jobId: string, fields: Record<string, any>) {
    await this.supabase
      .from('ugc_video_jobs')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', jobId);
  }
}
