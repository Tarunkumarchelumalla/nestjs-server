import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { BatchProcessingService } from './batch-processing.service';
import { Logger } from '@nestjs/common';

@Processor('content-batch', {
  concurrency: 5, // Run content generation processing jobs concurrently since database updates are fast and lightweight
})
export class ContentBatchProcessor extends WorkerHost {
  private readonly logger = new Logger(ContentBatchProcessor.name);

  constructor(private readonly batchProcessingService: BatchProcessingService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { batchId, jobId } = job.data;
    this.logger.log(`[ContentBatchProcessor] Started processing job ${job.id} for batchId=${batchId}`);
    
    try {
      await this.batchProcessingService.processBatchJob(batchId, 'content', jobId);
      this.logger.log(`[ContentBatchProcessor] Successfully completed job ${job.id} for batchId=${batchId}`);
      return { success: true, batchId };
    } catch (error) {
      this.logger.error(`[ContentBatchProcessor] Job ${job.id} failed for batchId=${batchId}: ${error.message}`);
      throw error; // Re-throw so BullMQ can handle retry according to backoff options
    }
  }
}
