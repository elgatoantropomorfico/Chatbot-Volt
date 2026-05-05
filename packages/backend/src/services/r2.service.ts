import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
  type ListObjectsV2CommandOutput,
  type _Object,
} from '@aws-sdk/client-s3';
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

    const publicUrl = env.R2_PUBLIC_URL
      ? `${env.R2_PUBLIC_URL}/${key}`
      : `https://${env.R2_BUCKET_NAME}.${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${key}`;

    console.log(`📤 Uploaded to R2: ${key} → ${publicUrl}`);
    return publicUrl;
  }

  /**
   * Delete every object under a given key prefix. Used to clean up all media
   * for a lead (`{tenantId}/{leadId}/`) when the lead is deleted, so files
   * don't accumulate orphaned in R2.
   * Returns the number of deleted objects (0 if R2 isn't configured).
   */
  static async deleteByPrefix(prefix: string): Promise<number> {
    const client = getClient();
    if (!client) {
      console.warn('⚠️ R2 not configured — cannot delete prefix', prefix);
      return 0;
    }

    let deleted = 0;
    let continuationToken: string | undefined = undefined;

    do {
      const listed: ListObjectsV2CommandOutput = await client.send(new ListObjectsV2Command({
        Bucket: env.R2_BUCKET_NAME,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }));

      const objects: string[] = (listed.Contents || [])
        .map((o: _Object) => o.Key)
        .filter((k: string | undefined): k is string => !!k);

      if (objects.length > 0) {
        await client.send(new DeleteObjectsCommand({
          Bucket: env.R2_BUCKET_NAME,
          Delete: {
            Objects: objects.map((Key: string) => ({ Key })),
            Quiet: true,
          },
        }));
        deleted += objects.length;
      }

      continuationToken = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (continuationToken);

    if (deleted > 0) {
      console.log(`🧹 Deleted ${deleted} R2 object(s) under prefix "${prefix}"`);
    }
    return deleted;
  }

  /**
   * Delete a single object by its public URL (best-effort: parses the key
   * out of the URL using R2_PUBLIC_URL or the default R2 endpoint).
   */
  static async deleteByUrl(url: string): Promise<boolean> {
    const client = getClient();
    if (!client) return false;

    let key: string | null = null;
    if (env.R2_PUBLIC_URL && url.startsWith(env.R2_PUBLIC_URL + '/')) {
      key = url.slice(env.R2_PUBLIC_URL.length + 1);
    } else {
      const match = url.match(/r2\.cloudflarestorage\.com\/(.+)$/);
      if (match) key = match[1];
    }
    if (!key) return false;

    try {
      await client.send(new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      }));
      return true;
    } catch (err) {
      console.warn(`⚠️ Failed to delete R2 object ${key}:`, err);
      return false;
    }
  }
}
