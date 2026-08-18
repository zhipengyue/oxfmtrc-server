import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import type { SignOptions } from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { UserType } from '../users/user-type.enum';
import { LoginDto } from './dto/login.dto';
import { RegisterEnterpriseDto } from './dto/register-enterprise.dto';
import { RegisterPersonalDto } from './dto/register-personal.dto';
import { parseDurationMs } from './parse-duration';
import { RefreshToken } from './refresh-token.entity';

const BCRYPT_ROUNDS = 10;
const DEFAULT_ACCESS_EXPIRES = '2h';
const DEFAULT_REFRESH_EXPIRES = '30d';

export interface AuthPayload {
  sub: string;
  userType: UserType;
  phone: string;
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
  };
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async registerPersonal(dto: RegisterPersonalDto) {
    const existing = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException('该手机号已被注册');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      userType: UserType.PERSONAL,
      phone: dto.phone,
      passwordHash,
      companyName: null,
    });
    await this.userRepo.save(user);
    return this.buildAuthResponse(user);
  }

  async registerEnterprise(dto: RegisterEnterpriseDto) {
    const existing = await this.userRepo.findOne({
      where: { phone: dto.adminPhone },
    });
    if (existing) {
      throw new ConflictException('该管理员手机号已被注册');
    }
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = this.userRepo.create({
      userType: UserType.ENTERPRISE,
      phone: dto.adminPhone,
      passwordHash,
      companyName: dto.companyName.trim(),
    });
    await this.userRepo.save(user);
    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const user = await this.userRepo.findOne({
      where: { phone: dto.phone },
    });
    if (!user || user.userType !== dto.accountType) {
      throw new UnauthorizedException('账号或密码错误');
    }
    const ok = await bcrypt.compare(dto.password, user.passwordHash);
    if (!ok) {
      throw new UnauthorizedException('账号或密码错误');
    }
    return this.buildAuthResponse(user);
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

  private async buildAuthResponse(user: User): Promise<AuthTokenResponse> {
    const payload: AuthPayload = {
      sub: user.id,
      userType: user.userType,
      phone: user.phone,
    };
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
      user: {
        id: user.id,
        userType: user.userType,
        phone: user.phone,
        companyName: user.companyName,
      },
    };
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
