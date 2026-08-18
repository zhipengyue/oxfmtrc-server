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
  ) {}

  async list(user: AuthPayload): Promise<CategoryItem[]> {
    const rows = await this.categoryRepo.find({
      where: { ownerAccount: user.phone },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toItem(r));
  }

  async create(
    dto: CreateCategoryDto,
    user: AuthPayload,
  ): Promise<CategoryItem> {
    const name = dto.name.trim();
    const dup = await this.categoryRepo.findOne({
      where: { ownerAccount: user.phone, name },
    });
    if (dup) {
      throw new ConflictException('该分类名称已存在');
    }
    const row = this.categoryRepo.create({
      ownerAccount: user.phone,
      name,
    });
    const saved = await this.categoryRepo.save(row);
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
        where: { ownerAccount: user.phone, name },
      });
      if (dup) {
        throw new ConflictException('该分类名称已存在');
      }
    }
    row.name = name;
    const saved = await this.categoryRepo.save(row);
    return this.toItem(saved);
  }

  async remove(id: string, user: AuthPayload): Promise<void> {
    const row = await this.findOwnedOrThrow(id, user);
    await this.categoryRepo.remove(row);
  }

  private async findOwnedOrThrow(
    id: string,
    user: AuthPayload,
  ): Promise<Category> {
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) {
      throw new NotFoundException('分类不存在');
    }
    if (row.ownerAccount !== user.phone) {
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
