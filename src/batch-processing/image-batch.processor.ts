import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BatchProcessingService } from './batch-processing.service';
import { Logger } from '@nestjs/common';

@Processor('image-batch', {
  concurrency: 1, // Run image processing jobs sequentially to conserve rate limits and system memory
})
export class ImageBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(ImageBatchProcessor.name);

  constructor(private readonly batchProcessingService: BatchProcessingService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { batchId, jobId } = job.data;
    this.logger.log(`[ImageBatchProcessor] Started processing job ${job.id} for batchId=${batchId}`);
    
    try {
      await this.batchProcessingService.processBatchJob(batchId, 'image', jobId);
      this.logger.log(`[ImageBatchProcessor] Successfully completed job ${job.id} for batchId=${batchId}`);
      return { success: true, batchId };
    } catch (error) {
      this.logger.error(`[ImageBatchProcessor] Job ${job.id} failed for batchId=${batchId}: ${error.message}`);
      throw error; // Re-throw so BullMQ can handle retry according to backoff options
    }
  }
}
