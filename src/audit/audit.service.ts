import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { UserRole } from '../tenants/user-role.enum';
import { AuditLog } from './audit-log.entity';
import { AuditResource } from './audit-resource.enum';
import { AuditType } from './audit-type.enum';

export interface RecordAuditInput {
  user?: AuthPayload | null;
  actorPhone?: string;
  actorDisplayName?: string | null;
  tenantId?: string | null;
  type: AuditType;
  resource: AuditResource;
  action: string;
  targetId?: string | null;
  targetName?: string | null;
  summary: string;
  ip?: string | null;
  userAgent?: string | null;
}

export interface AuditLogQuery {
  type?: AuditType;
  resource?: AuditResource;
  actorPhone?: string;
  from?: string;
  to?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

export interface AuditStatsQuery {
  range?: 'today' | '7d' | '30d';
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly repo: Repository<AuditLog>,
  ) {}

  /** 写入失败不影响业务主流程 */
  record(input: RecordAuditInput): void {
    void this.persist(input).catch((err: unknown) => {
      this.logger.warn(
        `审计日志写入失败: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  async persist(input: RecordAuditInput): Promise<void> {
    const actorPhone =
      input.actorPhone ||
      input.user?.activeUserPhone ||
      input.user?.phone ||
      '';
    if (!actorPhone) return;

    const tenantId =
      input.tenantId !== undefined
        ? input.tenantId
        : input.user?.activeTenantId || input.user?.tenantId || null;

    const row = this.repo.create({
      tenantId,
      actorPhone,
      actorDisplayName: input.actorDisplayName ?? null,
      type: input.type,
      resource: input.resource,
      action: input.action.slice(0, 64),
      targetId: input.targetId ?? null,
      targetName: input.targetName ? input.targetName.slice(0, 200) : null,
      summary: input.summary.slice(0, 500),
      ip: input.ip ? input.ip.slice(0, 64) : null,
      userAgent: input.userAgent ? input.userAgent.slice(0, 300) : null,
    });
    await this.repo.save(row);
  }

  assertCanView(user: AuthPayload): void {
    if (
      user.role === UserRole.TENANT_ADMIN ||
      user.role === UserRole.PLATFORM_ADMIN
    ) {
      return;
    }
    throw new ForbiddenException('仅企业管理员可查看日志');
  }

  private applyTenantFilter(
    qb: ReturnType<Repository<AuditLog>['createQueryBuilder']>,
    user: AuthPayload,
  ): boolean {
    if (user.role === UserRole.TENANT_ADMIN) {
      const tid = user.activeTenantId || user.tenantId;
      if (!tid) return false;
      qb.andWhere('log.tenantId = :tid', { tid });
      return true;
    }
    if (user.role === UserRole.PLATFORM_ADMIN && user.activeTenantId) {
      qb.andWhere('log.tenantId = :tid', { tid: user.activeTenantId });
    }
    return true;
  }

  async list(user: AuthPayload, query: AuditLogQuery) {
    this.assertCanView(user);
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));

    const qb = this.repo.createQueryBuilder('log');
    if (!this.applyTenantFilter(qb, user)) {
      return { items: [], total: 0, page, pageSize };
    }

    if (query.type) qb.andWhere('log.type = :type', { type: query.type });
    if (query.resource) {
      qb.andWhere('log.resource = :resource', { resource: query.resource });
    }
    if (query.actorPhone?.trim()) {
      qb.andWhere('log.actorPhone = :actorPhone', {
        actorPhone: query.actorPhone.trim(),
      });
    }
    if (query.from) {
      qb.andWhere('log.createdAt >= :from', { from: new Date(query.from) });
    }
    if (query.to) {
      qb.andWhere('log.createdAt <= :to', { to: new Date(query.to) });
    }
    if (query.keyword?.trim()) {
      qb.andWhere(
        '(log.summary LIKE :kw OR log.targetName LIKE :kw OR log.actorPhone LIKE :kw OR log.actorDisplayName LIKE :kw)',
        { kw: `%${query.keyword.trim()}%` },
      );
    }

    qb.orderBy('log.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await qb.getManyAndCount();
    return {
      items: rows.map((row) => this.toItem(row)),
      total,
      page,
      pageSize,
    };
  }

  async stats(user: AuthPayload, query: AuditStatsQuery) {
    this.assertCanView(user);
    const range = query.range || '7d';
    const now = new Date();
    const from = new Date(now);
    if (range === 'today') {
      from.setHours(0, 0, 0, 0);
    } else if (range === '30d') {
      from.setDate(from.getDate() - 30);
    } else {
      from.setDate(from.getDate() - 7);
    }

    const empty = {
      range,
      from: from.toISOString(),
      to: now.toISOString(),
      login: 0,
      save: 0,
      delete: 0,
    };

    const qb = this.repo
      .createQueryBuilder('log')
      .select('log.type', 'type')
      .addSelect('COUNT(*)', 'count')
      .where('log.createdAt >= :from', { from })
      .groupBy('log.type');

    if (!this.applyTenantFilter(qb, user)) return empty;

    const rows = await qb.getRawMany<{ type: AuditType; count: string }>();
    const counts = { login: 0, save: 0, delete: 0 };
    for (const row of rows) {
      const n = Number(row.count) || 0;
      if (row.type === AuditType.LOGIN) counts.login = n;
      if (row.type === AuditType.SAVE) counts.save = n;
      if (row.type === AuditType.DELETE) counts.delete = n;
    }
    return { ...empty, ...counts };
  }

  private toItem(row: AuditLog) {
    return {
      id: row.id,
      tenantId: row.tenantId,
      actorPhone: row.actorPhone,
      actorDisplayName: row.actorDisplayName,
      type: row.type,
      resource: row.resource,
      action: row.action,
      targetId: row.targetId,
      targetName: row.targetName,
      summary: row.summary,
      ip: row.ip,
      userAgent: row.userAgent,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
