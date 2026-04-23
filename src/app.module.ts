import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ImageModule } from './image/image.module';
import { FileModule } from './files/files.module';
import { ConfigModule } from '@nestjs/config';
import { AgentsModule } from './agents/agents.module';
import { AdkrityVideoGenModule } from './adkrity-video-gen/adkrity-video-gen.module';

@Module({
  imports: [ConfigModule.forRoot({
    isGlobal: true, // makes process.env available everywhere
    // optionally: envFilePath: '.env'
  }), ImageModule, FileModule, AgentsModule, AdkrityVideoGenModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
