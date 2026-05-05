import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { env } from '../config/env';
import crypto from 'crypto';

let s3Client: S3Client | null = null;

function getClient(): S3Client | null {
  if (!env.R2_ACCOUNT_ID || !env.R2_ACCESS_KEY_ID || !env.R2_SECRET_ACCESS_KEY) {
    return null;
  }
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

export class R2Service {
  /**
   * Upload a buffer to Cloudflare R2 and return the public URL.
   */
  static async upload(params: {
    buffer: Buffer;
    mimeType: string;
    tenantId: string;
    leadId: string;
    fieldKey: string;
  }): Promise<string | null> {
    const client = getClient();
    if (!client) {
      console.error('⚠️ R2 not configured — skipping upload');
      return null;
    }

    const ext = params.mimeType.split('/')[1] || 'bin';
    const hash = crypto.randomBytes(8).toString('hex');
    const key = `${params.tenantId}/${params.leadId}/${params.fieldKey}/${hash}.${ext}`;

    await client.send(new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: params.buffer,
      ContentType: params.mimeType,
    }));

    // Build public URL
    const publicUrl = env.R2_PUBLIC_URL
      ? `${env.R2_PUBLIC_URL}/${key}`
      : `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    console.log(`📤 Uploaded to R2: ${key} → ${publicUrl}`);
    return publicUrl;
  }
}
