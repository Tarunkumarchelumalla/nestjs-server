import { Controller, Post, Body } from '@nestjs/common';
import { ImageService } from './image.service';

@Controller('image')
export class ImageController {
  constructor(private readonly imageService: ImageService) {}

  @Post('edit')
  async editImage(@Body() body: { imageBase64: string; maskBase64?: string; prompt?: string; size?: string }) {
    try{
      const reponse = await this.imageService.editImage(body);
      return {...reponse  };
    }catch(e){
      console.log(e);
      return {error:e};
    }
  }

  @Post('erase')
  async eraseImage(@Body() body: { imageBase64: string; maskBase64: string; prompt?: string; size?: string }) {
    try{
      const reponse = await this.imageService.eraseImage(body);
      return {...reponse  };
    }catch(e){
      console.log(e);
      return {error:e};
    }
  }

  @Post('add-noise')
  async addNoise(@Body('base64') base64: string) {
    try{
      const reponse = await this.imageService.addNoise(base64, 1);
      return {...reponse  };
    }catch(e){
      console.log(e);
      return {error:e};
    }
  }

    @Post('adkrity-text-heavy')
  async adkrityTextHeavy(@Body() body: any) {
    return this.imageService.adkrityTextHeavy(body);
  }

  @Post('generate-video')
  async generateVideo(@Body() body: any) {
    try{
      const reponse = await this.imageService.generateVideo(body.base64,body.videoprompt,body.aspectRatio);
      return reponse;
    }catch(e){
      console.log(e);
      return {error:e};
    }
  }
}
