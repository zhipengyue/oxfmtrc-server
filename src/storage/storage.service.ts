import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AuthPayload } from '../auth/auth.service';
import { MinioService } from './minio.service';

export interface UploadedObjectInfo {
  key: string;
  bucket: string;
  url: string;
  size: number;
  mimeType: string;
  originalName: string;
  expiresIn?: number;
}

export interface StorageResourceItem {
  key: string;
  bucket: string;
  url: string;
  size: number;
  mimeType: string;
  originalName: string;
  lastModified: string;
  expiresIn?: number;
}

export interface StorageResourceList {
  list: StorageResourceItem[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class StorageService {
  private readonly maxUploadBytes: number;
  private readonly usePublicUrl: boolean;

  constructor(
    private readonly minio: MinioService,
    private readonly config: ConfigService,
  ) {
    this.maxUploadBytes = parseInt(
      this.config.get<string>('MINIO_MAX_UPLOAD_BYTES', String(100 * 1024 * 1024)),
      10,
    );
    this.usePublicUrl =
      this.config.get<string>('MINIO_USE_PUBLIC_URL', 'true') === 'true';
  }

  async upload(
    user: AuthPayload,
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadedObjectInfo> {
    this.ensureReady();
    if (!file || !file.buffer?.length) {
      throw new BadRequestException('请选择要上传的文件');
    }
    if (file.size > this.maxUploadBytes) {
      throw new BadRequestException(
        `文件大小不能超过 ${Math.floor(this.maxUploadBytes / 1024 / 1024)}MB`,
      );
    }

    const key = this.buildObjectKey(user.phone, file.originalname, folder);
    const mimeType = file.mimetype || 'application/octet-stream';

    await this.minio.uploadObject(key, file.buffer, file.size, {
      'Content-Type': mimeType,
      'X-Amz-Meta-Original-Name': encodeURIComponent(file.originalname),
      'X-Amz-Meta-Owner-Account': user.phone,
    });

    return this.buildObjectInfo(key, file.size, mimeType, file.originalname);
  }

  async getAccessUrl(user: AuthPayload, key: string): Promise<{ url: string; expiresIn?: number }> {
    this.ensureReady();
    this.assertOwnedKey(user.phone, key);

    if (this.usePublicUrl) {
      return { url: this.minio.buildPublicUrl(key) };
    }

    const expiresIn = this.minio.getPresignedExpires();
    const url = await this.minio.getPresignedUrl(key, expiresIn);
    return { url, expiresIn };
  }

  async remove(user: AuthPayload, key: string): Promise<void> {
    this.ensureReady();
    this.assertOwnedKey(user.phone, key);
    await this.minio.removeObject(key);
  }

  async list(
    user: AuthPayload,
    page = 1,
    pageSize = 20,
    folder?: string,
  ): Promise<StorageResourceList> {
    this.ensureReady();

    const safePage = Math.max(1, page);
    const safeSize = Math.min(100, Math.max(1, pageSize));
    const prefix = this.buildListPrefix(user.phone, folder);

    const objects = (await this.minio.listObjects(prefix)).filter(
      (item) => item.name && !item.name.endsWith('/.keep'),
    );
    objects.sort(
      (a, b) =>
        (b.lastModified?.getTime() ?? 0) - (a.lastModified?.getTime() ?? 0),
    );

    const total = objects.length;
    const start = (safePage - 1) * safeSize;
    const slice = objects.slice(start, start + safeSize);

    const list = await Promise.all(
      slice.map(async (item) => this.toResourceItem(item.name!, item.size, item.lastModified)),
    );

    return {
      list,
      total,
      page: safePage,
      pageSize: safeSize,
    };
  }

  private buildListPrefix(ownerAccount: string, folder?: string): string {
    const safeOwner = this.safeOwnerAccount(ownerAccount);
    const parts = [`uploads/${safeOwner}`];
    const safeFolder = folder?.trim().replace(/^\/+|\/+$/g, '');
    if (safeFolder) {
      parts.push(
        ...safeFolder
          .split('/')
          .map((p) => this.sanitizePathSegment(p))
          .filter(Boolean),
      );
    }
    return `${parts.join('/')}/`;
  }

  private async toResourceItem(
    key: string,
    size: number,
    lastModified?: Date,
  ): Promise<StorageResourceItem> {
    let mimeType = this.guessMimeType(key);
    let originalName = this.guessOriginalName(key);

    try {
      const stat = await this.minio.statObject(key);
      if (stat.metaData) {
        const meta = stat.metaData as Record<string, string>;
        const rawName =
          meta['x-amz-meta-original-name'] ??
          meta['X-Amz-Meta-Original-Name'];
        if (rawName) {
          originalName = decodeURIComponent(rawName);
        }
        const contentType = meta['content-type'] ?? meta['Content-Type'];
        if (contentType) {
          mimeType = contentType;
        }
      }
      if (stat.size > 0) {
        size = stat.size;
      }
    } catch {
      // 列表展示不阻断
    }

    const urlInfo = await this.buildAccessUrl(key);
    return {
      key,
      bucket: this.minio.getBucket(),
      url: urlInfo.url,
      size,
      mimeType,
      originalName,
      lastModified: (lastModified ?? new Date()).toISOString(),
      expiresIn: urlInfo.expiresIn,
    };
  }

  private async buildAccessUrl(
    key: string,
  ): Promise<{ url: string; expiresIn?: number }> {
    if (this.usePublicUrl) {
      return { url: this.minio.buildPublicUrl(key) };
    }
    const expiresIn = this.minio.getPresignedExpires();
    const url = await this.minio.getPresignedUrl(key, expiresIn);
    return { url, expiresIn };
  }

  private guessOriginalName(key: string): string {
    const fileName = key.split('/').pop() ?? key;
    const match = fileName.match(
      /^[0-9a-f-]{36}-(.+)\.([a-zA-Z0-9]{1,8})$/i,
    );
    if (match) {
      return `${match[1]}.${match[2]}`;
    }
    return fileName;
  }

  private guessMimeType(key: string): string {
    const ext = this.extractExtension(key.split('/').pop() ?? key);
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      mp4: 'video/mp4',
      webm: 'video/webm',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      pdf: 'application/pdf',
      json: 'application/json',
      txt: 'text/plain',
      css: 'text/css',
      js: 'text/javascript',
    };
    return map[ext] ?? 'application/octet-stream';
  }

  private safeOwnerAccount(ownerAccount: string): string {
    return ownerAccount.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  private buildObjectKey(
    ownerAccount: string,
    originalName: string,
    folder?: string,
  ): string {
    const safeOwner = this.safeOwnerAccount(ownerAccount);
    const ext = this.extractExtension(originalName);
    const baseName = this.sanitizeFilename(originalName);
    const date = new Date().toISOString().slice(0, 10);
    const id = randomUUID();
    const fileName = ext ? `${id}-${baseName}.${ext}` : `${id}-${baseName}`;
    const parts = ['uploads', safeOwner];
    const safeFolder = folder?.trim().replace(/^\/+|\/+$/g, '');
    if (safeFolder) {
      parts.push(...safeFolder.split('/').map((p) => this.sanitizePathSegment(p)).filter(Boolean));
    }
    parts.push(date, fileName);
    return parts.join('/');
  }

  private async buildObjectInfo(
    key: string,
    size: number,
    mimeType: string,
    originalName: string,
  ): Promise<UploadedObjectInfo> {
    if (this.usePublicUrl) {
      return {
        key,
        bucket: this.minio.getBucket(),
        url: this.minio.buildPublicUrl(key),
        size,
        mimeType,
        originalName,
      };
    }

    const expiresIn = this.minio.getPresignedExpires();
    const url = await this.minio.getPresignedUrl(key, expiresIn);
    return {
      key,
      bucket: this.minio.getBucket(),
      url,
      size,
      mimeType,
      originalName,
      expiresIn,
    };
  }

  private assertOwnedKey(ownerAccount: string, key: string): void {
    const safeOwner = this.safeOwnerAccount(ownerAccount);
    const prefix = `uploads/${safeOwner}/`;
    if (!key.startsWith(prefix)) {
      throw new ForbiddenException('无权访问该文件');
    }
  }

  private sanitizeFilename(name: string): string {
    const base = name.replace(/\.[^.]+$/, '');
    const cleaned = base
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    return cleaned || 'file';
  }

  private sanitizePathSegment(segment: string): string {
    return segment
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private extractExtension(name: string): string {
    const match = name.trim().match(/\.([a-zA-Z0-9]{1,8})$/);
    return match ? match[1].toLowerCase() : '';
  }

  private ensureReady(): void {
    if (!this.minio.isReady()) {
      throw new ServiceUnavailableException('对象存储服务暂不可用，请检查 MinIO 配置');
    }
  }
}
