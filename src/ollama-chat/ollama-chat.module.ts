import { Module } from '@nestjs/common';
import { OllamaChatController } from './ollama-chat.controller';
import { OllamaChatService } from './ollama-chat.service';

@Module({
  controllers: [OllamaChatController],
  providers: [OllamaChatService],
})
export class OllamaChatModule {}
