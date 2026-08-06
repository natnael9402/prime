import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';

export interface R2FileInfo {
  key: string;
  url: string;
  size: number;
  lastModified: string | null;
}

@Injectable()
export class R2Service {
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;
  private readonly logger = new Logger(R2Service.name);

  constructor(private readonly configService: ConfigService) {
    const accountId = this.configService.getOrThrow<string>('CLOUDFLARE_R2_ACCOUNT_ID');
    const accessKeyId = this.configService.getOrThrow<string>('CLOUDFLARE_R2_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.getOrThrow<string>('CLOUDFLARE_R2_SECRET_ACCESS_KEY');

    this.bucketName = this.configService.getOrThrow<string>('CLOUDFLARE_R2_BUCKET_NAME');
    // Base public URL of the bucket (custom domain or r2.dev), no trailing slash.
    this.publicUrl = this.configService
      .getOrThrow<string>('CLOUDFLARE_R2_PUBLIC_URL')
      .replace(/\/+$/, '');

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /** Upload a buffer and return its public CDN URL. */
  async uploadFile(fileBuffer: Buffer, fileName: string, mimetype: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
      Body: fileBuffer,
      ContentType: mimetype,
      // Cache aggressively — file names are unique per upload.
      CacheControl: 'public, max-age=31536000, immutable',
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Uploaded ${fileName} to R2.`);
      return `${this.publicUrl}/${fileName}`;
    } catch (error) {
      this.logger.error(`Failed to upload ${fileName} to R2:`, error);
      throw error;
    }
  }

  async deleteFile(fileName: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: fileName,
    });

    try {
      await this.s3Client.send(command);
      this.logger.log(`Deleted ${fileName} from R2.`);
    } catch (error) {
      this.logger.error(`Failed to delete ${fileName} from R2:`, error);
      throw error;
    }
  }

  /** List objects in the bucket (optionally under a folder prefix), capped at maxItems. */
  async listFiles(prefix?: string, maxItems = 300): Promise<R2FileInfo[]> {
    const out: R2FileInfo[] = [];
    let token: string | undefined;
    do {
      const res = await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.bucketName,
          Prefix: prefix ? `${prefix}/` : undefined,
          MaxKeys: 300,
          ContinuationToken: token,
        }),
      );
      for (const obj of res.Contents || []) {
        if (!obj.Key || obj.Key.endsWith('/')) continue;
        out.push({
          key: obj.Key,
          url: `${this.publicUrl}/${obj.Key}`,
          size: obj.Size || 0,
          lastModified: obj.LastModified ? obj.LastModified.toISOString() : null,
        });
      }
      token = res.IsTruncated ? res.NextContinuationToken : undefined;
    } while (token && out.length < maxItems);
    return out.slice(0, maxItems);
  }
}
