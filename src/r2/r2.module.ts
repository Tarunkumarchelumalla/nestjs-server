import { Module } from '@nestjs/common';
import { R2UploadController } from './r2.controller';
import { R2UploadService } from './r2.service';

@Module({
  controllers: [R2UploadController],
  providers: [R2UploadService],
  exports: [R2UploadService],
})
export class R2UploadModule {}