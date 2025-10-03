import { Injectable, BadRequestException } from '@nestjs/common';
import { createClient } from '@supabase/supabase-js';
import { v2 as cloudinary } from 'cloudinary';


@Injectable()
export class FileService {
  private supabase;

  constructor() {

    this.supabase = createClient(
      process.env.SUPABASE_URL|| "",
      process.env.SUPABASE_KEY || "",
    );

    // Cloudinary setup
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }

  async uploadToCloudinaryFromUrl(imageUrl: string, folder = 'supabase_uploads') {
    if (!imageUrl) throw new BadRequestException('No image URL provided');

    // Skip if already hosted
    if (imageUrl.includes(`res.cloudinary.com/${process.env.CLOUDINARY_CLOUD_NAME}`)) {
      return { status: 'skipped', url: imageUrl };
    }

    const result = await cloudinary.uploader.upload(imageUrl, { folder });
    return { status: 'uploaded', url: result.secure_url, publicId: result.public_id };
  }

  async uploadToCloudinaryFromBase64(base64Data: string, folder = 'supabase_uploads') {
    if (!base64Data) throw new BadRequestException('No base64 data provided');

    const result = await cloudinary.uploader.upload(base64Data, { folder });
    return { status: 'uploaded', url: result.secure_url, publicId: result.public_id };
  }

  async processHandle(handlename: string, table = 'instagram_post', column = 'displayurl') {
    const { data, error } = await this.supabase
      .from(table)
      .select(`id, ${column}`)
      .eq('handlename', handlename);

    if (error) throw error;
    if (!data || data.length === 0) {
      return { message: `No posts found for ${handlename}` };
    }

    const results:any[] = [];

    for (const row of data) {
      try {
        const result = await this.uploadToCloudinaryFromUrl(row[column]);

        if (result.status === 'uploaded') {
          await this.supabase.from(table).update({ [column]: result.url }).eq('id', row.id);
        }

        results.push({ id: row.id, ...result });
      } catch (err) {
        results.push({ id: row.id, status: 'failed', error: err.message });
      }
    }

    return { message: `Process completed for ${handlename}`, results };
  }
}
