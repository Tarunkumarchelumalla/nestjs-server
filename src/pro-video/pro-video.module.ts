import { Module } from '@nestjs/common';
import { ProVideoController } from './pro-video.controller';
import { ProVideoService } from './pro-video.service';

@Module({
  controllers: [ProVideoController],
  providers: [ProVideoService],
})
export class ProVideoModule {}
