import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';

@Injectable()
export class ImageService {
  parseBase64(b64: string, defaultMime = 'image/png') {
    let mimeType = defaultMime;
    let base64Data = b64;

    const match = b64.match(/^data:(.+);base64,(.*)$/);
    if (match) {
      mimeType = match[1];
      base64Data = match[2];
    }

    return { buffer: Buffer.from(base64Data, 'base64'), mimeType };
  }

  async editImage(payload: {
    imageBase64: string;
    maskBase64?: string;
    prompt?: string;
    size?: string;
  }) {
    const { imageBase64, maskBase64, prompt, size } = payload;

    if (!imageBase64) throw new BadRequestException('imageBase64 is required');

    const { buffer: imageBuffer, mimeType: imageMime } = this.parseBase64(imageBase64);

    const formData = new FormData();
    formData.append('model', 'gpt-image-1');
    formData.append('image', imageBuffer, `image.${imageMime.split('/')[1]}`);
    formData.append('prompt', prompt || 'Edit this image');
    formData.append('size', size || '1024x1024');

    if (maskBase64) {
      const { buffer: maskBuffer, mimeType: maskMime } = this.parseBase64(maskBase64);
      formData.append('mask', maskBuffer, `mask.${maskMime.split('/')[1]}`);
    }

    const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
    });

    return response.data;
  }

  async eraseImage(payload: { imageBase64: string; maskBase64: string; prompt?: string; size?: string }) {
    const { imageBase64, maskBase64, prompt, size } = payload;

    if (!imageBase64 || !maskBase64) {
      throw new BadRequestException('imageBase64 and maskBase64 are required');
    }

    const { buffer: imageBuffer } = this.parseBase64(imageBase64);
    const { buffer: maskBuffer } = this.parseBase64(maskBase64);

    const formData = new FormData();
    formData.append('image', imageBuffer, 'image.png');
    formData.append('mask', maskBuffer, 'mask.png');
    formData.append('prompt', prompt || '');
    formData.append('size', size || '');
    formData.append('response_format', 'b64_json');

    const response = await axios.post('https://api.openai.com/v1/images/edits', formData, {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        ...formData.getHeaders(),
      },
    });

    const data = response.data;
    return { imageBase64: `data:image/png;base64,${data.data[0].b64_json}` };
  }

  async adkrityTextHeavy(inputPayload: any) {
    console.log({inputPayload})
    async function urlToBase64(url: string, mime: string) {
      const response = await fetch(url);
      const buffer = await response.arrayBuffer();
      return `data:${mime};base64,${Buffer.from(buffer).toString('base64')}`;
    }

    const productImagesBase64 = await Promise.all(
      (inputPayload.productImages || []).map(async (img) => urlToBase64(img.url, img.mime)),
    );

    let logoBase64 = '';
    if (inputPayload.logo_url && inputPayload.logo_mime) {
      logoBase64 = await urlToBase64(inputPayload.logo_url, inputPayload.logo_mime);
    }

    const newPayload = {
      category: inputPayload.category,
      phone_number: inputPayload.phone_number || '',
      address: inputPayload.address || '',
      highlight_area: inputPayload.highlight_area || '',
      website: inputPayload.website,
      design_req: inputPayload.design_req,
      logo_url: logoBase64 || '',
      product_images: productImagesBase64 || [],
    };

    const response = await axios.post(
      'https://n8n.cinqa.space/webhook/7cfd8f0f-2d73-4ca8-8c1d-99cb4812b46b',
      newPayload,
      { headers: { 'Content-Type': 'application/json' } },
    );

    return { status: 'success', response: response.data };
  }
}
