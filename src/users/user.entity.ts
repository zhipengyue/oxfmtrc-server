import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserType } from './user-type.enum';
import { UserRole } from '../tenants/user-role.enum';

@Entity('users')
@Index('idx_users_phone', ['phone'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: UserType })
  userType: UserType;

  /**
   * 登录身份键（唯一）：
   * - 个人：p:{phone}
   * - 企业：e:{tenantId}:{phone}
   * 允许同一手机号同时拥有个人账号与多家企业身份。
   */
  @Column({ type: 'varchar', length: 96, unique: true, nullable: true })
  loginKey: string | null;

  /** 登录手机号（不再全局唯一） */
  @Column({ type: 'varchar', length: 20 })
  phone: string;

  @Column({ type: 'varchar', length: 255 })
  passwordHash: string;

  /** 企业名称，仅 enterprise 有值 */
  @Column({ type: 'varchar', length: 200, nullable: true })
  companyName: string | null;

  @Column({ type: 'varchar', length: 32, nullable: true })
  role: UserRole | null;

  @Column({ type: 'varchar', length: 36, nullable: true })
  tenantId: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  displayName: string | null;

  /** 头像：预设路径 /avatars/preset-xx.svg，或图片 data URL / 公开 URL */
  @Column({ type: 'mediumtext', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'tinyint', default: 1 })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export function buildLoginKey(
  userType: UserType,
  phone: string,
  tenantId: string | null | undefined,
): string {
  const p = phone.trim();
  if (userType === UserType.PERSONAL) return `p:${p}`;
  if (!tenantId) throw new Error('企业账号必须关联 tenantId');
  return `e:${tenantId}:${p}`;
}
