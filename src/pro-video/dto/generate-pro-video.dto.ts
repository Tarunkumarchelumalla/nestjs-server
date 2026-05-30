export class ContentItem {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: { url: string };
  role?: string;
}

export class GenerateProVideoDto {
  model?: string;           // ignored — model is fixed server-side
  content: ContentItem[];   // array of text + image_url items
  generate_audio?: boolean; // default: false
  ratio?: string;           // default: '16:9'
  duration?: number;        // default: 4
  watermark?: boolean;      // default: false
}
