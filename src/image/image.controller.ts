import { Controller, Post, Body } from '@nestjs/common';
import { ImageService } from './image.service';
import axios from 'axios';

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

    @Post('process-multiple-withnoise')
  async processMultipleImages(
    @Body() body: { imageUrls: string[]; noiseIntensity?: number }
  ) {
    try {
      const { imageUrls, noiseIntensity = 1 } = body;
      if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
        throw new Error('imageUrls must be a non-empty array of image URLs');
      }
      
      const results = await this.imageService.processMultipleImages(imageUrls, noiseIntensity);
      return { success: true, results };
    } catch (error) {
      console.error('Error processing multiple images:', error);
      return { 
        success: false, 
        error: error.message || 'Failed to process images' 
      };
    }
  }

  @Post('adkrity-text-heavy')
  async adkrityTextHeavy(@Body() body: any) {
    return this.imageService.adkrityTextHeavy(body);
  }

  @Post('generate-video')
  async generateVideo(@Body() body: any) {
    try{
      const reponse = await this.imageService.generateVideo(body.base64,body.videoprompt,body.aspectRatio,body.apiKey);
      return reponse;
    }catch(e){
      console.log(e);
      return {error:e};
    }
  }

  @Post('url-to-base64')
  async urlsToBase64(@Body() body: { urls: string[] }) {
    try {
      const base64Promises = body.urls.map(async (url) => {
        try {
          const response = await axios.get(url, { responseType: 'arraybuffer' });
          const contentType = response.headers['content-type'];
          const base64 = Buffer.from(response.data, 'binary').toString('base64');
          return {
            url,
            base64: `data:${contentType};base64,${base64}`,
            success: true
          };
        } catch (error) {
          return {
            url,
            error: error.message,
            success: false
          };
        }
      });

      const results = await Promise.all(base64Promises);
      return { results };
    } catch (error) {
      console.error('Error processing URLs:', error);
      return { error: error.message };
    }
  }
}
