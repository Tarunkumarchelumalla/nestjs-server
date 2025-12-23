import { Injectable, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import FormData from 'form-data';
import imageSize from "image-size";
import { v2 as cloudinary } from 'cloudinary';
import { FileService } from 'src/files/files.service';
import { createCanvas, loadImage } from 'canvas';
import fetch from 'node-fetch';
import * as fs from 'fs';
import { GoogleGenAI } from '@google/genai';
import path from 'path';

@Injectable()
export class ImageService {


  constructor(private  fileService: FileService) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    
    this.ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  }
  private readonly ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
 

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
    const invalidImages: string[] = [];
  
    async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
      try {
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        const { width, height } = imageSize(Buffer.from(buffer));
  
        if (!width || !height) {
          throw new Error("Invalid dimensions");
        }
  
        return { width, height };
      } catch (err) {
        console.error("Dimension check failed:", url, err);
        return { width: 0, height: 0 };
      }
    }
  
    async function urlToBase64(url: string, mime: string) {
      const res = await fetch(url);
      const buffer = await res.arrayBuffer();
      return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
    }
  
    const handleImage = async (url: string, mime: string = 'image/png') => {
      const { width, height } = await getImageDimensions(url);
      console.log("Checked:", url, "→", width, height);
  
      if (false) {
        invalidImages.push(url);
  
        // Upload invalid image to Cloudinary
        const { url: uploadedUrl, publicId } = await this.fileService.uploadToCloudinaryFromUrl(url);
  
        if (publicId) {
          console.log("Resizing:", uploadedUrl);

          const resizedUrl = `https://res.cloudinary.com/dknssnkrd/image/upload/c_pad,ar_1:1/${publicId}`;
          return await urlToBase64(resizedUrl, mime);
        }
      }
  
      // Valid image
      return await urlToBase64(url, mime);
    };
  
    const productImagesBase64 = await Promise.all(
      (inputPayload.productImages || []).map(async (img: any) => {
        const mime = this.getMimeFromUrl(img.url);
        return await handleImage(img.url, mime);
      })
    );
    
    let logoBase64 = "";
    if (inputPayload.logo_url) {
      const mime = this.getMimeFromUrl(inputPayload.logo_url);
      logoBase64 = await handleImage(inputPayload.logo_url, mime);
    }
  
    const newPayload = {
      category: inputPayload.category,
      phone_number: inputPayload.phone_number || "",
      address: inputPayload.address || "",
      highlight_area: inputPayload.highlight_area || "",
      website: inputPayload.website,
      design_req: inputPayload.design_req,
      logo_url: logoBase64 || "",
      product_images: productImagesBase64 || [],
    };


    const response = await axios.post(
      'https://n8n.cinqa.space/webhook/7cfd8f0f-2d73-4ca8-8c1d-99cb4812b46b',
      
      newPayload,
      { headers: { 'Content-Type': 'application/json' } },
    );

    return { status: 'success', response: response.data };

  }
  
  
  
  
  async resizeImageOnCloudinary(publicId: string, folder?: string) {
    const transformation = {
      width: 1024,
      height: 1024,
      crop: 'pad',
      gravity: 'auto',   // keeps subject centered
    };
  
    const url = cloudinary.url(publicId, {
      transformation: [transformation],
      folder,
    });
  
    return { url };
  }

   getMimeFromUrl(url: string): string {
    const extension = url.split('.').pop()?.toLowerCase();
    switch (extension) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      case 'svg':
        return 'image/svg+xml';
      default:
        return 'application/octet-stream';
    }
  }

  
 async addNoise(base64: string, intensity = 1): Promise<any> {
  try {

    // Validate and parse input
    const mimeMatch = base64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
    if (!mimeMatch) throw new Error('Invalid Base64 image format');
      console.log({mime:mimeMatch[1]});
      
    const mime = mimeMatch[1];
    const data = base64.split(',')[1];
    const buffer = Buffer.from(data, 'base64');

    // Load image into canvas
    const img = await loadImage(buffer);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);

    // Extract pixel data
    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixels = imageData.data;

      // Add subtle noise (±intensity)
    for (let i = 0; i < pixels.length; i += 4) {
      pixels[i] = Math.min(255, Math.max(0, pixels[i] + (Math.floor(Math.random() * (2 * intensity + 1)) - intensity)));     // R
      pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] + (Math.floor(Math.random() * (2 * intensity + 1)) - intensity))); // G
      pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + (Math.floor(Math.random() * (2 * intensity + 1)) - intensity))); // B
    }

    ctx.putImageData(imageData, 0, 0);

      // Return new Base64
      const newBase64 = canvas.toDataURL();
    const cleanBase64 = newBase64.replace(/^data:image\/\w+;base64,/, '');
      return {cleanBase64,mime:'image/png'};
  } catch (err) {
    console.error('Error adding noise:', err);
    throw err;
  }
}

 async generateVideo(imageBytes: string, videoprompt: string, aspectRatio?: string,apiKey?:string): Promise<any> {
    try {
      console.log('🎬 Starting Veo 3.1 video generation...');

      const videoObject =
        imageBytes ? {
          imageBytes,
          mimeType: 'image/png',
        } : {};
      

        let ai = this.ai;
        
        if(apiKey){
          ai =new GoogleGenAI({ apiKey: apiKey});
        }

      // Step 1: Start video generation
      let operation = await ai.models.generateVideos({
        model: 'veo-3.1-generate-preview',
        prompt: videoprompt,
        config:{
          aspectRatio: aspectRatio || '9:16',
        },
        ...videoObject,
      });

      // Step 2: Poll until done
      while (!operation.done) {
        console.log('⏳ Waiting for video generation to complete...');
        await new Promise((resolve) => setTimeout(resolve, 10000));

        operation = await ai.operations.getVideosOperation({ operation });
      }

      console.log('✅ Video generation complete! Downloading...');

      // Step 3: Extract and validate video file
      const videoFile = operation.response?.generatedVideos?.[0]?.video;
      if (!videoFile) throw new Error('No video file found in operation response.');

      // Step 4: Ensure uploads directory exists
      const uploadsDir = path.resolve('uploads/videos');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }

      // Step 5: Save video locally
      const fileName = `veo_video_${Date.now()}.mp4`;
      const downloadPath = path.join(uploadsDir, fileName);
      await ai.files.download({
        file: videoFile,
        downloadPath,
      });

      console.log(`🎥 Video saved at: ${downloadPath}`);

      // Step 6: Return public URL
      const baseUrl = process.env.SERVER_URL || 'http://localhost:3000';
      const publicUrl = `${baseUrl}/uploads/videos/${fileName}`;

      return {
        success: true,
        message: 'Video generated successfully',
        fileName,
        url: publicUrl,
      };
    } catch (error) {
      console.error('❌ Error generating video:', error.message || error);
      throw error;
    }
  }

}
