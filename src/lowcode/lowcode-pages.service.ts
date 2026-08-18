import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { createEmptyLayout } from './default-app-config';
import { mergeDraftConfigPages } from './draft-sync.util';
import { CreatePageDto, RenamePageDto, ReorderPagesDto, SavePageDetailDto } from './dto/page.dto';
import { LowcodeApp } from './lowcode-app.entity';
import { LowcodePage } from './lowcode-page.entity';
import type { AppPageListItem, PageDetailResponse } from './lowcode-apps.service';

@Injectable()
export class LowcodePagesService {
  constructor(
    @InjectRepository(LowcodeApp)
    private readonly appRepo: Repository<LowcodeApp>,
    @InjectRepository(LowcodePage)
    private readonly pageRepo: Repository<LowcodePage>,
  ) {}

  async createPage(
    appId: string,
    dto: CreatePageDto,
    user: AuthPayload,
  ): Promise<AppPageListItem> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const existing = await this.pageRepo.find({ where: { appId } });
    const sortOrder = existing.length;
    const name =
      dto.name?.trim() || `页面 ${existing.length + 1}`;

    const page = this.pageRepo.create({
      id: randomUUID(),
      appId,
      name,
      sortOrder,
      detail: createEmptyLayout() as unknown as Record<string, unknown>,
    });
    await this.pageRepo.save(page);
    await this.syncDraft(app);

    return this.toPageItem(page);
  }

  async renamePage(
    appId: string,
    pageId: string,
    dto: RenamePageDto,
    user: AuthPayload,
  ): Promise<AppPageListItem> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const page = await this.findPageOrThrow(appId, pageId);
    page.name = dto.name.trim();
    await this.pageRepo.save(page);
    await this.syncDraft(app);
    return this.toPageItem(page);
  }

  async savePageDetail(
    appId: string,
    pageId: string,
    dto: SavePageDetailDto,
    user: AuthPayload,
  ): Promise<PageDetailResponse> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const page = await this.findPageOrThrow(appId, pageId);
    page.detail = dto.detail;
    await this.pageRepo.save(page);
    await this.syncDraft(app);
    return this.toPageDetail(app, page);
  }

  async deletePage(
    appId: string,
    pageId: string,
    user: AuthPayload,
  ): Promise<void> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const pages = await this.listPages(appId);
    if (pages.length <= 1) {
      throw new BadRequestException('至少保留一个页面');
    }
    const page = await this.findPageOrThrow(appId, pageId);
    await this.pageRepo.remove(page);

    const remaining = pages.filter((p) => p.id !== pageId);
    for (let i = 0; i < remaining.length; i++) {
      remaining[i].sortOrder = i;
    }
    await this.pageRepo.save(remaining);
    await this.syncDraft(app, remaining);
  }

  async reorderPages(
    appId: string,
    dto: ReorderPagesDto,
    user: AuthPayload,
  ): Promise<{ pages: AppPageListItem[] }> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const pages = await this.listPages(appId);

    if (dto.pageIds.length !== pages.length) {
      throw new BadRequestException('pageIds 须包含该应用下的全部页面');
    }
    if (new Set(dto.pageIds).size !== dto.pageIds.length) {
      throw new BadRequestException('pageIds 不能重复');
    }

    const idSet = new Set(pages.map((p) => p.id));
    for (const id of dto.pageIds) {
      if (!idSet.has(id)) {
        throw new BadRequestException('pageIds 含有不属于该应用的页面');
      }
    }

    const byId = new Map(pages.map((p) => [p.id, p]));
    const reordered: LowcodePage[] = [];
    for (let i = 0; i < dto.pageIds.length; i++) {
      const page = byId.get(dto.pageIds[i])!;
      page.sortOrder = i;
      reordered.push(page);
    }
    await this.pageRepo.save(reordered);
    await this.syncDraft(app, reordered);

    return {
      pages: reordered.map((p) => this.toPageItem(p)),
    };
  }

  private async syncDraft(
    app: LowcodeApp,
    pages?: LowcodePage[],
  ): Promise<void> {
    const list = pages ?? (await this.listPages(app.appId));
    app.draftConfig = mergeDraftConfigPages(app, list);
    await this.appRepo.save(app);
  }

  private async listPages(appId: string): Promise<LowcodePage[]> {
    return this.pageRepo.find({
      where: { appId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
  }

  private async findPageOrThrow(
    appId: string,
    pageId: string,
  ): Promise<LowcodePage> {
    const page = await this.pageRepo.findOne({ where: { id: pageId, appId } });
    if (!page) {
      throw new NotFoundException('页面不存在');
    }
    return page;
  }

  private async findOwnedAppOrThrow(
    appId: string,
    user: AuthPayload,
  ): Promise<LowcodeApp> {
    const row = await this.appRepo.findOne({ where: { appId } });
    if (!row) {
      throw new NotFoundException('应用不存在');
    }
    if (row.ownerAccount !== user.phone) {
      throw new ForbiddenException('无权访问该应用');
    }
    return row;
  }

  private toPageItem(page: LowcodePage): AppPageListItem {
    return {
      pageId: page.id,
      name: page.name,
      sortOrder: page.sortOrder,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  private toPageDetail(
    app: LowcodeApp,
    page: LowcodePage,
  ): PageDetailResponse {
    return {
      appId: app.appId,
      pageId: page.id,
      name: page.name,
      sortOrder: page.sortOrder,
      createdAt: page.createdAt.toISOString(),
      updatedAt: page.updatedAt.toISOString(),
      appType: app.primaryLayout,
      detail: page.detail,
    };
  }
}
