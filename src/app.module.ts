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

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true,
  }), ImageModule, FileModule, AgentsModule, AdkrityVideoGenModule, OllamaChatModule, UgcVideoModule, ProVideoModule, R2UploadModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
