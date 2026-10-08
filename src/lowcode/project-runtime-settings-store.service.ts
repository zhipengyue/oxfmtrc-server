import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { LowcodeApp } from './lowcode-app.entity';
import { ProjectRuntimeSetting } from './project-runtime-setting.entity';
import { ProjectAccessService } from '../tenants/project-access.service';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';

@Injectable()
export class ProjectRuntimeSettingsStoreService {
  constructor(
    @InjectRepository(ProjectRuntimeSetting) private readonly settingsRepo: Repository<ProjectRuntimeSetting>,
    @InjectRepository(LowcodeApp) private readonly appRepo: Repository<LowcodeApp>,
    private readonly projectAccess: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async get(appId: string, user: AuthPayload): Promise<Record<string, unknown>> {
    await this.assertAccess(appId, user, 'view');
    return (await this.read(appId)) ?? {};
  }

  async read(appId: string): Promise<Record<string, unknown> | null> {
    const existing = await this.settingsRepo.findOne({ where: { appId } });
    return existing?.settings ?? null;
  }

  async save(appId: string, settings: Record<string, unknown>, user: AuthPayload): Promise<Record<string, unknown>> {
    const app = await this.assertAccess(appId, user, 'edit');
    let row = await this.settingsRepo.findOne({ where: { appId } });
    row = this.settingsRepo.create({ ...(row ?? {}), appId, ownerAccount: app.ownerAccount, settings });
    await this.settingsRepo.save(row);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.RUNTIME,
      action: 'save_runtime_settings',
      targetId: appId,
      targetName: app.name,
      summary: `保存运行时设置（应用 ${app.name}）`,
    });
    return settings;
  }

  async copy(source: LowcodeApp, targetAppId: string, ownerAccount: string): Promise<void> {
    const settings = await this.read(source.appId);
    if (!settings) return;
    await this.settingsRepo.save(this.settingsRepo.create({ appId: targetAppId, ownerAccount, settings }));
  }

  private async assertAccess(
    appId: string,
    user: AuthPayload,
    mode: 'view' | 'edit',
  ): Promise<LowcodeApp> {
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) throw new NotFoundException('应用不存在');
    if (mode === 'view') await this.projectAccess.assertCanView(user, app);
    else await this.projectAccess.assertCanEditContent(user, app);
    return app;
  }
}
