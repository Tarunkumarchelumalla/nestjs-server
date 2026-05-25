export class GenerateProVideoDto {
  prompt: string;
  imageUrl?: string; // backward compatibility for single image
  imageUrls?: string[]; // multiple image URLs
}
