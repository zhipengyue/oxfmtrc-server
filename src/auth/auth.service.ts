import {
  ConflictException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { User, buildLoginKey } from '../users/user.entity';
import { UserType } from '../users/user-type.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { RegisterPersonalDto } from './dto/register-personal.dto';
import { parseDurationMs } from './parse-duration';
import { RefreshToken } from './refresh-token.entity';
import { Tenant } from '../tenants/tenant.entity';
import { UserRole } from '../tenants/user-role.enum';
import { SwitchContextDto } from '../tenants/dto/switch-context.dto';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';
import { DEFAULT_AVATAR_URL, normalizeAvatarUrl } from '../users/avatar.util';

const BCRYPT_ROUNDS = 10;
const DEFAULT_ACCESS_EXPIRES = '2h';
const DEFAULT_REFRESH_EXPIRES = '30d';

export interface AuthPayload {
  sub: string;
  userType: UserType;
  phone: string;
  role: UserRole;
  tenantId: string | null;
  activeTenantId?: string | null;
  activeUserId?: string | null;
  activeUserPhone?: string | null;
}

export interface AuthTokenResponse {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: string;
  refreshExpiresIn: string;
  user: {
    id: string;
    userType: UserType;
    phone: string;
    companyName: string | null;
    displayName: string | null;
    avatarUrl: string | null;
    role: UserRole;
    tenantId: string | null;
    tenantName: string | null;
    activeTenantId: string | null;
    activeUserId: string | null;
    activeUserPhone: string | null;
  };
}

@Injectable()
export class AuthService implements OnModuleInit {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    @InjectRepository(Tenant)
    private readonly tenantRepo: Repository<Tenant>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    const phone = 'admin';
    const existing = await this.userRepo.findOne({ where: { phone, userType: UserType.PERSONAL } });
    if (!existing) {
      const user = this.userRepo.create({ phone, userType: UserType.PERSONAL, passwordHash: await bcrypt.hash('Bjdv1999!', BCRYPT_ROUNDS), role: UserRole.PLATFORM_ADMIN, displayName: 'admin', enabled: true, loginKey: buildLoginKey(UserType.PERSONAL, phone, null) });
      await this.userRepo.save(user);
    } else if (existing.role !== UserRole.PLATFORM_ADMIN) {
      existing.role = UserRole.PLATFORM_ADMIN; existing.passwordHash = await bcrypt.hash('Bjdv1999!', BCRYPT_ROUNDS); existing.enabled = true; await this.userRepo.save(existing);
    }
  }

  async registerPersonal(dto: RegisterPersonalDto) {
    const loginKey = buildLoginKey(UserType.PERSONAL, dto.phone, null);
    if (await this.userRepo.findOne({ where: { loginKey } })) {
      throw new ConflictException('该手机号的个人账号已注册');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      userType: UserType.PERSONAL,
      loginKey,
      phone: dto.phone,
      passwordHash,
      companyName: null,
      displayName: dto.phone,
      avatarUrl: normalizeAvatarUrl(dto.avatarUrl),
      role: UserRole.PERSONAL_OWNER,
      tenantId: null,
      enabled: true,
    });
    await this.userRepo.save(user);
    return this.buildAuthResponse(user);
  }

  async registerEnterprise(dto: RegisterEnterpriseDto) {
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const tenant = await this.tenantRepo.save(
      this.tenantRepo.create({
        name: dto.companyName.trim(),
        ownerUserId: null,
        status: 'active',
      }),
    );
    const loginKey = buildLoginKey(UserType.ENTERPRISE, dto.adminPhone, tenant.id);
    if (await this.userRepo.findOne({ where: { loginKey } })) {
      throw new ConflictException('该管理员手机号已在本企业注册');
    }
    const user = this.userRepo.create({
      userType: UserType.ENTERPRISE,
      loginKey,
      phone: dto.adminPhone,
      passwordHash,
      companyName: dto.companyName.trim(),
      displayName: dto.companyName.trim(),
      avatarUrl: normalizeAvatarUrl(dto.avatarUrl),
      role: UserRole.TENANT_ADMIN,
      tenantId: tenant.id,
      enabled: true,
    });
    await this.userRepo.save(user);
    tenant.ownerUserId = user.id;
    await this.tenantRepo.save(tenant);
    return this.buildAuthResponse(user);
  }

  async login(
    dto: LoginDto,
    meta?: { ip?: string; userAgent?: string },
  ) {
    let user: User | null = null;
    if (dto.accountType === UserType.ENTERPRISE) {
      const tenantId = String(dto.tenantId ?? '').trim();
      if (!tenantId) throw new UnauthorizedException('请选择企业');
      user = await this.userRepo.findOne({
        where: {
          phone: dto.phone,
          userType: UserType.ENTERPRISE,
          tenantId,
        },
      });
    } else {
      user = await this.userRepo.findOne({
        where: { phone: dto.phone, userType: UserType.PERSONAL },
      });
    }
    if (!user || !user.enabled) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const result = await this.buildAuthResponse(user);
    this.audit.record({
      actorPhone: user.phone,
      actorDisplayName: user.displayName || user.companyName || user.phone,
      tenantId: user.tenantId,
      type: AuditType.LOGIN,
      resource: AuditResource.AUTH,
      action: 'login_success',
      targetId: user.id,
      targetName: user.displayName || user.phone,
      summary: `登录成功（${user.userType === UserType.ENTERPRISE ? '企业' : '个人'}）`,
      ip: meta?.ip,
      userAgent: meta?.userAgent,
    });
    return result;
  }

  /**
   * Re-hydrate authorization data from the database on every authenticated
   * request. This also upgrades access tokens issued before tenant roles were
   * introduced, so an already signed-in enterprise owner is not locked out of
   * organization management after deployment.
   */
  async resolvePayload(payload: AuthPayload): Promise<AuthPayload> {
    const user = await this.userRepo.findOne({ where: { id: payload.sub } });
    if (!user || !user.enabled) throw new UnauthorizedException('账号已停用');
    await this.ensureIdentity(user);
    return this.payloadFor(user, {
      activeTenantId: payload.activeTenantId ?? user.tenantId,
      activeUserId: payload.activeUserId ?? null,
      activeUserPhone: payload.activeUserPhone ?? null,
    });
  }

  async switchContext(actor: AuthPayload, dto: SwitchContextDto) {
    const user = await this.userRepo.findOne({ where: { id: actor.sub } });
    if (!user || !user.enabled) throw new UnauthorizedException('账号已停用');
    await this.ensureIdentity(user);
    const role = user.role!;
    let activeTenantId: string | null = dto.tenantId || user.tenantId;
    if (role !== UserRole.PLATFORM_ADMIN && activeTenantId !== user.tenantId) {
      throw new ForbiddenException('无权切换到其他企业');
    }
    if (role === UserRole.PERSONAL_OWNER) activeTenantId = null;
    let activeUser: User | null = null;
    if (dto.userId) {
      activeUser = await this.userRepo.findOne({ where: { id: dto.userId } });
      if (!activeUser || activeUser.tenantId !== activeTenantId) throw new ForbiddenException('用户不属于当前企业');
    }
    const payload = this.payloadFor(user, {
      activeTenantId,
      activeUserId: activeUser?.id ?? null,
      activeUserPhone: activeUser?.phone ?? null,
    });
    const expiresIn = this.config.get<string>('JWT_EXPIRES_IN') ?? DEFAULT_ACCESS_EXPIRES;
    return {
      accessToken: await this.jwtService.signAsync(payload, { expiresIn: expiresIn as SignOptions['expiresIn'] }),
      user: await this.userView(user, payload),
    };
  }

  /** accessToken 过期后，用 refreshToken 换取新令牌（轮换：旧 refresh 作废） */
  async refresh(refreshToken: string): Promise<AuthTokenResponse> {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const row = await this.refreshTokenRepo.findOne({
      where: { tokenHash },
      relations: ['user'],
    });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) {
        await this.refreshTokenRepo.remove(row);
      }
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
    const user = row.user;
    if (!user) {
      await this.refreshTokenRepo.remove(row);
      throw new UnauthorizedException('刷新令牌无效或已过期');
    }
    await this.refreshTokenRepo.remove(row);
    return this.buildAuthResponse(user);
  }

  /**
   * 为已登录用户重新签发会话（角色变更后使用）。
   * 会轮换 refreshToken。
   */
  async issueSessionForUser(userId: string): Promise<AuthTokenResponse> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user || !user.enabled) throw new UnauthorizedException('账号已停用');
    return this.buildAuthResponse(user);
  }

  private async buildAuthResponse(user: User): Promise<AuthTokenResponse> {
    await this.ensureIdentity(user);
    const payload = this.payloadFor(user);
    const expiresIn =
      this.config.get<string>('JWT_EXPIRES_IN') ?? DEFAULT_ACCESS_EXPIRES;
    const refreshExpiresIn =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      DEFAULT_REFRESH_EXPIRES;

    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: expiresIn as SignOptions['expiresIn'],
    });
    const refreshToken = await this.createRefreshToken(user.id);

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn,
      refreshExpiresIn,
      user: await this.userView(user, payload),
    };
  }

  private payloadFor(user: User, context?: Partial<AuthPayload>): AuthPayload {
    return { sub: user.id, userType: user.userType, phone: user.phone, role: user.role!, tenantId: user.tenantId, activeTenantId: context?.activeTenantId ?? user.tenantId, activeUserId: context?.activeUserId ?? null, activeUserPhone: context?.activeUserPhone ?? null };
  }

  private async userView(user: User, payload: AuthPayload) {
    const tenantId = payload.activeTenantId || user.tenantId;
    const tenant = tenantId ? await this.tenantRepo.findOne({ where: { id: tenantId } }) : null;
    return { id: user.id, userType: user.userType, phone: user.phone, companyName: user.companyName, displayName: user.displayName, avatarUrl: user.avatarUrl || DEFAULT_AVATAR_URL, role: user.role!, tenantId: user.tenantId, tenantName: tenant?.name ?? null, activeTenantId: payload.activeTenantId ?? null, activeUserId: payload.activeUserId ?? null, activeUserPhone: payload.activeUserPhone ?? null };
  }

  private async ensureIdentity(user: User): Promise<void> {
    const platformPhones = (this.config.get<string>('PLATFORM_ADMIN_PHONES', '') || '').split(',').map((v) => v.trim()).filter(Boolean);
    // 保留环境变量可配置，同时兼容内置平台管理员账号。
    if (platformPhones.includes(user.phone) || user.phone === '13691268112' || user.phone === 'admin') user.role = UserRole.PLATFORM_ADMIN;
    if (!user.role) user.role = user.userType === UserType.PERSONAL ? UserRole.PERSONAL_OWNER : UserRole.TENANT_ADMIN;
    if (user.userType === UserType.ENTERPRISE && !user.tenantId) {
      const tenant = await this.tenantRepo.save(this.tenantRepo.create({ name: user.companyName || `企业 ${user.phone}`, ownerUserId: user.id, status: 'active' }));
      user.tenantId = tenant.id;
    }
    if (!user.displayName) user.displayName = user.companyName || user.phone;
    if (!user.avatarUrl) user.avatarUrl = DEFAULT_AVATAR_URL;
    if (user.enabled == null) user.enabled = true;
    await this.userRepo.save(user);
  }

  private async createRefreshToken(userId: string): Promise<string> {
    const raw = randomBytes(32).toString('base64url');
    const tokenHash = this.hashRefreshToken(raw);
    const refreshExpiresIn =
      this.config.get<string>('JWT_REFRESH_EXPIRES_IN') ??
      DEFAULT_REFRESH_EXPIRES;
    const ms = parseDurationMs(refreshExpiresIn, 30 * 24 * 60 * 60 * 1000);
    const expiresAt = new Date(Date.now() + ms);

    const row = this.refreshTokenRepo.create({
      userId,
      tokenHash,
      expiresAt,
    });
    await this.refreshTokenRepo.save(row);
    return raw;
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
