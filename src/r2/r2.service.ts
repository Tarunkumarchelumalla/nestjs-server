import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as https from 'https';

const GRAPH_VERSION = 'v21.0';
const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // WhatsApp doc max is 100MB

@Injectable()
export class R2UploadService {
  private readonly accountId = process.env.R2_ACCOUNT_ID;
  private readonly accessKey = process.env.R2_ACCESS_KEY;
  private readonly secretKey = process.env.R2_SECRET_KEY;
  private readonly bucket = process.env.R2_BUCKET;
  private readonly publicUrl = process.env.R2_PUBLIC_URL;

  private static readonly EXT_MAP: Record<string, string> = {
    // Images
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    // Audio
    'audio/ogg': 'ogg',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
    'audio/aac': 'aac',
    'audio/amr': 'amr',
    'audio/opus': 'opus',
    // Video
    'video/mp4': 'mp4',
    'video/3gpp': '3gp',
    // Documents
    'application/pdf': 'pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/msword': 'doc',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.ms-powerpoint': 'ppt',
    'text/plain': 'txt',
    'text/csv': 'csv',
    'application/zip': 'zip',
    'application/x-rar-compressed': 'rar',
    'application/json': 'json',
  };

  private hmac(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  private sha256Hex(data: Buffer | string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  private buildSignedHeaders(objectKey: string, body: Buffer, contentType: string) {
    const host = `${this.accountId}.r2.cloudflarestorage.com`;
    const now = new Date();
    const amzDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const dateOnly = amzDate.substring(0, 8);
    const region = 'auto';
    const service = 's3';

    const payloadHash = this.sha256Hex(body);
    const canonicalUri = `/${this.bucket}/${objectKey}`;
    const canonicalHeaders =
      `content-type:${contentType}\n` +
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      'PUT', canonicalUri, '',
      canonicalHeaders, signedHeaders, payloadHash,
    ].join('\n');

    const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credentialScope,
      this.sha256Hex(canonicalRequest),
    ].join('\n');

    const kDate = this.hmac(`AWS4${this.secretKey}`, dateOnly);
    const kRegion = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    const kSigning = this.hmac(kService, 'aws4_request');
    const signature = crypto
      .createHmac('sha256', kSigning)
      .update(stringToSign)
      .digest('hex');

    return {
      uploadUrl: `https://${host}${canonicalUri}`,
      headers: {
        'Content-Type': contentType,
        'Authorization': `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Content-Length': String(body.length),
      },
    };
  }

  private putToR2(
    uploadUrl: string,
    body: Buffer,
    headers: Record<string, string>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(uploadUrl);
      const req = https.request(
        { hostname: url.hostname, path: url.pathname, method: 'PUT', headers },
        (res: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            res.resume();
            resolve();
          } else {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () =>
              reject(
                new Error(
                  `R2 ${res.statusCode}: ${Buffer.concat(chunks).toString()}`,
                ),
              ),
            );
          }
        },
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  private resolveExt(mime: string, filename?: string): string {
    if (R2UploadService.EXT_MAP[mime]) return R2UploadService.EXT_MAP[mime];

    if (filename) {
      const parts = filename.split('.');
      if (parts.length > 1) return parts.pop()!.toLowerCase();
    }

    const sub = mime.split('/').pop() || 'bin';
    return sub.includes('+') ? sub.split('+')[0] : sub;
  }

  /** Shared core: sign + PUT a buffer to R2, return public URL */
  private async uploadBuffer(
    body: Buffer,
    mime: string,
    chatId: string=Math.random().toString(36).substring(2, 8),  // fallback random chatId if not provided
    messageId: string=Math.random().toString(36).substring(2, 8), // fallback random messageId if not provided
    mediaType: string,
    filename?: string,
  ) {
    const ext = this.resolveExt(mime, filename);
    const r2Key = `wa-media/${mediaType}/${chatId}/${messageId}.${ext}`;

    const { uploadUrl, headers } = this.buildSignedHeaders(r2Key, body, mime);
    await this.putToR2(uploadUrl, body, headers);

    return {
      url: `${this.publicUrl}/${r2Key}`,
      r2_key: r2Key,
      mime_type: mime,
      size_bytes: body.length,
    };
  }

  /** Legacy path: base64 arrives from n8n */
  async upload(
    mediaBase64: string,
    mimeType: string,
    chatId: string,
    messageId: string,
    mediaType: string = 'image',
    filename?: string,
  ) {
    const mime = mimeType.split(';')[0];
    const body = Buffer.from(mediaBase64, 'base64');
    return this.uploadBuffer(body, mime, chatId, messageId, mediaType, filename);
  }

  /**
   * New path: n8n sends only the WhatsApp media_id + access token.
   * Service fetches the CDN URL from Meta, downloads the binary,
   * and uploads it to R2. No base64 ever touches n8n.
   */
  async ingestFromWhatsApp(params: {
    media_id: string;
    wa_token: string;
    mime_type?: string;
    chat_id: string;
    message_id: string;
    media_type?: string;
    filename?: string;
  }) {
    const { media_id, wa_token } = params;
    const authHeaders = { Authorization: `Bearer ${wa_token}` };

    // 1. Resolve media_id -> short-lived CDN URL (valid ~5 min)
    const infoRes = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${media_id}`,
      { headers: authHeaders },
    );
    if (!infoRes.ok) {
      throw new Error(
        `Meta media lookup failed (${infoRes.status}): ${await infoRes.text()}`,
      );
    }
    const info: {
      url?: string;
      mime_type?: string;
      file_size?: number;
      sha256?: string;
    } = await infoRes.json();

    if (!info.url) throw new Error('Meta returned no media URL');
    if (info.file_size && info.file_size > MAX_MEDIA_BYTES) {
      throw new Error(`Media too large: ${info.file_size} bytes`);
    }

    // 2. Download the binary (same Bearer token is REQUIRED here too,
    //    the lookaside URL 403s without it)
    const fileRes = await fetch(info.url, { headers: authHeaders });
    if (!fileRes.ok) {
      throw new Error(`Meta media download failed (${fileRes.status})`);
    }
    const body = Buffer.from(await fileRes.arrayBuffer());

    // 3. Upload to R2
    const mime = (info.mime_type || params.mime_type || 'application/octet-stream')
      .split(';')[0];

    return this.uploadBuffer(
      body,
      mime,
      params.chat_id,
      params.message_id,
      params.media_type || 'media',
      params.filename,
    );
  }
}