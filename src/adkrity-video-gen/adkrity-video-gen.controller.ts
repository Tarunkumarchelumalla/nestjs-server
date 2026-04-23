import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AdkrityVideoGenService } from './adkrity-video-gen.service';
import { GenerateAdVideoDto } from './dto/generate-video.dto';

@Controller('api/adkrity-video-gen')
export class AdkrityVideoGenController {
  constructor(private readonly service: AdkrityVideoGenService) {}

  @Post('generate')
  @HttpCode(202)
  generate(@Body() dto: GenerateAdVideoDto) {
    return this.service.generateAdVideo(dto);
  }
}
