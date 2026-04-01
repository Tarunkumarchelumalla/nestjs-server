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
  
  async processMultipleImages(imageUrls: string[], noiseIntensity: number = 1): Promise<Array<{ url: string; base64?: string; error?: string;success?: boolean }>> {
    const results: Array<{ url: string; base64?: string; error?: string;success?: boolean }> = [];
    
    for (const url of imageUrls) {
      try {
        // Download the image
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        const imageBuffer = Buffer.from(response.data, 'binary');
        
        // Convert to base64
        const base64 = `data:${response.headers['content-type']};base64,${imageBuffer.toString('base64')}`;
        
        // Add noise
        const processedImage = await this.addNoise(base64, noiseIntensity);
        
        const result: { url: string; base64: string;success?: boolean } = {
          url,
          base64: `${processedImage.base64}`,
          success: true
        };
        results.push(result);
      } catch (error) {
        console.error(`Error processing image ${url}:`, error);
        const result: { url: string; error: string;success?: boolean } = {
          url,
          error: `Failed to process image: ${error.message}`,
          success: false
        };
        results.push(result);
      }
    }
    
    return results;
  }


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

  console.log("Incoming productImages:", inputPayload.productImages);

  // ✅ Get image dimensions safely
  async function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status}`);
      }

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

  // ✅ Convert URL → Base64 safely
  async function urlToBase64(url: string, mime: string) {
    try {
      const res = await fetch(url);

      if (!res.ok) {
        throw new Error(`Fetch failed: ${res.status}`);
      }

      const buffer = await res.arrayBuffer();
      return `data:${mime};base64,${Buffer.from(buffer).toString("base64")}`;
    } catch (err) {
      console.error("Base64 conversion failed:", url, err);
      return null;
    }
  }

  // ✅ Main handler
  const handleImage = async (url: string, mime: string = "image/png") => {
    try {
      const { width, height } = await getImageDimensions(url);
      console.log("Checked:", url, "→", width, height);

      // Optional validation (enable if needed)
      // if (width < 512 || height < 512) {
      //   invalidImages.push(url);
      // }

      return await urlToBase64(url, mime);
    } catch (err) {
      console.error("handleImage failed:", url, err);
      return null;
    }
  };

  // ✅ Process product images
  const productImagesBase64 = await Promise.all(
    (inputPayload.productImages || []).map(async (img: any) => {
      try {
        const url = typeof img === "string" ? img : img?.url;

        if (!url) {
          console.warn("Invalid image input:", img);
          return null;
        }

        const mime = this.getMimeFromUrl(url) || "image/png";

        return await handleImage(url, mime);
      } catch (err) {
        console.error("Image processing failed:", img, err);
        return null;
      }
    })
  );

  // ✅ Remove failed/null images
  const filteredProductImages = productImagesBase64.filter(Boolean);

  // ✅ Process logo
  let logoBase64 = "";
  if (inputPayload.logo_url) {
    try {
      const mime = this.getMimeFromUrl(inputPayload.logo_url) || "image/png";
      const result = await handleImage(inputPayload.logo_url, mime);
      logoBase64 = result || "";
    } catch (err) {
      console.error("Logo processing failed:", err);
    }
  }

  // ✅ Clean payload
  const {
    category,
    phone_number,
    address,
    highlight_area,
    website,
    design_req,
    logo_url,
    productImages,
    ...rest
  } = inputPayload;

  const newPayload = {
    category: category,
    phone_number: phone_number || "",
    address: address || "",
    highlight_area: highlight_area || "",
    website: website || "",
    logo_url: logoBase64,
    product_images: filteredProductImages,
    ...rest,
  };

  console.log("FINAL BASE64 IMAGES COUNT:", filteredProductImages.length);

  // ✅ API Call
  const response = await axios.post(
    "https://n8n.cinqa.space/webhook/7cfd8f0f-2d73-4ca8-8c1d-99cb4812b46b",
    newPayload,
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  return { status: "success", response: response.data };
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
  const mimeMatch = base64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';

  console.log({
    base64
  })
  
  let img;

  // 🔒 Only protect loadImage
  try {
    img = await loadImage(base64);
  } catch (err) {
    // 🚨 loadImage failed → return original safely
    return {
      cleanBase64: base64.split(',')[1],
      mime,
      base64
    };
  }

  // ✅ Continue normal processing if image loaded
  const canvas = createCanvas(img.width, img.height);
  const ctx = canvas.getContext('2d');

  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  const pixels = imageData.data;

  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i]     = Math.min(255, Math.max(0, pixels[i]     + (Math.floor(Math.random() * (2 * intensity + 1)) - intensity)));
    pixels[i + 1] = Math.min(255, Math.max(0, pixels[i + 1] + (Math.floor(Math.random() * (2 * intensity + 1)) - intensity)));
    pixels[i + 2] = Math.min(255, Math.max(0, pixels[i + 2] + (Math.floor(Math.random() * (2 * intensity + 1)) - intensity)));
  }

  ctx.putImageData(imageData, 0, 0);

  const newBase64 =
    mime === 'image/jpeg'
      ? canvas.toDataURL('image/jpeg', 0.95)
      : canvas.toDataURL('image/png');

  return {
    cleanBase64: newBase64.split(',')[1],
    mime: mime === 'image/jpeg' ? 'image/jpeg' : 'image/png',
    base64: newBase64
  };
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
