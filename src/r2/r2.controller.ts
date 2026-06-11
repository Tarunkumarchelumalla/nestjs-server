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

  // Legacy: n8n sends base64 (kept for backward compat, remove later)
  @Post('upload')
  async upload(
    @Body()
    body: {
      media_base64: string;
      mime_type: string;
      chat_id: string;
      message_id: string;
      media_type?: string;
      filename?: string;
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

  // New: n8n sends only media_id + wa_token, service does download + upload
  @Post('ingest')
  async ingest(
    @Body()
    body: {
      media_id: string;
      wa_token: string;
      mime_type?: string;
      chat_id: string;
      message_id: string;
      media_type?: string;   // image | audio | document | video | sticker
      filename?: string;     // original filename (documents)
    },
  ) {
    if (!body.media_id || !body.wa_token || !body.chat_id || !body.message_id) {
      // 200 with success:false so the n8n branch degrades gracefully
      return { success: false, error: 'media_id, wa_token, chat_id, message_id are required' };
    }

    try {
      const result = await this.r2.ingestFromWhatsApp(body);
      return { success: true, ...result };
    } catch (err: any) {
      // Return success:false instead of throwing: the workflow's
      // Merge Upload Result checks success === true and continues without media
      return { success: false, error: err.message };
    }
  }
}