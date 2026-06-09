import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BatchProcessingController } from './batch-processing.controller';
import { BatchProcessingService } from './batch-processing.service';
import { ImageBatchProcessor } from './image-batch.processor';
import { ContentBatchProcessor } from './content-batch.processor';
import { FileModule } from '../files/files.module';

@Module({
  imports: [
    // Register the BullMQ queues
    BullModule.registerQueue(
      { name: 'image-batch' },
      { name: 'content-batch' },
    ),
    FileModule,
  ],
  controllers: [BatchProcessingController],
  providers: [
    BatchProcessingService,
    ImageBatchProcessor,
    ContentBatchProcessor,
  ],
  exports: [BatchProcessingService],
})
export class BatchProcessingModule {}
