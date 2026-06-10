import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FileService } from '../files/files.service';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import axios from 'axios';
import * as readline from 'readline';

@Injectable()
export class BatchProcessingService {
  private readonly logger = new Logger(BatchProcessingService.name);
  private readonly openai: OpenAI;
  private readonly supabase: SupabaseClient;

  constructor(
    private readonly configService: ConfigService,
    private readonly fileService: FileService,
  ) {
    this.openai = new OpenAI({
      apiKey: this.configService.get<string>('SHOPIFY_OPENAI_API_KEY') || 
              this.configService.get<string>('OPENAI_API_KEY'),
    });

    this.supabase = createClient(
      this.configService.get<string>('SHOPIFY_SUPABASE_URL') || 
        this.configService.get<string>('SUPABASE_URL') || '',
      this.configService.get<string>('SHOPIFY_SUPABASE_SERVICE_ROLE_KEY') || 
        this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || 
        this.configService.get<string>('SUPABASE_KEY') || '',
    );
  }

  /**
   * Main entry point to process a batch job
   */
  async processBatchJob(batchId: string, batchType: 'image' | 'content', jobId?: string): Promise<void> {
    this.logger.log(`Starting to process batch job: batchId=${batchId}, type=${batchType}`);

    // 1. Update batch status in Supabase to 'processing'
    await this.updateBatchWorkerStatus(batchId, 'processing', {
      processing_started_at: new Date().toISOString(),
    });

    try {
      // 2. Retrieve batch details from OpenAI to get the output file ID
      const batch = await this.openai.batches.retrieve(batchId);
      this.logger.log(`Retrieved batch ${batchId} status from OpenAI: ${batch.status}`);

      if (batch.status !== 'completed') {
        throw new Error(`OpenAI batch is not completed. Current status: ${batch.status}`);
      }

      const outputFileId = batch.output_file_id;
      if (!outputFileId) {
        throw new Error(`Batch ${batchId} completed but has no output_file_id`);
      }

      // 3. Download and process the output JSONL file line-by-line (memory-safe)
      const stats = await this.downloadAndProcessJsonl(outputFileId, batchType);

      // 4. Update the batch worker status upon completion
      const finalStatus = stats.failedCount > 0 
        ? (stats.successCount > 0 ? 'partial_failed' : 'failed')
        : 'completed';

      await this.updateBatchWorkerStatus(batchId, finalStatus, {
        processed_at: new Date().toISOString(),
        output_file_id: outputFileId,
        metadata: {
          success_count: stats.successCount,
          failed_count: stats.failedCount,
          total_processed: stats.successCount + stats.failedCount,
        },
      });

      this.logger.log(`Finished processing batch job ${batchId}. Status: ${finalStatus}. Stats: ${JSON.stringify(stats)}`);

    } catch (error) {
      this.logger.error(`Error processing batch job ${batchId}: ${error.message}`, error.stack);
      
      // Update batch status to failed
      await this.updateBatchWorkerStatus(batchId, 'failed', {
        last_error: error.message,
        processed_at: new Date().toISOString(),
      });

      throw error;
    }
  }

  /**
   * Download the JSONL output file and stream it line-by-line
   */
  private async downloadAndProcessJsonl(
    fileId: string,
    batchType: 'image' | 'content'
  ): Promise<{ successCount: number; failedCount: number }> {
    const url = `https://api.openai.com/v1/files/${fileId}/content`;
    const apiKey = this.configService.get<string>('OPENAI_API_KEY');

    this.logger.log(`Downloading file ${fileId} from OpenAI as stream...`);

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      responseType: 'stream',
    });

    const rl = readline.createInterface({
      input: response.data,
      crlfDelay: Infinity,
    });

    let successCount = 0;
    let failedCount = 0;
    let lineNumber = 0;

    for await (const line of rl) {
      lineNumber++;
      if (!line.trim()) continue;

      try {
        const parsedLine = JSON.parse(line);
        
        if (batchType === 'image') {
          await this.processImageBatchLine(parsedLine);
        } else {
          await this.processContentBatchLine(parsedLine);
        }
        
        successCount++;
      } catch (err) {
        failedCount++;
        this.logger.error(`Error processing line ${lineNumber} in file ${fileId}: ${err.message}`, err.stack);
      }
    }

    return { successCount, failedCount };
  }

  /**
   * Process a single line from an Image Edit batch output
   */
  private async processImageBatchLine(line: any): Promise<void> {
    const customId = line.custom_id; // e.g. "img-edit-uuid"
    if (!customId) {
      throw new Error(`Line is missing custom_id`);
    }

    const itemId = customId.replace('img-edit-', '');
    this.logger.log(`Processing image result for itemId=${itemId}`);

    // Check if the item has been cancelled in the database
    const { data: itemData } = await this.supabase
      .from('processing_job_items')
      .select('stage')
      .eq('id', itemId)
      .single();

    if (itemData?.stage === 'cancelled') {
      this.logger.log(`Item ${itemId} is cancelled. Skipping processing.`);
      return;
    }

    // Check if line contains request level error
    if (line.error) {
      const errorMsg = typeof line.error === 'object' ? JSON.stringify(line.error) : String(line.error);
      await this.updateItemStatusAndError(itemId, 'image', 'failed', errorMsg);
      return;
    }

    const responseBody = line.response?.body;
    if (line.response?.status_code >= 400 || !responseBody) {
      const errorMsg = responseBody?.error?.message || `OpenAI returned status code ${line.response?.status_code}`;
      await this.updateItemStatusAndError(itemId, 'image', 'failed', errorMsg);
      return;
    }

    const b64Json = responseBody.data?.[0]?.b64_json;
    if (!b64Json) {
      await this.updateItemStatusAndError(itemId, 'image', 'failed', 'OpenAI response body is missing b64_json');
      return;
    }

    // Upload base64 to Cloudinary immediately
    this.logger.log(`Uploading base64 image to Cloudinary for itemId=${itemId}...`);
    const base64Payload = `data:image/png;base64,${b64Json}`;
    const uploadResult = await this.fileService.uploadToCloudinaryFromBase64(base64Payload, 'shopify_uploads');
    
    this.logger.log(`Uploaded to Cloudinary successfully. URL: ${uploadResult.url}`);

    // Update processing_job_items with the completed status and Cloudinary URL
    const { data: updatedItem, error: updateError } = await this.supabase
      .from('processing_job_items')
      .update({
        image_result_status: 'completed',
        output_image_url: uploadResult.url,
        image_processed_at: new Date().toISOString(),
        image_result_error: null,
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(`Failed to update item ${itemId} with image result: ${updateError.message}`);
    }

    // Sync image URL back to products table
    const productId = updatedItem.product_id;
    if (productId) {
      await this.supabase
        .from('products')
        .update({
          product_image: uploadResult.url,
        })
        .eq('id', productId);
    }

    // Check if both content and image processing are completed
    await this.checkAndFinalizeItem(itemId, updatedItem);
  }

  /**
   * Process a single line from a Content Generation batch output
   */
  private async processContentBatchLine(line: any): Promise<void> {
    const customId = line.custom_id; // e.g. "content-gen-uuid"
    if (!customId) {
      throw new Error(`Line is missing custom_id`);
    }

    const itemId = customId.replace('content-gen-', '');
    this.logger.log(`Processing content result for itemId=${itemId}`);

    // Check if the item has been cancelled in the database
    const { data: itemData } = await this.supabase
      .from('processing_job_items')
      .select('stage')
      .eq('id', itemId)
      .single();

    if (itemData?.stage === 'cancelled') {
      this.logger.log(`Item ${itemId} is cancelled. Skipping processing.`);
      return;
    }

    // Check if line contains request level error
    if (line.error) {
      const errorMsg = typeof line.error === 'object' ? JSON.stringify(line.error) : String(line.error);
      await this.updateItemStatusAndError(itemId, 'content', 'failed', errorMsg);
      return;
    }

    const responseBody = line.response?.body;
    if (line.response?.status_code >= 400 || !responseBody) {
      const errorMsg = responseBody?.error?.message || `OpenAI returned status code ${line.response?.status_code}`;
      await this.updateItemStatusAndError(itemId, 'content', 'failed', errorMsg);
      return;
    }

    const content = responseBody.choices?.[0]?.message?.content;
    if (!content) {
      await this.updateItemStatusAndError(itemId, 'content', 'failed', 'OpenAI response body is missing message content');
      return;
    }

    // Clean markdown syntax from response if any (e.g. ```json ... ```)
    const cleanedJsonString = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    let contentData: any;
    try {
      contentData = JSON.parse(cleanedJsonString);
    } catch (err) {
      await this.updateItemStatusAndError(itemId, 'content', 'failed', `Failed to parse generated content JSON: ${err.message}`);
      return;
    }

    // Update processing_job_items with completed content status
    const { data: updatedItem, error: updateError } = await this.supabase
      .from('processing_job_items')
      .update({
        content_result_status: 'completed',
        content_processed_at: new Date().toISOString(),
        content_result_error: null,
      })
      .eq('id', itemId)
      .select('*')
      .single();

    if (updateError) {
      throw new Error(`Failed to update item ${itemId} with content result: ${updateError.message}`);
    }

    // Update products table with generated content details
    const productId = updatedItem.product_id;
    if (productId) {
      const bulletFeaturesStr = Array.isArray(contentData.key_bullet_features)
        ? JSON.stringify(contentData.key_bullet_features)
        : (typeof contentData.key_bullet_features === 'string' ? contentData.key_bullet_features : '[]');

      await this.supabase
        .from('products')
        .update({
          product_title: contentData.product_title || '',
          html_description: contentData.html_description || '',
          key_bullet_features: bulletFeaturesStr,
          tags: contentData.tags || '',
          product_type: contentData.product_type || '',
          seo_title: contentData.seo_title || '',
          seo_description: contentData.seo_description || '',
        })
        .eq('id', productId);
    }

    // Check if both content and image processing are completed
    await this.checkAndFinalizeItem(itemId, updatedItem);
  }

  /**
   * Helper to check if both image and content results are completed, and finalize the item
   */
  private async checkAndFinalizeItem(itemId: string, item: any): Promise<void> {
    const isImageDone = item.image_result_status === 'completed';
    const isContentDone = item.content_result_status === 'completed';

    if (isImageDone && isContentDone) {
      this.logger.log(`Both image and content processing completed for itemId=${itemId}. Finalizing item.`);
      
      // Update item stage to completed
      await this.supabase
        .from('processing_job_items')
        .update({
          stage: 'completed',
          progress: 100,
          status_label: 'Batch processing completed',
          completed_at: new Date().toISOString(),
        })
        .eq('id', itemId);

      // Update product status to completed
      if (item.product_id) {
        await this.supabase
          .from('products')
          .update({
            status: 'completed',
          })
          .eq('id', item.product_id);
      }
    } else {
      const statusLabel = `Image: ${item.image_result_status} | Content: ${item.content_result_status}`;
      
      await this.supabase
        .from('processing_job_items')
        .update({
          status_label: statusLabel,
          progress: 50, // partial completion progress
        })
        .eq('id', itemId);
    }
  }

  /**
   * Helper to handle line failures by updating the job item's error columns
   */
  private async updateItemStatusAndError(
    itemId: string,
    type: 'image' | 'content',
    status: 'failed',
    errorMessage: string
  ): Promise<void> {
    this.logger.warn(`Failure reported for itemId=${itemId}, type=${type}: ${errorMessage}`);

    const updates: any = {};
    if (type === 'image') {
      updates.image_result_status = status;
      updates.image_result_error = errorMessage;
      updates.image_processed_at = new Date().toISOString();
    } else {
      updates.content_result_status = status;
      updates.content_result_error = errorMessage;
      updates.content_processed_at = new Date().toISOString();
    }

    // Also update parent item to error stage
    updates.stage = 'error';
    updates.status_label = `Batch processing failed: ${type} error`;
    updates.error = errorMessage;
    updates.completed_at = new Date().toISOString();

    const { data: updatedItem } = await this.supabase
      .from('processing_job_items')
      .update(updates)
      .eq('id', itemId)
      .select('*')
      .single();

    // Also update product status to error
    if (updatedItem?.product_id) {
      await this.supabase
        .from('products')
        .update({
          status: 'processing', // keep it in processing so it can be retried/fixed
        })
        .eq('id', updatedItem.product_id);
    }
  }

  /**
   * Helper to update status in openai_batches table
   */
  private async updateBatchWorkerStatus(batchId: string, status: string, additionalFields: any = {}): Promise<void> {
    const { error } = await this.supabase
      .from('openai_batches')
      .update({
        worker_status: status,
        ...additionalFields,
        updated_at: new Date().toISOString(),
      })
      .eq('batch_id', batchId);

    if (error) {
      this.logger.error(`Failed to update openai_batches table for batchId=${batchId}: ${error.message}`);
    }
  }
}
