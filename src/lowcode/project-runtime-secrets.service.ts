import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { LowcodeApp } from './lowcode-app.entity';
import { ProjectRuntimeSecret } from './project-runtime-secret.entity';
import { ProjectAccessService } from '../tenants/project-access.service';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';

export interface ProjectRuntimeSecretSummary {
  name: string;
  note: string;
  configured: true;
  updatedAt: string;
}

@Injectable()
export class ProjectRuntimeSecretsService {
  constructor(
    @InjectRepository(ProjectRuntimeSecret) private readonly secretRepo: Repository<ProjectRuntimeSecret>,
    @InjectRepository(LowcodeApp) private readonly appRepo: Repository<LowcodeApp>,
    private readonly config: ConfigService,
    private readonly projectAccess: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(appId: string, user: AuthPayload): Promise<ProjectRuntimeSecretSummary[]> {
    await this.assertOwner(appId, user);
    const rows = await this.secretRepo.find({ where: { appId }, order: { name: 'ASC' } });
    return rows.map((row) => ({ name: row.name, note: row.note, configured: true, updatedAt: row.updatedAt.toISOString() }));
  }

  async save(appId: string, name: string, value: string, note: string, user: AuthPayload): Promise<ProjectRuntimeSecretSummary> {
    const app = await this.assertOwner(appId, user);
    const encrypted = this.encrypt(value);
    let row = await this.secretRepo.findOne({ where: { appId, name } });
    row = this.secretRepo.create({ ...(row ?? {}), appId, ownerAccount: app.ownerAccount, name, note: note.trim(), ...encrypted });
    const saved = await this.secretRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.RUNTIME,
      action: 'save_runtime_secret',
      targetId: appId,
      targetName: name,
      summary: `保存项目密钥「${name}」（应用 ${appId}）`,
    });
    return { name: saved.name, note: saved.note, configured: true, updatedAt: saved.updatedAt.toISOString() };
  }

  async remove(appId: string, name: string, user: AuthPayload): Promise<void> {
    await this.assertOwner(appId, user);
    await this.secretRepo.delete({ appId, name });
    this.audit.record({
      user,
      type: AuditType.DELETE,
      resource: AuditResource.RUNTIME,
      action: 'delete_runtime_secret',
      targetId: appId,
      targetName: name,
      summary: `删除项目密钥「${name}」（应用 ${appId}）`,
    });
  }

  /** 仅供线上运行时代理解析 ${SECRET:NAME}；不得从控制器返回。 */
  async resolve(appId: string, name: string): Promise<string> {
    const row = await this.secretRepo.findOne({ where: { appId, name } });
    if (!row) throw new NotFoundException(`项目密钥未配置：${name}`);
    return this.decrypt(row);
  }

  private key(): Buffer {
    const raw = (
      this.config.get<string>('PROJECT_SECRET_MASTER_KEY', '') ||
      this.config.get<string>('JWT_SECRET', '')
    ).trim();
    if (!raw) throw new ServiceUnavailableException('服务端未配置 PROJECT_SECRET_MASTER_KEY，无法保存项目密钥');
    return createHash('sha256').update(raw).digest();
  }

  private encrypt(value: string) {
    const encryptionIv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), encryptionIv);
    const encryptedValue = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return { encryptedValue: encryptedValue.toString('base64'), encryptionIv: encryptionIv.toString('base64'), encryptionTag: cipher.getAuthTag().toString('base64') };
  }

  private decrypt(row: ProjectRuntimeSecret): string {
    const decipher = createDecipheriv('aes-256-gcm', this.key(), Buffer.from(row.encryptionIv, 'base64'));
    decipher.setAuthTag(Buffer.from(row.encryptionTag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(row.encryptedValue, 'base64')), decipher.final()]).toString('utf8');
  }

  private async assertOwner(appId: string, user: AuthPayload): Promise<LowcodeApp> {
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) throw new NotFoundException('应用不存在');
    await this.projectAccess.assertCanEditContent(user, app);
    return app;
  }
}
