import { Controller, Post, Body } from '@nestjs/common';
import { ImageService } from './image.service';

@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('edit')
  async editImage(@Body() body: { imageBase64: string; maskBase64?: string; prompt?: string; size?: string }) {
    return this.imageService.editImage(body);
  }

  @Post('erase')
  async eraseImage(@Body() body: { imageBase64: string; maskBase64: string; prompt?: string; size?: string }) {
    return this.imageService.eraseImage(body);
  }

  @Post('adkrity-text-heavy')
  async adkrityTextHeavy(@Body() body: any) {
    return this.imageService.adkrityTextHeavy(body);
  }

  @Post('add-noise')
  async addNoise(@Body('base64') base64: string) {
    const reponse = await this.imageService.addNoise(base64, 1);
    return {...reponse  };
  }
}
