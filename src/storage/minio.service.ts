import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as Minio from 'minio';

@Injectable()
export class MinioService implements OnModuleInit {
  private readonly logger = new Logger(MinioService.name);
  private client: Minio.Client | null = null;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly presignedExpires: number;
  private readonly usePublicUrl: boolean;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'visual-assets');
    this.publicBaseUrl = this.config
      .get<string>('MINIO_PUBLIC_BASE_URL', 'http://127.0.0.1:9000')
      .replace(/\/$/, '');
    this.presignedExpires = parseInt(
      this.config.get<string>('MINIO_PRESIGNED_EXPIRES', '3600'),
      10,
    );
    this.usePublicUrl =
      this.config.get<string>('MINIO_USE_PUBLIC_URL', 'true') === 'true';
  }

  async onModuleInit(): Promise<void> {
    const endPoint = this.config.get<string>('MINIO_ENDPOINT', '127.0.0.1');
    const port = parseInt(this.config.get<string>('MINIO_PORT', '9000'), 10);
    const useSSL = this.config.get<string>('MINIO_USE_SSL', 'false') === 'true';
    const accessKey = this.config.get<string>('MINIO_ACCESS_KEY', 'minioadmin');
    const secretKey = this.config.get<string>('MINIO_SECRET_KEY', 'minioadmin');

    this.client = new Minio.Client({
      endPoint,
      port,
      useSSL,
      accessKey,
      secretKey,
    });

    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        await this.client.makeBucket(this.bucket, 'us-east-1');
        this.logger.log(`Created MinIO bucket: ${this.bucket}`);
      }
      if (this.usePublicUrl) {
        await this.ensurePublicReadPolicy();
      }
      this.logger.log(
        `MinIO connected (${useSSL ? 'https' : 'http'}://${endPoint}:${port}, bucket=${this.bucket}, publicUrl=${this.usePublicUrl})`,
      );
    } catch (error) {
      this.logger.error(
        `MinIO init failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  getBucket(): string {
    return this.bucket;
  }

  isReady(): boolean {
    return this.client !== null;
  }

  async uploadObject(
    key: string,
    buffer: Buffer,
    size: number,
    meta: Record<string, string>,
  ): Promise<void> {
    const client = this.requireClient();
    await client.putObject(this.bucket, key, buffer, size, meta);
  }

  async removeObject(key: string): Promise<void> {
    const client = this.requireClient();
    await client.removeObject(this.bucket, key);
  }

  /** 创建目录占位对象（MinIO 无真实目录，用 .keep 标记前缀） */
  async ensureDirectory(prefix: string): Promise<void> {
    const client = this.requireClient();
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const keepKey = `${normalized}.keep`;
    await client.putObject(this.bucket, keepKey, Buffer.from(''), 0, {
      'Content-Type': 'application/octet-stream',
    });
  }

  /** 删除前缀下全部对象（含子路径） */
  async removeObjectsByPrefix(prefix: string): Promise<void> {
    const client = this.requireClient();
    const objects = await this.listObjects(prefix);
    const keys = objects.map((item) => item.name).filter(Boolean) as string[];
    if (keys.length === 0) return;
    await client.removeObjects(this.bucket, keys);
  }

  async listObjects(prefix: string): Promise<Minio.BucketItem[]> {
    const client = this.requireClient();
    const items: Minio.BucketItem[] = [];

    return new Promise((resolve, reject) => {
      const stream = client.listObjectsV2(this.bucket, prefix, true);
      stream.on('data', (item) => {
        if (item.name && !item.prefix) {
          items.push(item);
        }
      });
      stream.on('error', reject);
      stream.on('end', () => resolve(items));
    });
  }

  async statObject(key: string): Promise<Minio.BucketItemStat> {
    const client = this.requireClient();
    return client.statObject(this.bucket, key);
  }

  async getPresignedUrl(key: string, expiresSec?: number): Promise<string> {
    const client = this.requireClient();
    return client.presignedGetObject(
      this.bucket,
      key,
      expiresSec ?? this.presignedExpires,
    );
  }

  buildPublicUrl(key: string): string {
    const encodedKey = key
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/');
    return `${this.publicBaseUrl}/${this.bucket}/${encodedKey}`;
  }

  getPresignedExpires(): number {
    return this.presignedExpires;
  }

  usesPublicUrl(): boolean {
    return this.usePublicUrl;
  }

  /** bucket 匿名可读，配合 buildPublicUrl 返回永不过期地址 */
  private async ensurePublicReadPolicy(): Promise<void> {
    const client = this.requireClient();
    const policy = JSON.stringify({
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${this.bucket}/*`],
        },
      ],
    });
    await client.setBucketPolicy(this.bucket, policy);
    this.logger.log(`MinIO bucket public read enabled: ${this.bucket}`);
  }

  private requireClient(): Minio.Client {
    if (!this.client) {
      throw new Error('MinIO client is not initialized');
    }
    return this.client;
  }
}
