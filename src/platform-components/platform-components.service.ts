import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { AccessScopeService } from '../tenants/access-scope.service';
import { UserRole } from '../tenants/user-role.enum';
import { User } from '../users/user.entity';
import {
  PlatformComponent,
  type PlatformComponentVisibility,
} from './platform-component.entity';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';
import { PlatformComponentCategory } from './platform-component-category.entity';
import {
  collapseMarketToLatestVersions,
  findPublishFamilyHead,
  nextPatchVersion,
  sameComponentSource,
  sortComponentVersions,
} from './component-versions.util';

@Injectable()
export class PlatformComponentsService {
  constructor(
    @InjectRepository(PlatformComponent)
    private readonly repo: Repository<PlatformComponent>,
    @InjectRepository(PlatformComponentCategory)
    private readonly categoryRepo: Repository<PlatformComponentCategory>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly scope: AccessScopeService,
    private readonly audit: AuditService,
  ) {}

  /** 兼容旧 GET / ：仅返回当前用户未发布私有库 */
  list(user: AuthPayload) {
    return this.listMine(user);
  }

  async listMine(user: AuthPayload): Promise<PlatformComponent[]> {
    await this.backfillMissingOwners();
    return this.repo.find({
      where: { ownerUserId: user.sub, status: 'unpublished' },
      order: { updatedAt: 'DESC' },
    });
  }

  async save(user: AuthPayload, body: Partial<PlatformComponent>) {
    const ownerScope = this.scope.resourceOwnerKey(user);
    let row = body.id
      ? await this.repo.findOne({ where: { id: body.id, ownerUserId: user.sub } })
      : null;
    if (body.id && !row) {
      // 兼容迁移前仅有 ownerScope 的草稿
      row = await this.repo.findOne({ where: { id: body.id, ownerScope } });
      if (row && row.ownerUserId && row.ownerUserId !== user.sub) {
        throw new NotFoundException('组件不存在');
      }
    }
    if (body.id && !row) throw new NotFoundException('组件不存在');
    if (row && row.status === 'published') {
      throw new BadRequestException('已发布组件请先下架再编辑');
    }

    const nextName = String(body.name ?? '').trim().slice(0, 100);
    const duplicate = await this.repo
      .createQueryBuilder('c')
      .where('c.ownerUserId = :ownerUserId', { ownerUserId: user.sub })
      .andWhere('LOWER(TRIM(c.name)) = LOWER(TRIM(:name))', { name: nextName })
      // 官方已发布组件允许创建同名草稿，用于发布新版本；普通自定义组件不允许重名。
      .andWhere("NOT (c.status = 'published' AND c.visibility = 'official')")
      .andWhere('c.id <> :id', { id: row?.id ?? '' })
      .getOne();
    if (duplicate) throw new ConflictException('你账号下已经存在同名自定义组件');

    const isCreate = !row;
    row = this.repo.create({
      ...(row ?? {}),
      ownerScope,
      ownerUserId: user.sub,
      platform: body.platform === 'mobile' ? 'mobile' : 'web',
      name: nextName,
      description: String(body.description ?? '').trim().slice(0, 300),
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
      template: String(body.template ?? ''),
      script: String(body.script ?? ''),
      style: String(body.style ?? ''),
      status: 'unpublished',
      visibility: null,
      coverDataUrl: body.coverDataUrl || row?.coverDataUrl || null,
      layoutTemplate:
        body.layoutTemplate && typeof body.layoutTemplate === 'object'
          ? body.layoutTemplate
          : row?.layoutTemplate ?? null,
      sourceMarketplaceId: row?.sourceMarketplaceId ?? null,
      publisherDisplayName: null,
      publisherCompanyName: null,
    });
    const saved = await this.repo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.COMPONENT,
      action: isCreate ? 'create_component' : 'save_component',
      targetId: saved.id,
      targetName: saved.name,
      summary: `${isCreate ? '创建' : '保存'}组件「${saved.name}」`,
    });
    return saved;
  }

  async publish(
    user: AuthPayload,
    id: string,
    visibility: PlatformComponentVisibility,
    categoryId?: string,
  ): Promise<PlatformComponent> {
    this.assertCanPublish(user, visibility);
    const row = await this.ownedDraft(user, id);
    const siblings = await this.repo.find({
      where: { status: 'published', visibility, platform: row.platform },
    });
    const head = findPublishFamilyHead(siblings, row, visibility);
    if (head && sameComponentSource(head, row)) {
      throw new BadRequestException('该组件已在组件市场中，请修改后再发布新版本');
    }
    const publisher = await this.users.findOne({ where: { id: user.sub } });
    row.status = 'published';
    row.visibility = visibility;
    row.familyId = head?.familyId || head?.id || row.familyId || row.id;
    row.version = head ? nextPatchVersion(head.version) : row.version || '1.0.0';
    if (visibility === 'official') {
      const category = categoryId
        ? await this.categoryRepo.findOne({ where: { id: categoryId } })
        : await this.ensureDefaultCategory();
      if (!category) throw new BadRequestException('官方组件分类不存在');
      row.officialCategoryId = category.id;
    } else row.officialCategoryId = null;
    row.publisherDisplayName =
      (publisher?.displayName || '').trim() || publisher?.phone || user.phone;
    row.publisherCompanyName =
      visibility === 'official'
        ? null
        : publisher?.companyName || null;
    if (visibility === 'tenant' || visibility === 'official') {
      // tenant 可见性依赖 ownerScope；official 不依赖租户
      row.ownerScope = this.scope.resourceOwnerKey(user);
    } else {
      row.ownerScope = this.scope.resourceOwnerKey(user);
    }
    const saved = await this.repo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.COMPONENT,
      action: 'publish_component',
      targetId: saved.id,
      targetName: saved.name,
      summary: `发布组件「${saved.name}」（${visibility}）`,
    });
    return saved;
  }

  async unpublish(user: AuthPayload, id: string): Promise<PlatformComponent> {
    const row = await this.repo.findOne({ where: { id, status: 'published' } });
    if (!row) throw new NotFoundException('组件不存在');
    const can =
      row.ownerUserId === user.sub ||
      (row.visibility === 'official' && user.role === UserRole.PLATFORM_ADMIN);
    if (!can) throw new ForbiddenException('无权下架该组件');
    row.status = 'unpublished';
    row.visibility = null;
    row.officialCategoryId = null;
    row.publisherDisplayName = null;
    row.publisherCompanyName = null;
    row.ownerUserId = row.ownerUserId || user.sub;
    row.ownerScope = this.scope.resourceOwnerKey(user);
    const saved = await this.repo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.COMPONENT,
      action: 'unpublish_component',
      targetId: saved.id,
      targetName: saved.name,
      summary: `下架组件「${saved.name}」`,
    });
    return saved;
  }

  async listWithdrawn(user: AuthPayload) {
    const where = user.role === UserRole.PLATFORM_ADMIN ? { status: 'withdrawn' as const } : { status: 'withdrawn' as const, ownerUserId: user.sub };
    return this.repo.find({ where, order: { withdrawnAt: 'DESC', updatedAt: 'DESC' } });
  }

  async withdraw(user: AuthPayload, id: string, reason?: string) {
    const text = String(reason ?? '').trim();
    if (!text) throw new BadRequestException('请填写下架原因');
    if (text.length > 500) throw new BadRequestException('下架原因不能超过500字');
    const row = await this.repo.findOne({ where: { id, status: 'published' } });
    if (!row) throw new NotFoundException('组件不存在或已下架');
    if (row.ownerUserId !== user.sub && user.role !== UserRole.PLATFORM_ADMIN) throw new ForbiddenException('无权下架该组件');
    row.status = 'withdrawn'; row.withdrawalReason = text; row.withdrawnAt = new Date();
    return this.repo.save(row);
  }

  async restore(user: AuthPayload, id: string) {
    const row = await this.repo.findOne({ where: { id, status: 'withdrawn' } });
    if (!row) throw new NotFoundException('已下架组件不存在');
    if (row.ownerUserId !== user.sub && user.role !== UserRole.PLATFORM_ADMIN) throw new ForbiddenException('无权恢复该组件');
    row.status = 'published'; row.withdrawalReason = null; row.withdrawnAt = null;
    return this.repo.save(row);
  }

  async deleteWithdrawn(user: AuthPayload, id: string) {
    const row = await this.repo.findOne({ where: { id, status: 'withdrawn' } });
    if (!row) throw new NotFoundException('已下架组件不存在');
    if (row.ownerUserId !== user.sub && user.role !== UserRole.PLATFORM_ADMIN) throw new ForbiddenException('无权删除该组件');
    await this.repo.remove(row);
  }

  /** 兼容旧 PATCH status */
  async setStatus(
    user: AuthPayload,
    id: string,
    status: 'published' | 'unpublished',
  ) {
    if (status === 'published') {
      const tenantId = user.activeTenantId || user.tenantId;
      const visibility: PlatformComponentVisibility =
        user.role === UserRole.PLATFORM_ADMIN
          ? 'official'
          : tenantId
            ? 'marketplace'
            : 'marketplace';
      return this.publish(user, id, visibility);
    }
    return this.unpublish(user, id);
  }

  async listMarket(user: AuthPayload): Promise<PlatformComponent[]> {
    await this.backfillMissingOwners();
    const rows = await this.marketQuery(user).orderBy('c.updatedAt', 'DESC').getMany();
    return collapseMarketToLatestVersions(rows);
  }

  async listMarketScope(
    user: AuthPayload,
    scope: string,
  ): Promise<PlatformComponent[]> {
    await this.backfillMissingOwners();
    const qb = this.marketQuery(user);
    const raw = String(scope ?? '').trim();
    if (raw === 'official') {
      qb.andWhere('c.visibility = :v', { v: 'official' });
    } else if (raw.startsWith('official-category-')) {
      qb.andWhere('c.visibility = :v', { v: 'official' }).andWhere('c.officialCategoryId = :categoryId', { categoryId: raw.slice('official-category-'.length) });
    } else if (raw === 'tenant') {
      qb.andWhere('c.visibility = :v', { v: 'tenant' });
    } else if (raw === 'marketplace') {
      qb.andWhere('c.visibility = :v', { v: 'marketplace' });
    } else if (raw.startsWith('publisher-')) {
      const key = raw.slice('publisher-'.length);
      qb.andWhere('c.visibility = :v', { v: 'marketplace' }).andWhere(
        new Brackets((w) => {
          w.where('c.ownerScope = :scope', { scope: `tenant-${key}` }).orWhere(
            'c.ownerUserId = :uid',
            { uid: key },
          );
        }),
      );
    }
    return collapseMarketToLatestVersions(await qb.orderBy('c.updatedAt', 'DESC').getMany());
  }

  async listMarketVersions(user: AuthPayload, id: string): Promise<PlatformComponent[]> {
    await this.backfillMissingOwners();
    const target = await this.repo.findOne({ where: { id, status: 'published' } });
    if (!target || !(await this.canViewMarketItem(user, target))) {
      throw new NotFoundException('组件不存在');
    }
    const rows = await this.marketQuery(user).getMany();
    const familyId = target.familyId || target.id;
    return sortComponentVersions(
      rows.filter(
        (item) =>
          item.familyId === familyId ||
          item.id === familyId ||
          (item.visibility === target.visibility &&
            item.platform === target.platform &&
            item.name.trim() === target.name.trim() &&
            (item.visibility === 'official' || item.ownerUserId === target.ownerUserId)),
      ),
    );
  }

  async useFromMarket(user: AuthPayload, id: string): Promise<PlatformComponent> {
    const source = await this.repo.findOne({ where: { id, status: 'published' } });
    if (!source || !(await this.canViewMarketItem(user, source))) {
      throw new NotFoundException('组件不存在或无权使用');
    }
    const copy = this.repo.create({
      ownerScope: this.scope.resourceOwnerKey(user),
      ownerUserId: user.sub,
      platform: source.platform,
      name: source.name.slice(0, 100),
      description: source.description,
      tags: [...(source.tags ?? [])],
      template: source.template,
      script: source.script,
      style: source.style,
      status: 'unpublished',
      visibility: null,
      coverDataUrl: source.coverDataUrl,
      layoutTemplate: source.layoutTemplate,
      publisherDisplayName: null,
      publisherCompanyName: null,
      sourceMarketplaceId: source.id,
      familyId: null,
      version: null,
    });
    const saved = await this.repo.save(copy);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.COMPONENT,
      action: 'use_market_component',
      targetId: saved.id,
      targetName: saved.name,
      summary: `使用市场组件「${source.name}」复制为草稿`,
    });
    return saved;
  }

  async remove(user: AuthPayload, id: string) {
    const row = await this.ownedDraft(user, id);
    const name = row.name;
    await this.repo.remove(row);
    this.audit.record({
      user,
      type: AuditType.DELETE,
      resource: AuditResource.COMPONENT,
      action: 'delete_component',
      targetId: id,
      targetName: name,
      summary: `删除组件「${name}」`,
    });
  }

  private marketQuery(user: AuthPayload) {
    const tenantId = user.activeTenantId || user.tenantId;
    return this.repo
      .createQueryBuilder('c')
      .where('c.status = :st', { st: 'published' })
      .andWhere(
        new Brackets((w) => {
          w.where('c.visibility = :official', { official: 'official' }).orWhere(
            'c.visibility = :marketplace',
            { marketplace: 'marketplace' },
          );
          if (tenantId) {
            w.orWhere(
              '(c.visibility = :tenant AND c.ownerScope = :scope)',
              { tenant: 'tenant', scope: `tenant-${tenantId}` },
            );
          }
        }),
      );
  }

  private async canViewMarketItem(
    user: AuthPayload,
    row: PlatformComponent,
  ): Promise<boolean> {
    if (row.visibility === 'official' || row.visibility === 'marketplace') {
      return true;
    }
    if (row.visibility === 'tenant') {
      const tenantId = user.activeTenantId || user.tenantId;
      return Boolean(tenantId && row.ownerScope === `tenant-${tenantId}`);
    }
    return false;
  }

  private assertCanPublish(
    user: AuthPayload,
    visibility: PlatformComponentVisibility,
  ) {
    if (visibility === 'official' && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException('仅平台管理员可发布官方组件');
    }
    const tenantId = user.activeTenantId || user.tenantId;
    if (visibility === 'tenant' && !tenantId) {
      throw new BadRequestException('个人账号不能发布企业内公开');
    }
  }

  async listOfficialCategories() {
    await this.ensureDefaultCategory();
    await this.ensureEchartsCategory();
    return this.categoryRepo.find({ order: { sortOrder: 'ASC', createdAt: 'ASC' } });
  }

  async createOfficialCategory(user: AuthPayload, rawName?: string) {
    this.assertPlatformAdmin(user);
    const name = String(rawName ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('分类名称不能为空');
    if (await this.categoryRepo.findOne({ where: { name } })) throw new BadRequestException('分类名称已存在');
    return this.categoryRepo.save(this.categoryRepo.create({ name, sortOrder: 0, isDefault: false }));
  }

  async updateOfficialCategory(user: AuthPayload, id: string, rawName?: string) {
    this.assertPlatformAdmin(user);
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('分类不存在');
    const name = String(rawName ?? '').trim().slice(0, 80);
    if (!name) throw new BadRequestException('分类名称不能为空');
    row.name = name;
    return this.categoryRepo.save(row);
  }

  async removeOfficialCategory(user: AuthPayload, id: string) {
    this.assertPlatformAdmin(user);
    const row = await this.categoryRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('分类不存在');
    if (row.isDefault) throw new BadRequestException('默认分类不能删除');
    const fallback = await this.ensureDefaultCategory();
    await this.repo.update({ officialCategoryId: id }, { officialCategoryId: fallback.id });
    await this.categoryRepo.remove(row);
  }

  private assertPlatformAdmin(user: AuthPayload) {
    if (user.role !== UserRole.PLATFORM_ADMIN) throw new ForbiddenException('仅平台管理员可管理官方分类');
  }

  private async ensureDefaultCategory() {
    let row = await this.categoryRepo.findOne({ where: { isDefault: true } });
    if (!row) row = await this.categoryRepo.save(this.categoryRepo.create({ name: '默认分类', sortOrder: -1000, isDefault: true }));
    return row;
  }

  private async ensureEchartsCategory() {
    const existing = await this.categoryRepo.findOne({ where: { name: 'ECharts 图表' } });
    if (existing) return existing;
    return this.categoryRepo.save(
      this.categoryRepo.create({ name: 'ECharts 图表', sortOrder: 0, isDefault: false }),
    );
  }

  private async ownedDraft(user: AuthPayload, id: string) {
    let row = await this.repo.findOne({
      where: { id, ownerUserId: user.sub, status: 'unpublished' },
    });
    if (!row) {
      row = await this.repo.findOne({
        where: {
          id,
          ownerScope: this.scope.resourceOwnerKey(user),
          status: 'unpublished',
        },
      });
      if (row && (!row.ownerUserId || row.ownerUserId === user.sub)) {
        row.ownerUserId = user.sub;
      } else {
        row = null;
      }
    }
    if (!row) throw new NotFoundException('组件不存在');
    return row;
  }

  /** 一次性回填缺失 ownerUserId / visibility */
  private backfillRunning = false;
  private async backfillMissingOwners() {
    if (this.backfillRunning) return;
    this.backfillRunning = true;
    try {
      const orphans = await this.repo
        .createQueryBuilder('c')
        .where('c.ownerUserId IS NULL')
        .orWhere('(c.status = :published AND c.visibility IS NULL)', {
          published: 'published',
        })
        .orWhere('(c.status = :published AND c.visibility = :official AND c.officialCategoryId IS NULL)', {
          published: 'published', official: 'official',
        })
        .take(200)
        .getMany();
      if (!orphans.length) return;
      const admin = await this.users.findOne({
        where: { role: UserRole.PLATFORM_ADMIN },
        order: { createdAt: 'ASC' },
      });
      const toSave: PlatformComponent[] = [];
      for (const row of orphans) {
        let changed = false;
        if (!row.ownerUserId) {
          // ownerScope 可能是 tenant-{uuid}，不能写入 ownerUserId（用户 UUID）
          if (admin?.id) {
            row.ownerUserId = admin.id;
            changed = true;
          }
        }
        if (row.status === 'published' && !row.visibility) {
          row.visibility = 'official';
          if (!row.publisherDisplayName) {
            row.publisherDisplayName = '官方';
          }
          changed = true;
        }
        if (row.status === 'published' && row.visibility === 'official' && !row.officialCategoryId) {
          row.officialCategoryId = (await this.ensureDefaultCategory()).id;
          changed = true;
        }
        if (row.status === 'published' && !row.familyId) {
          row.familyId = row.id;
          row.version = row.version || '1.0.0';
          changed = true;
        }
        if (changed) toSave.push(row);
      }
      if (toSave.length) await this.repo.save(toSave);
    } finally {
      this.backfillRunning = false;
    }
  }
}
