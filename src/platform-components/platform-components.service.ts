import {
  BadRequestException,
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

@Injectable()
export class PlatformComponentsService {
  constructor(
    @InjectRepository(PlatformComponent)
    private readonly repo: Repository<PlatformComponent>,
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

    const isCreate = !row;
    row = this.repo.create({
      ...(row ?? {}),
      ownerScope,
      ownerUserId: user.sub,
      platform: body.platform === 'mobile' ? 'mobile' : 'web',
      name: String(body.name ?? '').trim().slice(0, 100),
      description: String(body.description ?? '').trim().slice(0, 300),
      tags: Array.isArray(body.tags) ? body.tags.map(String).slice(0, 20) : [],
      template: String(body.template ?? ''),
      script: String(body.script ?? ''),
      style: String(body.style ?? ''),
      status: 'unpublished',
      visibility: null,
      coverDataUrl: body.coverDataUrl || row?.coverDataUrl || null,
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
  ): Promise<PlatformComponent> {
    this.assertCanPublish(user, visibility);
    const row = await this.ownedDraft(user, id);
    const publisher = await this.users.findOne({ where: { id: user.sub } });
    row.status = 'published';
    row.visibility = visibility;
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
    return this.marketQuery(user).orderBy('c.updatedAt', 'DESC').getMany();
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
    return qb.orderBy('c.updatedAt', 'DESC').getMany();
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
      publisherDisplayName: null,
      publisherCompanyName: null,
      sourceMarketplaceId: source.id,
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
        .take(200)
        .getMany();
      if (!orphans.length) return;
      const admin = await this.users.findOne({
        where: { role: UserRole.PLATFORM_ADMIN },
        order: { createdAt: 'ASC' },
      });
      for (const row of orphans) {
        if (!row.ownerUserId) {
          row.ownerUserId = admin?.id ?? row.ownerScope;
        }
        if (row.status === 'published' && !row.visibility) {
          row.visibility = 'official';
          if (!row.publisherDisplayName) {
            row.publisherDisplayName = '官方';
          }
        }
      }
      await this.repo.save(orphans);
    } finally {
      this.backfillRunning = false;
    }
  }
}
