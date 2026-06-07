import {
  Controller,
  Post,
  Body,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { R2UploadService } from './r2.service';

@Controller('media')
export class R2UploadController {
  constructor(private readonly r2: R2UploadService) {}

  @Post('upload')
  async upload(
    @Body()
    body: {
      media_base64: string;
      mime_type: string;
      chat_id: string;
      message_id: string;
      media_type?: string;   // image | audio | document | video | sticker
      filename?: string;     // original filename (documents)
    },
  ) {
    try {
      const result = await this.r2.upload(
        body.media_base64,
        body.mime_type,
        body.chat_id,
        body.message_id,
        body.media_type || 'image',
        body.filename,
      );
      return { success: true, ...result };
    } catch (err: any) {
      throw new HttpException(
        { success: false, error: err.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}