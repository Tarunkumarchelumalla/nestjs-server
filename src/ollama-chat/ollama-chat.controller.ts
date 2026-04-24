import { Body, Controller, Post, HttpCode } from '@nestjs/common';
import { OllamaChatService } from './ollama-chat.service';
import { ChatMessageDto } from './dto/chat-message.dto';

@Controller('api/chat')
export class OllamaChatController {
  constructor(private readonly ollamaChatService: OllamaChatService) {}

  @Post('message')
  @HttpCode(200)
  sendMessage(@Body() dto: ChatMessageDto) {
    return this.ollamaChatService.handleMessage(dto);
  }
}
