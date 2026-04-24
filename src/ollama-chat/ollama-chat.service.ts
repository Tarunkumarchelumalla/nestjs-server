import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { ChatMessageDto } from './dto/chat-message.dto';

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT = `You are the Cinqa Assistant, an AI helper for Cinqa — a creative automation studio based in Surat, India, founded in 2025. Cinqa designs and builds AI-powered workflows and content automations for brands.

## What Cinqa Does
Cinqa delivers 6 content formats, 10x faster and at 10x less cost, each adapted to the brand's specific voice, colors, and audience:
- UGC for Apparel — Authentic creator content for fashion & apparel brands
- Brand Ads & Motion Graphics — High-impact animated ads built for conversion
- AI Celeb Videos — Celebrity-style endorsements, generated with AI
- Regional UGC Content — Localized content in Hindi, Tamil, Telugu & more
- SaaS Content — Demo videos and explainers for software brands
- Avatar-Based Founder Content — Founder's voice, scaled with AI avatars

## Trusted Clients
Mamaearth, Aqualogica, XYXX, Real Essentials

## How Cinqa Works
1. Discovery — Identify creative goals, uncover workflow inefficiencies, map automation opportunities
2. Strategy — Tailored action plan compatible with existing stack, scalable and modular
3. Execution — Weekly updates, open communication, full documentation and handoff

## Your Role
- Answer questions about Cinqa's services, content types, clients, and process
- Help visitors understand which content format fits their brand
- Guide interested brands toward starting a project or submitting an enquiry
- Keep responses short, confident, and on-brand — Cinqa is modern, creative, and results-driven
- If someone wants to start a project or talk to the team, direct them to: cinqa.ai (contact/enquiry form)
- Do NOT make up pricing, timelines, or specific guarantees not mentioned above
- If unsure about something specific, say: "Let me connect you with the Cinqa team for that."

## Tone
Professional but approachable. Confident. Creative. No fluff — get to the point.`;

interface ConversationContext {
  history: ConversationMessage[];
  pairCount: number;
  lastActivityAt: number;
}

@Injectable()
export class OllamaChatService {
  private readonly conversations = new Map<string, ConversationContext>();
  private readonly OLLAMA_URL = 'http://localhost:11434/api/chat';
  private readonly MODEL = 'qwen3:4b';
  private readonly MAX_PAIRS = 10;

  constructor() {
    // Purge conversations idle for more than 1 hour every 15 minutes
    setInterval(() => {
      const cutoff = Date.now() - 60 * 60 * 1000;
      for (const [id, ctx] of this.conversations.entries()) {
        if (ctx.lastActivityAt < cutoff) {
          this.conversations.delete(id);
        }
      }
    }, 15 * 60 * 1000);
  }

  async handleMessage(dto: ChatMessageDto): Promise<{
    conversationId: string;
    reply: string;
    messageCount: number;
    contextReset: boolean;
  }> {
    if (!dto.message || dto.message.trim() === '') {
      throw new BadRequestException('message must not be empty');
    }

    const conversationId = dto.conversationId?.trim() || uuidv4();

    let context = this.conversations.get(conversationId);
    let contextReset = false;

    if (!context) {
      context = this.createFreshContext();
      this.conversations.set(conversationId, context);
    } else if (context.pairCount >= this.MAX_PAIRS) {
      context = this.createFreshContext();
      this.conversations.set(conversationId, context);
      contextReset = true;
    }

    const messagesForOllama: ConversationMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...context.history,
      { role: 'user', content: dto.message.trim() },
    ];

    let assistantReply: string;
    try {
      const response = await axios.post(
        this.OLLAMA_URL,
        { model: this.MODEL, stream: false, messages: messagesForOllama },
        { headers: { 'Content-Type': 'application/json' }, timeout: 60_000 },
      );
      assistantReply = response.data?.message?.content;
      if (!assistantReply) throw new Error('Empty reply from Ollama');
    } catch (err) {
      console.error('[ollama-chat] Ollama call failed:', err?.message || err);
      throw new ServiceUnavailableException(
        'Ollama is unavailable. Ensure it is running on port 11434 with qwen3:4b pulled.',
      );
    }

    context.history.push({ role: 'user', content: dto.message.trim() });
    context.history.push({ role: 'assistant', content: assistantReply });
    context.pairCount += 1;
    context.lastActivityAt = Date.now();

    return {
      conversationId,
      reply: assistantReply,
      messageCount: context.history.length,
      contextReset,
    };
  }

  private createFreshContext(): ConversationContext {
    return { history: [], pairCount: 0, lastActivityAt: Date.now() };
  }
}
