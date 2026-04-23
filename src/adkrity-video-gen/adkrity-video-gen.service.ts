import { Injectable } from '@nestjs/common';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import * as axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { GenerateAdVideoDto } from './dto/generate-video.dto';

const BANNER_AD_PROMPT =
  'Create a stunning animated banner advertisement from this image. Add smooth, professional motion with a subtle zoom-in, elegant transitions, and dynamic lighting. The animation should feel premium and cinematic — eye-catching and suitable for digital marketing. Keep brand elements prominent while bringing the scene to life.';

@Injectable()
export class AdkrityVideoGenService {
  private supabase: SupabaseClient;
  private ai: GoogleGenAI;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '',
    );
    this.ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY || '' });
  }

  generateAdVideo(dto: GenerateAdVideoDto) {
    this.runPipeline(dto).catch((err) =>
      console.error('[adkrity-video-gen] Pipeline error:', err?.message || err),
    );
    return {
      message: 'Video generation started. Supabase will be updated when complete.',
      supabaseId: dto.supabaseId,
    };
  }

  private async runPipeline(dto: GenerateAdVideoDto): Promise<void> {
    const { url, supabaseId } = dto;

    console.log(`[adkrity-video-gen] Starting pipeline for supabaseId=${supabaseId}, url=${url}`);

    // Step 1: Fetch the row from adkrity-logs
    const { data: row, error } = await this.supabase
      .from('adkrity-logs')
      .select('response')
      .eq('id', supabaseId)
      .single();

    if (error || !row) {
      console.error('[adkrity-video-gen] Failed to fetch row:', error?.message);
      return;
    }

    // Step 2: Parse response array and find matching image object
    let responseArray: any[] = Array.isArray(row.response) ? row.response : JSON.parse(row.response || '[]');
    const matchIndex = responseArray.findIndex((item: any) => item.url === url);
    if (matchIndex === -1) {
      console.error('[adkrity-video-gen] No matching image found for url:', url);
      return;
    }

    // Step 3: Download image and convert to base64
    console.log('[adkrity-video-gen] Downloading image...');
    const imgResponse = await (axios as any).default.get(url, { responseType: 'arraybuffer' });
    const imageBase64 = Buffer.from(imgResponse.data).toString('base64');

    // Step 4: Generate video with Veo 3.1 lite
    console.log('[adkrity-video-gen] Submitting to Veo 3.1 lite...');
    let operation = await this.ai.models.generateVideos({
      model: 'veo-3.1-lite-generate-preview',
      prompt: BANNER_AD_PROMPT,
      config: { aspectRatio: '9:16' },
      image: {
        imageBytes: imageBase64,
        mimeType: 'image/jpeg',
      },
    });

    // Step 5: Poll until done
    while (!operation.done) {
      console.log('[adkrity-video-gen] Waiting for video generation...');
      await new Promise((resolve) => setTimeout(resolve, 10000));
      operation = await this.ai.operations.getVideosOperation({ operation });
    }

    const videoFile = operation.response?.generatedVideos?.[0]?.video;
    if (!videoFile) {
      console.error('[adkrity-video-gen] No video file in operation response.');
      return;
    }

    // Step 6: Save video locally
    const uploadsDir = path.resolve('uploads/videos');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const fileName = `veo_ad_${Date.now()}.mp4`;
    const downloadPath = path.join(uploadsDir, fileName);
    await this.ai.files.download({ file: videoFile, downloadPath });
    console.log(`[adkrity-video-gen] Video saved: ${downloadPath}`);

    // Step 7: Build public URL
    const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
    const videoUrl = `${baseUrl}/uploads/videos/${fileName}`;

    // Step 8: Update response array with videoUrl on matched item
    responseArray[matchIndex] = { ...responseArray[matchIndex], videoUrl };

    // Step 9: Persist updated response to Supabase
    const { error: updateError } = await this.supabase
      .from('adkrity-logs')
      .update({ response: responseArray })
      .eq('id', supabaseId);

    if (updateError) {
      console.error('[adkrity-video-gen] Failed to update Supabase:', updateError.message);
    } else {
      console.log(`[adkrity-video-gen] Supabase updated. videoUrl=${videoUrl}`);
    }
  }
}
