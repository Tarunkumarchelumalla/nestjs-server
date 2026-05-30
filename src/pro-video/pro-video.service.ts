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
    const prompt = dto.content.find((c) => c.type === 'text')?.text || '';
    const firstImageUrl = dto.content.find((c) => c.type === 'image_url')?.image_url?.url || '';

    const { data, error } = await this.supabase
      .from('ugc_video_jobs')
      .insert({
        status: 'pending',
        prompt,
        image_url: firstImageUrl,
      })
      .select('id')
      .single();

    if (error || !data) {
      throw new Error('Failed to create job: ' + error?.message);
    }

    const jobId = data.id as string;

    this.runPipeline(jobId, dto).catch((err) =>
      console.error('[pro-video] Pipeline error:', err?.message || err),
    );

    return { message: 'Pro video generation started.', jobId };
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

  private async runPipeline(jobId: string, dto: GenerateProVideoDto): Promise<void> {
    try {
      await this.updateJob(jobId, { status: 'processing' });

      console.log(`[pro-video] [${jobId}] Submitting to Seedance...`);
      const submitResp = await axios.post(
        SEEDANCE_BASE,
        {
          model: MODEL,
          content: dto.content,
          generate_audio: dto.generate_audio ?? false,
          ratio: dto.ratio ?? '16:9',
          duration: dto.duration ?? 4,
          watermark: dto.watermark ?? false,
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

      await new Promise((r) => setTimeout(r, 30000));

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
