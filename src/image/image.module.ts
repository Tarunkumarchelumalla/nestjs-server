import { Module } from '@nestjs/common';
import { ImageController } from './image.controller';
import { ImageService } from './image.service';
import { FileService } from 'src/files/files.service';

@Module({
  controllers: [ImageController],
  providers: [ImageService, FileService],
})
export class ImageModule {}
