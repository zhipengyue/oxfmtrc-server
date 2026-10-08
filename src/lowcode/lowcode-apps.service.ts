import { randomUUID } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { Category } from '../categories/category.entity';
import { User } from '../users/user.entity';
import { AppHttpRequest } from '../http-requests/http-request.entity';
import { mergeProjectConfigDataSources } from '../http-requests/http-request-draft-sync';
import { HttpRequestsService } from '../http-requests/http-requests.service';
import { newAppId, slugifyFromName } from './app-id.util';
import { AppLayoutType } from './app-layout-type.enum';
import { CanvasLayoutMode } from './canvas-layout-mode.enum';
import {
  buildCustomComponentIdMap,
  remapDraftConfig,
  remapReferencesDeep,
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
import { ProjectRuntimeSecret } from './project-runtime-secret.entity';
import { ProjectRuntimeSetting } from './project-runtime-setting.entity';
import { ProjectRuntimeSettingsStoreService } from './project-runtime-settings-store.service';
import { buildPublishedSnapshot } from './publish-snapshot.util';
import {
  ProjectAccessService,
  type ProjectAccessFlags,
} from '../tenants/project-access.service';
import { ProjectShare } from './project-share.entity';
import { ProjectSharePermission } from './project-share-permission.enum';
import { ProjectVisibility } from './project-visibility.enum';
import type { ProjectShareItemDto } from './dto/replace-project-shares.dto';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';

/** 与文档 §3.1 AppListItem 对齐 */
export interface AppListItem {
  appId: string;
  name: string;
  slug: string;
  ownerAccount: string;
  ownerPhone?: string;
  ownerDisplayName?: string;
  updatedAt: string;
  categoryId?: string;
  primaryLayout?: AppLayoutType;
  canvasLayoutMode?: CanvasLayoutMode;
  coverUrl?: string;
  visibility: ProjectVisibility;
  relation: ProjectAccessFlags['relation'];
  canEditContent: boolean;
  canManageProject: boolean;
  canManageSharing: boolean;
  /** 已分享给多少名成员（所有者视角） */
  shareCount?: number;
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
  coverUrl?: string;
  visibility: ProjectVisibility;
  relation: ProjectAccessFlags['relation'];
  canEditContent: boolean;
  canManageProject: boolean;
  canManageSharing: boolean;
  pages: AppPageListItem[];
}

export interface ProjectShareItem {
  memberPhone: string;
  permission: ProjectSharePermission;
}

export interface PageDetailResponse {
  appId: string;
  pageId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  revision: number;
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
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly httpRequestsService: HttpRequestsService,
    private readonly runtimeSettingsStore: ProjectRuntimeSettingsStoreService,
    private readonly projectAccess: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async listForOwner(user: AuthPayload): Promise<AppListItem[]> {
    // 列表只读取摘要。草稿、发布快照和发布历史可能非常大，参与排序会
    // 消耗大量 MySQL sort buffer，甚至导致整个项目列表查询失败。
    const rows = await this.projectAccess.findVisibleApps(user, this.appRepo);
    const ownerIds = [...new Set(rows.map((r) => r.ownerAccount))];
    const owners = ownerIds.length
      ? await this.userRepo.find({
          where: { id: In(ownerIds) },
          select: { id: true, phone: true, displayName: true },
        })
      : [];
    const ownerMap = new Map(owners.map((o) => [o.id, o]));
    const shareCounts = await this.projectAccess.shareCountsForApps(
      rows.map((r) => r.appId),
    );
    const items: AppListItem[] = [];
    for (const r of rows) {
      const access = await this.projectAccess.resolveAccess(user, r);
      if (!access.canView) continue;
      const owner = ownerMap.get(r.ownerAccount);
      items.push({
        appId: r.appId,
        name: r.name,
        slug: r.slug,
        ownerAccount: r.ownerAccount,
        ownerPhone: owner?.phone || undefined,
        ownerDisplayName:
          (owner?.displayName || '').trim() || owner?.phone || undefined,
        updatedAt: r.updatedAt.toISOString(),
        categoryId: r.categoryId,
        primaryLayout: r.primaryLayout,
        canvasLayoutMode: r.canvasLayoutMode ?? CanvasLayoutMode.RELATIVE,
        coverUrl: r.coverUrl ?? undefined,
        visibility: r.visibility ?? ProjectVisibility.PRIVATE,
        relation: access.relation,
        canEditContent: access.canEditContent,
        canManageProject: access.canManageProject,
        canManageSharing: access.canManageSharing,
        shareCount: shareCounts.get(r.appId) ?? 0,
      });
    }
    return items;
  }

  async create(dto: CreateAppDto, user: AuthPayload): Promise<{ appId: string }> {
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category || category.ownerAccount !== user.sub) {
      throw new BadRequestException('分类不存在或无权使用');
    }

    const name = dto.name.trim();
    const slug = await this.ensureUniqueSlug(user.sub, slugifyFromName(name));
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
      ownerAccount: user.sub,
      categoryId: dto.categoryId,
      primaryLayout: dto.primaryLayout,
      canvasLayoutMode,
      defaultPageId,
    });

    const app = this.appRepo.create({
      appId,
      ownerAccount: user.sub,
      visibility: ProjectVisibility.PRIVATE,
      name,
      slug,
      categoryId: dto.categoryId,
      primaryLayout: dto.primaryLayout,
      canvasLayoutMode,
      draftConfig,
      publishedConfig: null,
      coverUrl: null,
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

    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.APP,
      action: 'create_app',
      targetId: appId,
      targetName: name,
      summary: `创建项目「${name}」`,
    });

    return { appId };
  }

  async copy(
    sourceAppId: string,
    dto: CopyAppDto,
    user: AuthPayload,
  ): Promise<{ appId: string }> {
    const { app: sourceApp } = await this.findAppOrThrow(sourceAppId, user, 'view');

    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category || category.ownerAccount !== user.sub) {
      throw new BadRequestException('分类不存在或无权使用');
    }

    const name = dto.name.trim();
    const newAppIdValue = newAppId();
    const slug = await this.ensureUniqueSlug(user.sub, slugifyFromName(name));

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

    const sourceRuntimeSettings = await this.runtimeSettingsStore.read(sourceApp.appId);
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
        ownerAccount: user.sub,
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
        autoRequest: row.autoRequest,
        status: row.status,
        paramsFn: row.paramsFn,
        headersFn: row.headersFn,
        responseFn: row.responseFn,
        configText: row.configText,
      }),
    );

    const newApp = this.appRepo.create({
      appId: newAppIdValue,
      ownerAccount: user.sub,
      visibility: ProjectVisibility.PRIVATE,
      name,
      slug,
      categoryId: dto.categoryId,
      primaryLayout: sourceApp.primaryLayout,
      canvasLayoutMode: sourceApp.canvasLayoutMode,
      coverUrl: sourceApp.coverUrl,
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
    delete newApp.draftConfig.runtimeSettings;
    await this.appRepo.save(newApp);
    if (sourceRuntimeSettings) {
      await this.runtimeSettingsStore.save(
        newAppIdValue,
        remapReferencesDeep(sourceRuntimeSettings, {
          pageIds: pageIdMap,
          requestIds: requestIdMap,
          customComponentIds: customComponentIdMap,
        }) as Record<string, unknown>,
        user,
      );
    }

    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.APP,
      action: 'copy_app',
      targetId: newAppIdValue,
      targetName: name,
      summary: `复制项目为「${name}」（源：${sourceAppId}）`,
    });

    return { appId: newAppIdValue };
  }

  async getAppDetail(
    appId: string,
    user: AuthPayload,
  ): Promise<AppDetailResponse> {
    const { app, access } = await this.findAppOrThrow(appId, user, 'view');
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
      coverUrl: app.coverUrl ?? undefined,
      visibility: app.visibility ?? ProjectVisibility.PRIVATE,
      relation: access.relation,
      canEditContent: access.canEditContent,
      canManageProject: access.canManageProject,
      canManageSharing: access.canManageSharing,
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
    const { app } = await this.findAppOrThrow(appId, user, 'view');
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
      revision: Number(page.revision ?? 0),
      appType: app.primaryLayout,
      detail: page.detail,
    };
  }

  async getDraft(appId: string, user: AuthPayload): Promise<Record<string, unknown>> {
    const { app: row } = await this.findAppOrThrow(appId, user, 'view');
    const pages = await this.pageRepo.find({
      where: { appId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });
    const draft = mergeDraftConfigPages(row, pages);
    delete draft.runtimeSettings;
    draft.appId = row.appId;
    draft.categoryId = row.categoryId;
    draft.primaryLayout = row.primaryLayout;
    draft.canvasLayoutMode =
      row.canvasLayoutMode ?? CanvasLayoutMode.RELATIVE;
    return draft;
  }

  async publish(
    appId: string,
    note: string,
    user: AuthPayload,
  ): Promise<Record<string, unknown>> {
    const { app: row } = await this.findAppOrThrow(appId, user, 'manage');
    const draft = await this.getDraft(appId, user);
    const runtimeSettings = await this.runtimeSettingsStore.read(appId);
    const published = buildPublishedSnapshot(
      runtimeSettings ? { ...draft, runtimeSettings } : draft,
      note,
    );
    const previous = row.publishedConfig;
    const previousVersion = String(previous?.version ?? '').trim();
    row.publishedConfig = published;
    row.publishedHistory = {
      ...(row.publishedHistory ?? {}),
      ...(previous && previousVersion ? { [previousVersion]: previous } : {}),
      [String(published.version)]: published,
    };
    row.draftConfig = {
      ...row.draftConfig,
      version: published.version,
      currentDraftVersion: published.currentDraftVersion,
      publishedVersions: published.publishedVersions,
      updatedAt: published.updatedAt,
    };
    await this.appRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.APP,
      action: 'publish_app',
      targetId: appId,
      targetName: row.name,
      summary: `发布项目「${row.name}」${note ? `：${note}` : ''}`,
    });
    return published;
  }

  async getPublicPublished(
    account: string,
    appId: string,
    version?: string,
  ): Promise<Record<string, unknown>> {
    const owner = String(account ?? '').trim();
    const id = String(appId ?? '').trim();
    const ver = String(version ?? '').trim();
    if (!owner || !id) {
      throw new NotFoundException('应用不存在');
    }
    const row = await this.appRepo.findOne({ where: { appId: id } });
    if (!row || row.ownerAccount !== owner || !row.publishedConfig) {
      throw new NotFoundException('应用不存在');
    }
    if (!ver) return row.publishedConfig;
    const historical = row.publishedHistory?.[ver];
    if (historical) return historical;
    if (String(row.publishedConfig.version ?? '') === ver) return row.publishedConfig;
    throw new NotFoundException('应用不存在');
  }

  async setDefaultPublished(
    appId: string,
    version: string,
    user: AuthPayload,
  ): Promise<Record<string, unknown>> {
    const { app: row } = await this.findAppOrThrow(appId, user, 'manage');
    const ver = version.trim();
    const snapshot = row.publishedHistory?.[ver] ?? (
      String(row.publishedConfig?.version ?? '') === ver ? row.publishedConfig : null
    );
    if (!snapshot) {
      throw new NotFoundException('版本不存在');
    }
    const versions = Array.isArray(row.draftConfig.publishedVersions)
      ? (row.draftConfig.publishedVersions as Array<Record<string, unknown>>)
      : [];
    row.publishedConfig = snapshot;
    row.draftConfig = {
      ...row.draftConfig,
      version: ver,
      publishedVersions: versions.map((item) => ({
        ...item,
        isDefault: item.version === ver,
      })),
    };
    await this.appRepo.save(row);
    return snapshot;
  }

  async removePublishedVersion(
    appId: string,
    version: string,
    user: AuthPayload,
  ): Promise<void> {
    const { app: row } = await this.findAppOrThrow(appId, user, 'manage');
    const ver = version.trim();
    const versions = Array.isArray(row.draftConfig.publishedVersions)
      ? (row.draftConfig.publishedVersions as Array<Record<string, unknown>>)
      : [];
    if (versions.length <= 1) {
      throw new BadRequestException('至少保留一个版本');
    }
    const current = versions.find((item) => item.version === ver);
    if (current?.isDefault || String(row.publishedConfig?.version ?? '') === ver) {
      throw new BadRequestException('当前版本不可删除，请先将其他版本设为当前');
    }
    const history = { ...(row.publishedHistory ?? {}) };
    delete history[ver];
    row.publishedHistory = history;
    row.draftConfig = {
      ...row.draftConfig,
      publishedVersions: versions.filter((item) => item.version !== ver),
    };
    await this.appRepo.save(row);
  }

  async saveDraft(
    appId: string,
    snapshot: Record<string, unknown>,
    user: AuthPayload,
  ): Promise<Record<string, unknown>> {
    const { app: row, access } = await this.findAppOrThrow(appId, user, 'edit');
    const pages = await this.pageRepo.find({
      where: { appId },
      order: { sortOrder: 'ASC', createdAt: 'ASC' },
    });

    // 项目设置属于独立表，整份页面草稿携带的同名字段始终忽略。
    const { runtimeSettings: _ignoredRuntimeSettings, ...pageSnapshot } = snapshot;
    // 项目标识和创建时选定的画布模式不可由客户端草稿改写。
    row.draftConfig = {
      ...pageSnapshot,
      appId: row.appId,
      ownerAccount: row.ownerAccount,
      categoryId: row.categoryId,
      primaryLayout: row.primaryLayout,
      canvasLayoutMode: row.canvasLayoutMode,
      updatedAt: new Date().toISOString(),
    };
    // 主端页面以 lowcode_pages 为准，非主端分支仍可保存在完整草稿中。
    row.draftConfig.pages = mergeSourceDraftPages(row, pages);
    if (access.canManageProject) {
      const nextName = String(snapshot.name ?? '').trim();
      if (nextName) row.name = nextName.slice(0, 200);
    } else {
      row.draftConfig.name = row.name;
    }
    await this.appRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.APP,
      action: 'save_draft',
      targetId: appId,
      targetName: row.name,
      summary: `保存项目草稿「${row.name}」`,
    });
    return this.getDraft(appId, user);
  }

  async saveCover(
    appId: string,
    coverDataUrl: string,
    user: AuthPayload,
  ): Promise<{ coverUrl: string }> {
    const { app: row } = await this.findAppOrThrow(appId, user, 'edit');
    row.coverUrl = coverDataUrl;
    await this.appRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.APP,
      action: 'save_cover',
      targetId: appId,
      targetName: row.name,
      summary: `保存项目封面「${row.name}」`,
    });
    return { coverUrl: row.coverUrl };
  }

  async remove(appId: string, user: AuthPayload): Promise<void> {
    const { app } = await this.findAppOrThrow(appId, user, 'manage');
    const name = app.name;
    await this.appRepo.manager.transaction(async (em) => {
      await em.delete(LowcodePage, { appId });
      await em.delete(AppHttpRequest, { appId });
      await em.delete(ProjectRuntimeSecret, { appId });
      await em.delete(ProjectRuntimeSetting, { appId });
      await em.delete(ProjectShare, { appId });
      await em.remove(app);
    });
    this.audit.record({
      user,
      type: AuditType.DELETE,
      resource: AuditResource.APP,
      action: 'delete_app',
      targetId: appId,
      targetName: name,
      summary: `删除项目「${name}」`,
    });
  }

  async updateMeta(
    appId: string,
    dto: { name: string; categoryId: string },
    user: AuthPayload,
  ): Promise<{ appId: string; name: string; categoryId: string }> {
    const { app: row } = await this.findAppOrThrow(appId, user, 'manage');
    const category = await this.categoryRepo.findOne({
      where: { id: dto.categoryId },
    });
    if (!category || category.ownerAccount !== user.sub) {
      throw new BadRequestException('分类不存在或无权使用');
    }

    const name = dto.name.trim();
    if (!name) {
      throw new BadRequestException('应用名称不能为空');
    }

    row.name = name.slice(0, 200);
    row.categoryId = dto.categoryId;
    row.draftConfig = {
      ...row.draftConfig,
      name: row.name,
      categoryId: row.categoryId,
      updatedAt: new Date().toISOString(),
    };
    await this.appRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.APP,
      action: 'update_app_meta',
      targetId: appId,
      targetName: row.name,
      summary: `更新项目「${row.name}」名称/分类`,
    });
    return {
      appId: row.appId,
      name: row.name,
      categoryId: row.categoryId,
    };
  }

  async updateVisibility(
    appId: string,
    visibility: ProjectVisibility,
    user: AuthPayload,
  ): Promise<{ visibility: ProjectVisibility }> {
    const { app } = await this.findAppOrThrow(appId, user, 'sharing');
    const actor = await this.projectAccess.resolveActor(user);
    if (!actor.tenantId && visibility === ProjectVisibility.TENANT_PUBLIC) {
      throw new BadRequestException('个人账号项目不能设为企业内公开');
    }
    app.visibility = visibility;
    await this.appRepo.save(app);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.SHARE,
      action: 'update_visibility',
      targetId: appId,
      targetName: app.name,
      summary: `将项目「${app.name}」设为${visibility === ProjectVisibility.TENANT_PUBLIC ? '企业内公开' : '私有'}`,
    });
    return { visibility: app.visibility };
  }

  async listShares(appId: string, user: AuthPayload): Promise<ProjectShareItem[]> {
    await this.findAppOrThrow(appId, user, 'sharing');
    const rows = await this.projectAccess.listShares(appId);
    return rows.map((row) => ({
      memberPhone: row.memberPhone,
      permission: row.permission,
    }));
  }

  async replaceShares(
    appId: string,
    shares: ProjectShareItemDto[],
    user: AuthPayload,
  ): Promise<ProjectShareItem[]> {
    const { app } = await this.findAppOrThrow(appId, user, 'sharing');
    const actor = await this.projectAccess.resolveActor(user);
    if (!actor.tenantId) {
      throw new BadRequestException('个人账号项目不支持成员分享');
    }
    const normalized = shares.map((item) => ({
      memberPhone: item.memberPhone.trim(),
      permission: item.permission,
    }));
    await this.projectAccess.assertMembersInTenant(
      normalized.map((item) => item.memberPhone),
      actor.tenantId,
      actor.phone,
    );
    const rows = await this.projectAccess.replaceShares(appId, normalized);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.SHARE,
      action: 'replace_shares',
      targetId: appId,
      targetName: app.name,
      summary: `更新项目「${app.name}」分享名单（${rows.length} 人）`,
    });
    return rows.map((row) => ({
      memberPhone: row.memberPhone,
      permission: row.permission,
    }));
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

  private async findAppOrThrow(
    appId: string,
    user: AuthPayload,
    mode: 'view' | 'edit' | 'manage' | 'sharing',
  ): Promise<{ app: LowcodeApp; access: ProjectAccessFlags }> {
    const app = await this.projectAccess.requireApp(this.appRepo, appId);
    let access: ProjectAccessFlags;
    if (mode === 'view') access = await this.projectAccess.assertCanView(user, app);
    else if (mode === 'edit') access = await this.projectAccess.assertCanEditContent(user, app);
    else if (mode === 'sharing') access = await this.projectAccess.assertCanManageSharing(user, app);
    else access = await this.projectAccess.assertCanManageProject(user, app);
    return { app, access };
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
