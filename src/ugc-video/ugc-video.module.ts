import { Module } from '@nestjs/common';
import { UgcVideoController } from './ugc-video.controller';
import { UgcVideoService } from './ugc-video.service';

@Module({
  controllers: [UgcVideoController],
  providers: [UgcVideoService],
})
export class UgcVideoModule {}
