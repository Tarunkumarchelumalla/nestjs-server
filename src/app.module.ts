import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImageModule } from './image/image.module';
import { FileModule } from './files/files.module';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './agents/agents.module';
import { AdkrityVideoGenModule } from './adkrity-video-gen/adkrity-video-gen.module';
import { OllamaChatModule } from './ollama-chat/ollama-chat.module';
import { UgcVideoModule } from './ugc-video/ugc-video.module';
import { ProVideoModule } from './pro-video/pro-video.module';
import { R2UploadModule } from './r2/r2.module';
import { BullModule } from '@nestjs/bullmq';
import { BatchProcessingModule } from './batch-processing/batch-processing.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRoot({
      connection: {
        host: process.env.SHOPIFY_REDIS_HOST || process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.SHOPIFY_REDIS_PORT || process.env.REDIS_PORT || '6379', 10),
        password: process.env.SHOPIFY_REDIS_PASSWORD || process.env.REDIS_PASSWORD || undefined,
      },
    }),
    ImageModule,
    FileModule,
    AgentsModule,
    AdkrityVideoGenModule,
    OllamaChatModule,
    UgcVideoModule,
    ProVideoModule,
    R2UploadModule,
    BatchProcessingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
