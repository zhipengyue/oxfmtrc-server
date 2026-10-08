import { ForbiddenException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { User } from '../users/user.entity';
import { UserRole } from './user-role.enum';

@Injectable()
export class AccessScopeService {
  constructor(@InjectRepository(User) private readonly users: Repository<User>) {}

  async visibleOwnerPhones(user: AuthPayload): Promise<string[]> {
    if (user.activeUserPhone) return [user.activeUserPhone];
    const tenantId = user.activeTenantId || user.tenantId;
    if (user.role === UserRole.PLATFORM_ADMIN) {
      if (!tenantId) return (await this.users.find({ select: { phone: true } })).map((row) => row.phone);
      return (await this.users.find({ where: { tenantId }, select: { phone: true } })).map((row) => row.phone);
    }
    if (user.role === UserRole.TENANT_ADMIN && tenantId) {
      return (await this.users.find({ where: { tenantId }, select: { phone: true } })).map((row) => row.phone);
    }
    return [user.phone];
  }

  async assertCanAccessOwner(user: AuthPayload, ownerAccount: string): Promise<void> {
    if ((await this.visibleOwnerPhones(user)).includes(ownerAccount)) return;
    throw new ForbiddenException('无权访问该用户的数据');
  }

  assertCanEditOwner(user: AuthPayload, ownerAccount: string): void {
    if (user.phone === ownerAccount || user.sub === ownerAccount) return;
    throw new ForbiddenException('无权代替其他用户编辑该资源');
  }

  /** 素材/组件作用域：企业内共享用 tenant-{id}；个人仍用手机号（避免打乱已有对象存储路径） */
  resourceOwnerKey(user: AuthPayload): string {
    const tenantId = user.activeTenantId || user.tenantId;
    return tenantId ? `tenant-${tenantId}` : user.phone;
  }
}
