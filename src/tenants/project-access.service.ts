import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { User } from '../users/user.entity';
import { UserRole } from './user-role.enum';
import { LowcodeApp } from '../lowcode/lowcode-app.entity';
import { ProjectShare } from '../lowcode/project-share.entity';
import { ProjectSharePermission } from '../lowcode/project-share-permission.enum';
import { ProjectVisibility } from '../lowcode/project-visibility.enum';

export interface ProjectActor {
  userId: string;
  phone: string;
  role: UserRole;
  tenantId: string | null;
}

export interface ProjectAccessFlags {
  canView: boolean;
  canEditContent: boolean;
  canManageProject: boolean;
  canManageSharing: boolean;
  relation: 'owner' | 'share_edit' | 'share_view' | 'tenant_public' | 'tenant_admin' | 'none';
}

@Injectable()
export class ProjectAccessService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(ProjectShare) private readonly shares: Repository<ProjectShare>,
  ) {}

  async resolveActor(user: AuthPayload): Promise<ProjectActor> {
    if (user.activeUserId) {
      const target = await this.users.findOne({ where: { id: user.activeUserId } });
      if (!target) throw new ForbiddenException('目标用户不存在');
      return {
        userId: target.id,
        phone: target.phone,
        role: (target.role as UserRole) || UserRole.MEMBER,
        tenantId: target.tenantId,
      };
    }
    if (user.activeUserPhone) {
      const tenantId = user.activeTenantId || user.tenantId;
      const target = tenantId
        ? await this.users.findOne({ where: { phone: user.activeUserPhone, tenantId } })
        : await this.users.findOne({ where: { phone: user.activeUserPhone } });
      if (!target) throw new ForbiddenException('目标用户不存在');
      return {
        userId: target.id,
        phone: target.phone,
        role: (target.role as UserRole) || UserRole.MEMBER,
        tenantId: target.tenantId,
      };
    }
    return {
      userId: user.sub,
      phone: user.phone,
      role: user.role,
      tenantId: user.activeTenantId || user.tenantId,
    };
  }

  async tenantMemberUserIds(tenantId: string | null | undefined): Promise<string[]> {
    if (!tenantId) return [];
    return (await this.users.find({ where: { tenantId }, select: { id: true } })).map(
      (row) => row.id,
    );
  }

  async tenantMemberPhones(tenantId: string | null | undefined): Promise<string[]> {
    if (!tenantId) return [];
    return (await this.users.find({ where: { tenantId }, select: { phone: true } })).map(
      (row) => row.phone,
    );
  }

  async getShare(appId: string, memberPhone: string): Promise<ProjectShare | null> {
    return this.shares.findOne({ where: { appId, memberPhone } });
  }

  async listShares(appId: string): Promise<ProjectShare[]> {
    return this.shares.find({ where: { appId }, order: { createdAt: 'ASC' } });
  }

  /** 批量统计各应用的分享人数 */
  async shareCountsForApps(appIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const unique = [...new Set(appIds.filter(Boolean))];
    if (!unique.length) return map;
    const rows = await this.shares
      .createQueryBuilder('s')
      .select('s.appId', 'appId')
      .addSelect('COUNT(*)', 'cnt')
      .where('s.appId IN (:...appIds)', { appIds: unique })
      .groupBy('s.appId')
      .getRawMany<{ appId: string; cnt: string }>();
    for (const row of rows) {
      map.set(row.appId, Number(row.cnt) || 0);
    }
    return map;
  }

  async replaceShares(
    appId: string,
    items: Array<{ memberPhone: string; permission: ProjectSharePermission }>,
  ): Promise<ProjectShare[]> {
    await this.shares.delete({ appId });
    if (!items.length) return [];
    const rows = items.map((item) =>
      this.shares.create({
        appId,
        memberPhone: item.memberPhone,
        permission: item.permission,
      }),
    );
    return this.shares.save(rows);
  }

  async resolveAccess(user: AuthPayload, app: LowcodeApp): Promise<ProjectAccessFlags> {
    const actor = await this.resolveActor(user);
    const none: ProjectAccessFlags = {
      canView: false,
      canEditContent: false,
      canManageProject: false,
      canManageSharing: false,
      relation: 'none',
    };

    if (app.ownerAccount === actor.userId) {
      return {
        canView: true,
        canEditContent: true,
        canManageProject: true,
        canManageSharing: true,
        relation: 'owner',
      };
    }

    const share = await this.getShare(app.appId, actor.phone);
    if (share?.permission === ProjectSharePermission.EDIT) {
      return {
        canView: true,
        canEditContent: true,
        canManageProject: false,
        canManageSharing: false,
        relation: 'share_edit',
      };
    }
    if (share?.permission === ProjectSharePermission.VIEW) {
      return {
        canView: true,
        canEditContent: false,
        canManageProject: false,
        canManageSharing: false,
        relation: 'share_view',
      };
    }

    const owner = await this.users.findOne({ where: { id: app.ownerAccount } });
    const ownerTenantId = owner?.tenantId ?? null;
    const sameTenant =
      Boolean(actor.tenantId) &&
      Boolean(ownerTenantId) &&
      actor.tenantId === ownerTenantId;

    if (
      sameTenant &&
      (actor.role === UserRole.TENANT_ADMIN || actor.role === UserRole.PLATFORM_ADMIN)
    ) {
      return {
        canView: true,
        canEditContent: true,
        canManageProject: false,
        canManageSharing: false,
        relation: 'tenant_admin',
      };
    }

    if (sameTenant && app.visibility === ProjectVisibility.TENANT_PUBLIC) {
      return {
        canView: true,
        canEditContent: false,
        canManageProject: false,
        canManageSharing: false,
        relation: 'tenant_public',
      };
    }

    if (user.role === UserRole.PLATFORM_ADMIN && !user.activeUserId && !user.activeUserPhone && !actor.tenantId) {
      return {
        canView: true,
        canEditContent: true,
        canManageProject: false,
        canManageSharing: false,
        relation: 'tenant_admin',
      };
    }

    if (
      user.role === UserRole.PLATFORM_ADMIN &&
      !user.activeUserId &&
      !user.activeUserPhone &&
      ownerTenantId &&
      (user.activeTenantId || user.tenantId) === ownerTenantId
    ) {
      return {
        canView: true,
        canEditContent: true,
        canManageProject: false,
        canManageSharing: false,
        relation: 'tenant_admin',
      };
    }

    return none;
  }

  async assertCanView(user: AuthPayload, app: LowcodeApp): Promise<ProjectAccessFlags> {
    const access = await this.resolveAccess(user, app);
    if (!access.canView) throw new ForbiddenException('无权访问该项目');
    return access;
  }

  async assertCanEditContent(
    user: AuthPayload,
    app: LowcodeApp,
  ): Promise<ProjectAccessFlags> {
    const access = await this.resolveAccess(user, app);
    if (!access.canEditContent) throw new ForbiddenException('无权编辑该项目内容');
    return access;
  }

  async assertCanManageProject(
    user: AuthPayload,
    app: LowcodeApp,
  ): Promise<ProjectAccessFlags> {
    const access = await this.resolveAccess(user, app);
    if (!access.canManageProject) throw new ForbiddenException('无权管理该项目');
    return access;
  }

  async assertCanManageSharing(
    user: AuthPayload,
    app: LowcodeApp,
  ): Promise<ProjectAccessFlags> {
    const access = await this.resolveAccess(user, app);
    if (!access.canManageSharing) throw new ForbiddenException('无权修改项目分享设置');
    return access;
  }

  async findVisibleApps(
    user: AuthPayload,
    appRepo: Repository<LowcodeApp>,
  ): Promise<LowcodeApp[]> {
    const actor = await this.resolveActor(user);
    const selectFields = [
      'app.appId',
      'app.name',
      'app.slug',
      'app.ownerAccount',
      'app.visibility',
      'app.updatedAt',
      'app.categoryId',
      'app.primaryLayout',
      'app.canvasLayoutMode',
      'app.coverUrl',
    ];

    if (
      user.role === UserRole.PLATFORM_ADMIN &&
      !user.activeUserId &&
      !user.activeUserPhone &&
      !actor.tenantId
    ) {
      return appRepo.find({
        select: {
          appId: true,
          name: true,
          slug: true,
          ownerAccount: true,
          visibility: true,
          updatedAt: true,
          categoryId: true,
          primaryLayout: true,
          canvasLayoutMode: true,
          coverUrl: true,
        },
        order: { updatedAt: 'DESC' },
      });
    }

    const memberIds = await this.tenantMemberUserIds(actor.tenantId);
    const shared = await this.shares.find({
      where: { memberPhone: actor.phone },
      select: { appId: true },
    });
    const sharedIds = shared.map((row) => row.appId);

    const qb = appRepo
      .createQueryBuilder('app')
      .select(selectFields)
      .where('app.ownerAccount = :ownerId', { ownerId: actor.userId });

    if (sharedIds.length) {
      qb.orWhere('app.appId IN (:...sharedIds)', { sharedIds });
    }

    if (memberIds.length) {
      qb.orWhere(
        '(app.visibility = :tenantPublic AND app.ownerAccount IN (:...memberIds))',
        {
          tenantPublic: ProjectVisibility.TENANT_PUBLIC,
          memberIds,
        },
      );

      const isTenantSupervisor =
        actor.role === UserRole.TENANT_ADMIN ||
        (user.role === UserRole.PLATFORM_ADMIN && !user.activeUserId && !user.activeUserPhone);
      if (isTenantSupervisor) {
        qb.orWhere('app.ownerAccount IN (:...supervisorIds)', {
          supervisorIds: memberIds,
        });
      }
    }

    qb.orderBy('app.updatedAt', 'DESC');
    return qb.getMany();
  }

  async requireApp(
    appRepo: Repository<LowcodeApp>,
    appId: string,
  ): Promise<LowcodeApp> {
    const row = await appRepo.findOne({ where: { appId } });
    if (!row) throw new NotFoundException('应用不存在');
    return row;
  }

  async assertMembersInTenant(
    phones: string[],
    tenantId: string,
    ownerPhone: string,
  ): Promise<void> {
    const unique = [...new Set(phones.map((p) => p.trim()).filter(Boolean))];
    if (unique.some((p) => p === ownerPhone)) {
      throw new ForbiddenException('不能分享给项目所有者本人');
    }
    if (!unique.length) return;
    const rows = await this.users.find({
      where: { phone: In(unique), tenantId },
      select: { phone: true },
    });
    if (rows.length !== unique.length) {
      throw new ForbiddenException('只能分享给本企业成员');
    }
  }

  async resolveOwnerPhone(ownerAccount: string): Promise<string | null> {
    const owner = await this.users.findOne({
      where: { id: ownerAccount },
      select: { phone: true },
    });
    return owner?.phone ?? null;
  }
}
