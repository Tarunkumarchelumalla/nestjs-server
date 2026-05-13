import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import { UgcVideoService } from './ugc-video.service';
import { GenerateUgcDto } from './dto/generate-ugc.dto';

const tempDir = path.resolve('uploads/ugc-inputs');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

@Controller('api/ugc-video')
export class UgcVideoController {
  constructor(private readonly service: UgcVideoService) {}

  /**
   * POST /api/ugc-video/generate
   * multipart/form-data:
   *   image  — image file (jpeg/png/webp)
   *   prompt — text prompt for Veo
   *   voiceId — (optional) ElevenLabs voice ID for voice swap
   *   imageUrl — (optional) fallback if no image file
   */
  @Post('generate')
  @HttpCode(202)
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: (_req, _file, cb) => cb(null, tempDir),
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}_${file.originalname}`),
      }),
    }),
  )
  async generate(
    @UploadedFile() imageFile: Express.Multer.File,
    @Body() body: GenerateUgcDto,
  ) {
    return this.service.generateUgcVideo(body, imageFile);
  }

  /** GET /api/ugc-video/status/:jobId */
  @Get('status/:jobId')
  async status(@Param('jobId') jobId: string) {
    const result = await this.service.getJobStatus(jobId);
    if ('error' in result) throw new NotFoundException(result.error);
    return result;
  }
}
