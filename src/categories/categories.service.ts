import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { Category } from './category.entity';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';

export interface CategoryItem {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    private readonly audit: AuditService,
  ) {}

  private ownerKey(user: AuthPayload): string {
    return user.sub;
  }

  async list(user: AuthPayload): Promise<CategoryItem[]> {
    const rows = await this.categoryRepo.find({
      where: { ownerAccount: this.ownerKey(user) },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toItem(r));
  }

  async create(
    dto: CreateCategoryDto,
    user: AuthPayload,
  ): Promise<CategoryItem> {
    const name = dto.name.trim();
    const ownerAccount = this.ownerKey(user);
    const dup = await this.categoryRepo.findOne({
      where: { ownerAccount, name },
    });
    if (dup) {
      throw new ConflictException('该分类名称已存在');
    }
    const row = this.categoryRepo.create({
      ownerAccount,
      name,
    });
    const saved = await this.categoryRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.CATEGORY,
      action: 'create_category',
      targetId: saved.id,
      targetName: saved.name,
      summary: `创建应用分类「${saved.name}」`,
    });
    return this.toItem(saved);
  }

  async update(
    id: string,
    dto: UpdateCategoryDto,
    user: AuthPayload,
  ): Promise<CategoryItem> {
    const row = await this.findOwnedOrThrow(id, user);
    const name = dto.name.trim();
    if (name !== row.name) {
      const dup = await this.categoryRepo.findOne({
        where: { ownerAccount: this.ownerKey(user), name },
      });
      if (dup) {
        throw new ConflictException('该分类名称已存在');
      }
    }
    row.name = name;
    const saved = await this.categoryRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.CATEGORY,
      action: 'update_category',
      targetId: saved.id,
      targetName: saved.name,
      summary: `保存应用分类「${saved.name}」`,
    });
    return this.toItem(saved);
  }

  async remove(id: string, user: AuthPayload): Promise<void> {
    const row = await this.findOwnedOrThrow(id, user);
    const name = row.name;
    await this.categoryRepo.remove(row);
    this.audit.record({
      user,
      type: AuditType.DELETE,
      resource: AuditResource.CATEGORY,
      action: 'delete_category',
      targetId: id,
      targetName: name,
      summary: `删除应用分类「${name}」`,
    });
  }

  private async findOwnedOrThrow(
    id: string,
    user: AuthPayload,
  ): Promise<Category> {
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('分类不存在');
    }
    if (row.ownerAccount !== this.ownerKey(user)) {
      throw new ForbiddenException('无权操作该分类');
    }
    return row;
  }

  private toItem(row: Category): CategoryItem {
    return {
      id: row.id,
      name: row.name,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
