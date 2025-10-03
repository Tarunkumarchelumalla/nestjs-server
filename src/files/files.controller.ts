import { Controller, Get, Param, Query, Post, Body, BadRequestException } from '@nestjs/common';
import { FileService } from './files.service';

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
}
