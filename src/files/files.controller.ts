import {
  Controller,
  Get,
  Param,
  Query,
  Post,
  Body,
  BadRequestException,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileService } from './files.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as path from 'path';

const uploadsDir = path.resolve('uploads/videos');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

@Controller('upload')
export class FileController {
  constructor(private readonly fileService: FileService) {}

  // API 1: Process whole handle
  @Get(':handlename')
  async processHandle(
    @Param('handlename') handlename: string,
    @Query('table') table?: string,
    @Query('column') column?: string,
  ) {
    return this.fileService.processHandle(handlename, table, column);
  }

  // API 2: Upload single image from URL
  @Post('url')
  async uploadUrl(@Body('imageUrl') imageUrl: string, @Body('folder') folder?: string) {
    if (!imageUrl) throw new BadRequestException('imageUrl is required');
    return this.fileService.uploadToCloudinaryFromUrl(imageUrl, folder);
  }

  // API 3: Upload single image from Base64
  @Post('base64')
  async uploadBase64(@Body('base64') base64: string, @Body('folder') folder?: string) {
    if (!base64) throw new BadRequestException('base64 field is required');
    return this.fileService.uploadToCloudinaryFromBase64(base64, folder);
  }

  // ✅ API 4: Upload file from n8n / multipart form-data
  @Post('file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, file, cb) => {
          cb(null, uploadsDir);
        },
        filename: (req, file, cb) => {
          const uniqueName = `${Date.now()}_${file.originalname}`;
          cb(null, uniqueName);
        },
      }),
      limits: {
        fileSize: 500 * 1024 * 1024, // 500 MB (adjust if needed)
      },
      fileFilter: (req, file, cb) => {
        // Allow only video files (change if you want images too)
        if (!file.mimetype.startsWith('video/')) {
          return cb(
            new BadRequestException('Only video files are allowed'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadFile(@UploadedFile() file:any) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
    const publicUrl = `${baseUrl}/uploads/videos/${file.filename}`;

    return {
      success: true,
      fileName: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
      url: publicUrl,
    };
  }
}
