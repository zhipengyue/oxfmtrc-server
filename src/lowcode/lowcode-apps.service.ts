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
import { Category } from '../categories/category.entity';
import { AppHttpRequest } from '../http-requests/http-request.entity';
import { mergeProjectConfigDataSources } from '../http-requests/http-request-draft-sync';
import { HttpRequestsService } from '../http-requests/http-requests.service';
import { newAppId, slugifyFromName } from './app-id.util';
import { AppLayoutType } from './app-layout-type.enum';
import { CanvasLayoutMode } from './canvas-layout-mode.enum';
import {
  buildCustomComponentIdMap,
  remapDraftConfig,
} from './copy-app.util';
import { buildDefaultDraftConfig, createEmptyLayout } from './default-app-config';
import {
  mergeDraftConfigPages,
  mergeInactiveLayoutBranches,
  mergeSourceDraftPages,
} from './draft-sync.util';
import { CopyAppDto } from './dto/copy-app.dto';
import { CreateAppDto } from './dto/create-app.dto';
import { LowcodeApp } from './lowcode-app.entity';
import { LowcodePage } from './lowcode-page.entity';

/** 与文档 §3.1 AppListItem 对齐 */
export interface AppListItem {
  appId: string;
  name: string;
  slug: string;
  ownerAccount: string;
  updatedAt: string;
  categoryId?: string;
  primaryLayout?: AppLayoutType;
  canvasLayoutMode?: CanvasLayoutMode;
}

export interface AppPageListItem {
  pageId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppDetailResponse {
  appId: string;
  name: string;
  categoryId: string;
  primaryLayout: AppLayoutType;
  canvasLayoutMode: CanvasLayoutMode;
  createdAt: string;
  updatedAt: string;
  pages: AppPageListItem[];
}

export interface PageDetailResponse {
  appId: string;
  pageId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  appType: AppLayoutType;
  detail: Record<string, unknown>;
}

@Injectable()
export class LowcodeAppsService {
  constructor(
    @InjectRepository(LowcodeApp)
    private readonly appRepo: Repository<LowcodeApp>,
    @InjectRepository(LowcodePage)
    private readonly pageRepo: Repository<LowcodePage>,
    @InjectRepository(Category)
    private readonly categoryRepo: Repository<Category>,
    @InjectRepository(AppHttpRequest)
    private readonly requestRepo: Repository<AppHttpRequest>,
    private readonly httpRequestsService: HttpRequestsService,
  ) {}

  async listForOwner(user: AuthPayload): Promise<AppListItem[]> {
    const rows = await this.appRepo.find({
      where: { ownerAccount: user.phone },
      order: { updatedAt: 'DESC' },
    });
    return rows.map((r) => ({
      appId: r.appId,
      name: r.name,
      slug: r.slug,
      ownerAccount: r.ownerAccount,
      updatedAt: r.updatedAt.toISOString(),
      categoryId: r.categoryId,
      primaryLayout: r.primaryLayout,
      canvasLayoutMode: r.canvasLayoutMode ?? CanvasLayoutMode.RELATIVE,
    }));
  }

  async create(dto: CreateAppDto, user: AuthPayload): Promise<{ appId: string }> {
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category || category.ownerAccount !== user.phone) {
      throw new BadRequestException('分类不存在或无权使用');
    }

    const name = dto.name.trim();
    const slug = await this.ensureUniqueSlug(user.phone, slugifyFromName(name));
    const appId = newAppId();
    const defaultPageId = randomUUID();
    const canvasLayoutMode = this.resolveCanvasLayoutMode(
      dto.primaryLayout,
      dto.canvasLayoutMode,
    );

    const draftConfig = buildDefaultDraftConfig({
      appId,
      name,
      slug,
      ownerAccount: user.phone,
      categoryId: dto.categoryId,
      primaryLayout: dto.primaryLayout,
      canvasLayoutMode,
      defaultPageId,
    });

    const app = this.appRepo.create({
      appId,
      ownerAccount: user.phone,
      name,
      slug,
      categoryId: dto.categoryId,
      primaryLayout: dto.primaryLayout,
      canvasLayoutMode,
      draftConfig,
    });
    await this.appRepo.save(app);

    const page = this.pageRepo.create({
      id: defaultPageId,
      appId,
      name: '首页',
      sortOrder: 0,
      detail: createEmptyLayout() as unknown as Record<string, unknown>,
    });
    await this.pageRepo.save(page);

    await this.httpRequestsService.ensureDefaultRequests(app);

    return { appId };
  }

  async copy(
    sourceAppId: string,
    dto: CopyAppDto,
    user: AuthPayload,
  ): Promise<{ appId: string }> {
    const sourceApp = await this.findOwnedAppOrThrow(sourceAppId, user);

    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category || category.ownerAccount !== user.phone) {
      throw new BadRequestException('分类不存在或无权使用');
    }

    const name = dto.name.trim();
    const newAppIdValue = newAppId();
    const slug = await this.ensureUniqueSlug(user.phone, slugifyFromName(name));

    const sourcePages = await this.pageRepo.find({
      where: { appId: sourceAppId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    if (sourcePages.length === 0) {
      throw new BadRequestException('源应用没有可复制的页面');
    }

    const sourceRequests = await this.requestRepo.find({
      where: { appId: sourceAppId },
      order: { createdAt: 'ASC' },
    });

    const pageIdMap = new Map<string, string>();
    for (const page of sourcePages) {
      pageIdMap.set(page.id, randomUUID());
    }

    const requestIdMap = new Map<string, string>();
    for (const row of sourceRequests) {
      requestIdMap.set(row.id, randomUUID());
    }

    const sourceDraftBase: Record<string, unknown> = {
      ...(sourceApp.draftConfig as Record<string, unknown>),
      pages: mergeSourceDraftPages(sourceApp, sourcePages),
    };

    const customComponentIdMap = buildCustomComponentIdMap(
      sourceDraftBase.customComponents,
    );

    const remappedDraft = remapDraftConfig(
      sourceDraftBase,
      {
        pageIds: pageIdMap,
        requestIds: requestIdMap,
        customComponentIds: customComponentIdMap,
      },
      {
        appId: newAppIdValue,
        name,
        slug,
        ownerAccount: user.phone,
        categoryId: dto.categoryId,
      },
    );

    const remappedPages = remappedDraft.pages as Record<string, unknown>[];

    const newPages = sourcePages.map((sourcePage) => {
      const newPageId = pageIdMap.get(sourcePage.id)!;
      const draftPage = remappedPages.find((p) => p.id === newPageId);
      const detail =
        sourceApp.primaryLayout === AppLayoutType.WEB
          ? draftPage?.pc
          : draftPage?.mobile;

      return this.pageRepo.create({
        id: newPageId,
        appId: newAppIdValue,
        name: sourcePage.name,
        sortOrder: sourcePage.sortOrder,
        detail: (detail ?? createEmptyLayout()) as Record<string, unknown>,
      });
    });

    const newRequests = sourceRequests.map((row) =>
      this.requestRepo.create({
        id: requestIdMap.get(row.id)!,
        appId: newAppIdValue,
        name: row.name,
        address: row.address,
        type: row.type,
        method: row.method,
        mqttMode: row.mqttMode,
        wsMode: row.wsMode,
        frequencyMs: row.frequencyMs,
        status: row.status,
        paramsFn: row.paramsFn,
        headersFn: row.headersFn,
        responseFn: row.responseFn,
        configText: row.configText,
      }),
    );

    const newApp = this.appRepo.create({
      appId: newAppIdValue,
      ownerAccount: user.phone,
      name,
      slug,
      categoryId: dto.categoryId,
      primaryLayout: sourceApp.primaryLayout,
      canvasLayoutMode: sourceApp.canvasLayoutMode,
      draftConfig: remappedDraft,
    });

    await this.appRepo.manager.transaction(async (em) => {
      await em.save(newApp);
      await em.save(newPages);
      if (newRequests.length > 0) {
        await em.save(newRequests);
      }
    });

    let finalDraft = mergeDraftConfigPages(newApp, newPages);
    finalDraft = mergeProjectConfigDataSources(
      { ...newApp, draftConfig: finalDraft },
      newRequests,
    );
    mergeInactiveLayoutBranches(newApp, finalDraft, remappedPages);

    const sourceEditorPageId = String(
      (sourceApp.draftConfig as Record<string, unknown>)?.editorCurrentPageId ??
        '',
    ).trim();
    if (sourceEditorPageId && pageIdMap.has(sourceEditorPageId)) {
      finalDraft.editorCurrentPageId = pageIdMap.get(sourceEditorPageId)!;
    } else if (newPages[0]) {
      finalDraft.editorCurrentPageId = newPages[0].id;
    }

    finalDraft.customComponents = remappedDraft.customComponents;
    finalDraft.theme = remappedDraft.theme;
    finalDraft.i18n = remappedDraft.i18n;
    finalDraft.publishOptions = remappedDraft.publishOptions;
    finalDraft.primaryLayout = sourceApp.primaryLayout;
    finalDraft.canvasLayoutMode = sourceApp.canvasLayoutMode;

    newApp.draftConfig = finalDraft;
    await this.appRepo.save(newApp);

    return { appId: newAppIdValue };
  }

  async getAppDetail(
    appId: string,
    user: AuthPayload,
  ): Promise<AppDetailResponse> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const pages = await this.pageRepo.find({
      where: { appId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    return {
      appId: app.appId,
      name: app.name,
      categoryId: app.categoryId,
      primaryLayout: app.primaryLayout,
      canvasLayoutMode: app.canvasLayoutMode ?? CanvasLayoutMode.RELATIVE,
      createdAt: app.createdAt.toISOString(),
      updatedAt: app.updatedAt.toISOString(),
      pages: pages.map((p) => ({
        pageId: p.id,
        name: p.name,
        sortOrder: p.sortOrder,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString(),
      })),
    };
  }

  async getPageDetail(
    appId: string,
    pageId: string,
    user: AuthPayload,
  ): Promise<PageDetailResponse> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const page = await this.pageRepo.findOne({ where: { id: pageId, appId } });
    if (!page) {
      throw new NotFoundException('页面不存在');
    }

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

  async getDraft(appId: string, user: AuthPayload): Promise<Record<string, unknown>> {
    const row = await this.findOwnedAppOrThrow(appId, user);
    const pages = await this.pageRepo.find({
      where: { appId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const draft = mergeDraftConfigPages(row, pages);
    draft.appId = row.appId;
    draft.categoryId = row.categoryId;
    draft.primaryLayout = row.primaryLayout;
    draft.canvasLayoutMode =
      row.canvasLayoutMode ?? CanvasLayoutMode.RELATIVE;
    return draft;
  }

  private resolveCanvasLayoutMode(
    primaryLayout: AppLayoutType,
    canvasLayoutMode?: CanvasLayoutMode,
  ): CanvasLayoutMode {
    if (primaryLayout === AppLayoutType.MOBILE) {
      return CanvasLayoutMode.RELATIVE;
    }
    return canvasLayoutMode ?? CanvasLayoutMode.RELATIVE;
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

  private async ensureUniqueSlug(
    ownerAccount: string,
    baseSlug: string,
  ): Promise<string> {
    let candidate = baseSlug;
    let n = 1;
    while (
      await this.appRepo.findOne({ where: { ownerAccount, slug: candidate } })
    ) {
      candidate = `${baseSlug}-${n++}`;
    }
    return candidate;
  }
}
