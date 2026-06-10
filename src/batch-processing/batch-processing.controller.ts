import { Controller, Post, Body, BadRequestException, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

interface EnqueueBatchDto {
  batchId: string;
  batchType: 'image' | 'content';
  jobId?: string;
}

@Controller('batch-processing')
export class BatchProcessingController {
  constructor(
    @InjectQueue('image-batch') private readonly imageQueue: Queue,
    @InjectQueue('content-batch') private readonly contentQueue: Queue,
  ) {}

  @Post('enqueue')
  @HttpCode(HttpStatus.ACCEPTED)
  async enqueueBatch(@Body() dto: EnqueueBatchDto) {
    const { batchId, batchType, jobId } = dto;

    if (!batchId) {
      throw new BadRequestException('batchId is required');
    }

    if (!['image', 'content'].includes(batchType)) {
      throw new BadRequestException('batchType must be either "image" or "content"');
    }

    console.log(`[BatchProcessingController] Received enqueue request for batchId=${batchId}, type=${batchType}, jobId=${jobId}`);

    const jobPayload = {
      batchId,
      batchType,
      jobId,
    };

    // Use batchId as the BullMQ jobId for idempotency (prevent double processing of the same batch)
    const options = {
      jobId: batchId,
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000, // retry starting from 5 seconds
      },
    };

    const queue = batchType === 'image' ? this.imageQueue : this.contentQueue;
    const existingJob = await queue.getJob(batchId);
    if (existingJob) {
      const state = await existingJob.getState();
      if (['failed', 'completed'].includes(state)) {
        console.log(`[BatchProcessingController] Job ${batchId} was in state '${state}'. Removing old job to allow retry.`);
        await existingJob.remove();
      } else {
        console.log(`[BatchProcessingController] Job ${batchId} already exists in active/pending state '${state}'. Skipping enqueue.`);
        return {
          success: true,
          message: `Batch job already active in ${batchType}-batch queue (state: ${state})`,
          batchId,
        };
      }
    }

    if (batchType === 'image') {
      await this.imageQueue.add('process-image-batch', jobPayload, options);
      console.log(`[BatchProcessingController] Enqueued image batch ${batchId} to image-batch queue`);
    } else {
      await this.contentQueue.add('process-content-batch', jobPayload, options);
      console.log(`[BatchProcessingController] Enqueued content batch ${batchId} to content-batch queue`);
    }

    return {
      success: true,
      message: `Batch job successfully enqueued in ${batchType}-batch queue`,
      batchId,
    };
  }
}
