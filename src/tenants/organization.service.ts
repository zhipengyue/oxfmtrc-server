import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { User } from '../users/user.entity';
import { UserType } from '../users/user-type.enum';
import { buildLoginKey } from '../users/user.entity';
import { CreateMemberDto } from './dto/create-member.dto';
import { Tenant } from './tenant.entity';
import { UserRole } from './user-role.enum';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';
import { AuthService } from '../auth/auth.service';
import { TransferAdminDto } from './dto/transfer-admin.dto';
import { normalizeAvatarUrl, DEFAULT_AVATAR_URL } from '../users/avatar.util';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly audit: AuditService,
    private readonly authService: AuthService,
  ) {}

  async listTenants(user: AuthPayload) {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return this.tenantRepo.find({ order: { createdAt: 'DESC' } });
    }
    if (!user.tenantId) return [];
    const tenant = await this.tenantRepo.findOne({ where: { id: user.tenantId } });
    return tenant ? [tenant] : [];
  }

  /** 登录页企业搜索（公开）：按名称关键字过滤 */
  async searchTenants(keyword: string, limit = 20) {
    const q = keyword.trim();
    const take = Math.min(50, Math.max(1, limit));
    const qb = this.tenantRepo
      .createQueryBuilder('t')
      .select(['t.id', 't.name'])
      .where("t.status = 'active'")
      .orderBy('t.name', 'ASC')
      .take(take);
    if (q) {
      qb.andWhere('t.name LIKE :q', { q: `%${q}%` });
    }
    const rows = await qb.getMany();
    return rows.map((row) => ({ id: row.id, name: row.name }));
  }

  async listMembers(user: AuthPayload, tenantId?: string) {
    const id = this.resolveTenantId(user, tenantId);
    if (!id) return [];
    const rows = await this.userRepo.find({ where: { tenantId: id }, order: { createdAt: 'ASC' } });
    return rows.map((row) => this.toMember(row));
  }

  async createMember(user: AuthPayload, dto: CreateMemberDto) {
    if (user.role !== UserRole.TENANT_ADMIN && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException('仅企业管理员可以创建成员');
    }
    const tenantId = this.resolveTenantId(user, user.activeTenantId ?? undefined);
    if (!tenantId) throw new ForbiddenException('请先选择企业');
    if (await this.userRepo.findOne({
      where: {
        phone: dto.phone,
        tenantId,
        userType: UserType.ENTERPRISE,
      },
    })) {
      throw new ConflictException('该手机号已是本企业成员');
    }
    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('企业不存在');
    const row = this.userRepo.create({
      userType: UserType.ENTERPRISE,
      loginKey: buildLoginKey(UserType.ENTERPRISE, dto.phone, tenantId),
      phone: dto.phone,
      passwordHash: await bcrypt.hash(dto.password, 10),
      companyName: tenant.name,
      displayName: dto.displayName?.trim() || dto.phone,
      avatarUrl: normalizeAvatarUrl(dto.avatarUrl),
      role: UserRole.MEMBER,
      tenantId,
      enabled: true,
    });
    const saved = await this.userRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.MEMBER,
      action: 'create_member',
      targetId: saved.id,
      targetName: saved.displayName || saved.phone,
      summary: `创建成员「${saved.displayName || saved.phone}」`,
    });
    return this.toMember(saved);
  }

  async setMemberEnabled(user: AuthPayload, memberId: string, enabled: boolean) {
    if (user.role !== UserRole.TENANT_ADMIN && user.role !== UserRole.PLATFORM_ADMIN) {
      throw new ForbiddenException('无权管理成员');
    }
    const row = await this.userRepo.findOne({ where: { id: memberId } });
    const tenantId = this.resolveTenantId(user, user.activeTenantId ?? undefined);
    if (!row || !tenantId || row.tenantId !== tenantId) throw new NotFoundException('成员不存在');
    if (row.role === UserRole.TENANT_ADMIN) throw new ForbiddenException('不能停用企业管理员');
    row.enabled = enabled;
    const saved = await this.userRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.MEMBER,
      action: enabled ? 'enable_member' : 'disable_member',
      targetId: saved.id,
      targetName: saved.displayName || saved.phone,
      summary: `${enabled ? '启用' : '停用'}成员「${saved.displayName || saved.phone}」`,
    });
    return this.toMember(saved);
  }

  /**
   * 企业管理员将身份转交给已启用的普通成员。
   * 交接后：对方 → tenant_admin；自己 → member；并更新 tenants.ownerUserId。
   */
  async transferAdmin(user: AuthPayload, dto: TransferAdminDto) {
    if (user.role !== UserRole.TENANT_ADMIN) {
      throw new ForbiddenException('仅企业管理员可以交接管理员身份');
    }
    const tenantId = this.resolveTenantId(user, user.activeTenantId ?? undefined);
    if (!tenantId) throw new ForbiddenException('请先选择企业');

    const currentAdmin = await this.userRepo.findOne({ where: { id: user.sub } });
    if (
      !currentAdmin ||
      currentAdmin.tenantId !== tenantId ||
      currentAdmin.role !== UserRole.TENANT_ADMIN
    ) {
      throw new ForbiddenException('当前账号不是本企业管理员');
    }

    if (dto.memberId === currentAdmin.id) {
      throw new BadRequestException('不能转交给自己');
    }

    const target = await this.userRepo.findOne({ where: { id: dto.memberId } });
    if (!target || target.tenantId !== tenantId || target.userType !== UserType.ENTERPRISE) {
      throw new NotFoundException('目标成员不存在');
    }
    if (!target.enabled) {
      throw new BadRequestException('只能转交给已启用的成员');
    }
    if (target.role === UserRole.TENANT_ADMIN) {
      throw new BadRequestException('对方已是企业管理员');
    }

    const tenant = await this.tenantRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('企业不存在');

    target.role = UserRole.TENANT_ADMIN;
    currentAdmin.role = UserRole.MEMBER;
    tenant.ownerUserId = target.id;

    await this.userRepo.save([target, currentAdmin]);
    await this.tenantRepo.save(tenant);

    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.MEMBER,
      action: 'transfer_admin',
      targetId: target.id,
      targetName: target.displayName || target.phone,
      summary: `将企业管理员身份转交给「${target.displayName || target.phone}」`,
    });

    const session = await this.authService.issueSessionForUser(currentAdmin.id);
    return {
      previousAdmin: this.toMember(currentAdmin),
      newAdmin: this.toMember(target),
      ...session,
    };
  }

  private resolveTenantId(user: AuthPayload, requested?: string): string | null {
    if (user.role === UserRole.PLATFORM_ADMIN) return requested || user.activeTenantId || null;
    if (!user.tenantId) return null;
    if (requested && requested !== user.tenantId) throw new ForbiddenException('无权访问其他企业');
    return user.tenantId;
  }

  private toMember(row: User) {
    return { id: row.id, phone: row.phone, displayName: row.displayName || row.phone, avatarUrl: row.avatarUrl || DEFAULT_AVATAR_URL, role: row.role, enabled: row.enabled, tenantId: row.tenantId, createdAt: row.createdAt.toISOString() };
  }
}
