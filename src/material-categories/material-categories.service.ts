import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { MinioService } from '../storage/minio.service';
import {
  MATERIAL_CATEGORY_KEEP_FILE,
  materialCategoryPrefix,
  slugifyMaterialCategory,
} from '../storage/storage-path.util';
import { CreateMaterialCategoryDto } from './dto/create-material-category.dto';
import { MaterialCategory } from './material-category.entity';

export interface MaterialCategoryItem {
  id: string;
  name: string;
  slug: string;
  bucket: string;
  objectPrefix: string;
  assetCount: number;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class MaterialCategoriesService {
  constructor(
    @InjectRepository(MaterialCategory)
    private readonly categoryRepo: Repository<MaterialCategory>,
    private readonly minio: MinioService,
  ) {}

  async list(user: AuthPayload): Promise<MaterialCategoryItem[]> {
    const rows = await this.categoryRepo.find({
      where: { ownerAccount: user.phone },
      order: { createdAt: 'ASC' },
    });
    return Promise.all(rows.map((row) => this.toItem(row)));
  }

  async create(
    dto: CreateMaterialCategoryDto,
    user: AuthPayload,
  ): Promise<MaterialCategoryItem> {
    this.ensureMinioReady();

    const name = dto.name.trim();
    const dupName = await this.categoryRepo.findOne({
      where: { ownerAccount: user.phone, name },
    });
    if (dupName) {
      throw new ConflictException('该素材分类名称已存在');
    }

    const slug = await this.ensureUniqueSlug(user.phone, slugifyMaterialCategory(name));
    const prefix = materialCategoryPrefix(user.phone, slug);

    await this.minio.ensureDirectory(prefix);

    const row = this.categoryRepo.create({
      ownerAccount: user.phone,
      name,
      slug,
    });
    const saved = await this.categoryRepo.save(row);
    return this.toItem(saved);
  }

  async remove(id: string, user: AuthPayload): Promise<void> {
    this.ensureMinioReady();
    const row = await this.findOwnedOrThrow(id, user);
    const prefix = materialCategoryPrefix(user.phone, row.slug);
    await this.minio.removeObjectsByPrefix(prefix);
    await this.categoryRepo.remove(row);
  }

  async resolveFolderByCategoryId(
    user: AuthPayload,
    categoryId: string,
  ): Promise<string> {
    const row = await this.findOwnedOrThrow(categoryId, user);
    return row.slug;
  }

  async findOwnedOrThrow(
    id: string,
    user: AuthPayload,
  ): Promise<MaterialCategory> {
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('素材分类不存在');
    }
    if (row.ownerAccount !== user.phone) {
      throw new ForbiddenException('无权操作该素材分类');
    }
    return row;
  }

  private async ensureUniqueSlug(
    ownerAccount: string,
    baseSlug: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let n = 1;
    while (
      await this.categoryRepo.findOne({
        where: { ownerAccount, slug: candidate },
      })
    ) {
      candidate = `${baseSlug}-${n++}`;
    }
    return candidate;
  }

  private async toItem(row: MaterialCategory): Promise<MaterialCategoryItem> {
    const prefix = materialCategoryPrefix(row.ownerAccount, row.slug);
    let assetCount = 0;
    if (this.minio.isReady()) {
      const objects = await this.minio.listObjects(prefix);
      assetCount = objects.filter(
        (item) => item.name && !item.name.endsWith(`/${MATERIAL_CATEGORY_KEEP_FILE}`),
      ).length;
    }

    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      bucket: this.minio.getBucket(),
      objectPrefix: prefix,
      assetCount,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private ensureMinioReady(): void {
    if (!this.minio.isReady()) {
      throw new ServiceUnavailableException('对象存储服务暂不可用，请检查 MinIO 配置');
    }
  }
}
