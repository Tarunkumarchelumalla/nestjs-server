import { Controller, Post, Body, HttpException, HttpStatus } from '@nestjs/common';
import { R2UploadService } from './r2.service';

@Controller('media')
export class R2UploadController {
  constructor(private readonly r2: R2UploadService) {}

  @Post('upload')
  async upload(@Body() body: {
    image_base64: string;
    mime_type: string;
    chat_id: string;
    message_id: string;
  }) {
    try {
      const result = await this.r2.upload(
        body.image_base64,
        body.mime_type,
        body.chat_id,
        body.message_id,
      );
      return { success: true, ...result };
    } catch (err:any) {
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}