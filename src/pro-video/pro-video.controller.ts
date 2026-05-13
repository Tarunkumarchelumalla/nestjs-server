import { Body, Controller, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { ProVideoService } from './pro-video.service';
import { GenerateProVideoDto } from './dto/generate-pro-video.dto';

@Controller('api/pro-video')
export class ProVideoController {
  constructor(private readonly service: ProVideoService) {}

  /**
   * POST /api/pro-video/generate
   * Body: { prompt, imageUrl }
   */
  @Post('generate')
  @HttpCode(202)
  async generate(@Body() dto: GenerateProVideoDto) {
    return this.service.generateProVideo(dto);
  }

  /** GET /api/pro-video/status/:jobId */
  @Get('status/:jobId')
  async status(@Param('jobId') jobId: string) {
    const result = await this.service.getJobStatus(jobId);
    if ('error' in result) throw new NotFoundException(result.error);
    return result;
  }
}
