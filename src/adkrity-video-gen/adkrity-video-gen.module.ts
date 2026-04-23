import { Module } from '@nestjs/common';
import { AdkrityVideoGenController } from './adkrity-video-gen.controller';
import { AdkrityVideoGenService } from './adkrity-video-gen.service';

@Module({
  controllers: [AdkrityVideoGenController],
  providers: [AdkrityVideoGenService],
})
export class AdkrityVideoGenModule {}
