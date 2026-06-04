import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as https from 'https';

@Injectable()
export class R2UploadService {
  private readonly accountId = process.env.R2_ACCOUNT_ID;
  private readonly accessKey = process.env.R2_ACCESS_KEY;
  private readonly secretKey = process.env.R2_SECRET_KEY;
  private readonly bucket = process.env.R2_BUCKET;
  private readonly publicUrl = process.env.R2_PUBLIC_URL;

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
      canonicalHeaders, signedHeaders, payloadHash
    ].join('\n');

    const credentialScope = `${dateOnly}/${region}/${service}/aws4_request`;
    const stringToSign = [
      'AWS4-HMAC-SHA256', amzDate, credentialScope,
      this.sha256Hex(canonicalRequest)
    ].join('\n');

    const kDate    = this.hmac(`AWS4${this.secretKey}`, dateOnly);
    const kRegion  = this.hmac(kDate, region);
    const kService = this.hmac(kRegion, service);
    const kSigning = this.hmac(kService, 'aws4_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

    return {
      uploadUrl: `https://${host}${canonicalUri}`,
      headers: {
        'Content-Type': contentType,
        'Authorization': `AWS4-HMAC-SHA256 Credential=${this.accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
        'x-amz-date': amzDate,
        'x-amz-content-sha256': payloadHash,
        'Content-Length': String(body.length),
      }
    };
  }

  private putToR2(uploadUrl: string, body: Buffer, headers: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = new URL(uploadUrl);
      const req = https.request(
        { hostname: url.hostname, path: url.pathname, method: 'PUT', headers },
        (res:any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            res.resume();
            resolve();
          } else {
            const chunks: Buffer[] = [];
            res.on('data', c => chunks.push(c));
            res.on('end', () =>
              reject(new Error(`R2 ${res.statusCode}: ${Buffer.concat(chunks).toString()}`))
            );
          }
        }
      );
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  }

  async upload(imageBase64: string, mimeType: string, chatId: string, messageId: string) {
    const mime = mimeType.split(';')[0];
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const r2Key = `wa-images/${chatId}/${messageId}.${ext}`;
    const body = Buffer.from(imageBase64, 'base64');

    const { uploadUrl, headers } = this.buildSignedHeaders(r2Key, body, mime);
    await this.putToR2(uploadUrl, body, headers);

    return {
      url: `${this.publicUrl}/${r2Key}`,
      r2_key: r2Key,
    };
  }
}