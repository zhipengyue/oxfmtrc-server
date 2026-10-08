import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { ProjectAccessService } from '../tenants/project-access.service';
import { LowcodeApp } from '../lowcode/lowcode-app.entity';
import { AuditService } from '../audit/audit.service';
import { AuditResource } from '../audit/audit-resource.enum';
import { AuditType } from '../audit/audit-type.enum';
import {
  CreateHttpRequestDto,
  DEFAULT_RESPONSE_FN,
  UpdateHttpRequestDto,
} from './dto/http-request.dto';
import {
  DEFAULT_APP_HTTP_REQUESTS,
  DEFAULT_WEBSOCKET_DEVICE_STREAM,
} from './default-app-http-requests';
import { mergeProjectConfigDataSources } from './http-request-draft-sync';
import { AppHttpRequest } from './http-request.entity';
import { HttpMethod, HttpRequestStatus, HttpRequestType } from './http-request.enums';

export interface HttpRequestListItem {
  id: string;
  name: string;
  address: string;
  type: HttpRequestType;
  method: HttpMethod | null;
  status: HttpRequestStatus;
  autoRequest: boolean;
  frequencyMs: number;
  mqttMode: string | null;
  wsMode: string | null;
  paramsFn: string;
  headersFn: string;
  responseFn: string;
  configText: string;
  updatedAt: string;
}

export interface HttpRequestDetail {
  id: string;
  appId: string;
  name: string;
  address: string;
  type: HttpRequestType;
  method: HttpMethod | null;
  mqttMode: string | null;
  wsMode: string | null;
  status: HttpRequestStatus;
  autoRequest: boolean;
  frequencyMs: number;
  paramsFn: string;
  headersFn: string;
  responseFn: string;
  configText: string;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class HttpRequestsService {
  constructor(
    @InjectRepository(AppHttpRequest)
    private readonly requestRepo: Repository<AppHttpRequest>,
    @InjectRepository(LowcodeApp)
    private readonly appRepo: Repository<LowcodeApp>,
    private readonly projectAccess: ProjectAccessService,
    private readonly audit: AuditService,
  ) {}

  async list(appId: string, user: AuthPayload): Promise<HttpRequestListItem[]> {
    const app = await this.findAppOrThrow(appId, user, 'view');
    await this.ensureDefaultRequests(app);
    const rows = await this.requestRepo.find({
      where: { appId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toListItem(r));
  }

  async getById(
    appId: string,
    id: string,
    user: AuthPayload,
  ): Promise<HttpRequestDetail> {
    await this.findAppOrThrow(appId, user, 'view');
    const row = await this.findRequestOrThrow(appId, id);
    return this.toDetail(row);
  }

  async create(
    appId: string,
    dto: CreateHttpRequestDto,
    user: AuthPayload,
  ): Promise<HttpRequestDetail> {
    const app = await this.findAppOrThrow(appId, user, 'edit');
    const name = dto.name.trim();
    await this.ensureUniqueName(appId, name);
    const row = this.requestRepo.create(this.fromDto(appId, { ...dto, name }));
    await this.requestRepo.save(row);
    await this.syncDraft(app);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.HTTP_REQUEST,
      action: 'create_http_request',
      targetId: row.id,
      targetName: row.name,
      summary: `创建数据请求「${row.name}」（应用 ${appId}）`,
    });
    return this.toDetail(row);
  }

  async update(
    appId: string,
    id: string,
    dto: UpdateHttpRequestDto,
    user: AuthPayload,
  ): Promise<HttpRequestDetail> {
    const app = await this.findAppOrThrow(appId, user, 'edit');
    const row = await this.findRequestOrThrow(appId, id);
    const name = dto.name.trim();
    await this.ensureUniqueName(appId, name, id);
    Object.assign(row, this.fromDto(appId, { ...dto, name }, row.id));
    await this.requestRepo.save(row);
    await this.syncDraft(app);
    this.audit.record({
      user,
      type: AuditType.SAVE,
      resource: AuditResource.HTTP_REQUEST,
      action: 'save_http_request',
      targetId: row.id,
      targetName: row.name,
      summary: `保存数据请求「${row.name}」（应用 ${appId}）`,
    });
    return this.toDetail(row);
  }

  async remove(appId: string, id: string, user: AuthPayload): Promise<void> {
    const app = await this.findAppOrThrow(appId, user, 'edit');
    const row = await this.findRequestOrThrow(appId, id);
    const name = row.name;
    await this.requestRepo.remove(row);
    await this.syncDraft(app);
    this.audit.record({
      user,
      type: AuditType.DELETE,
      resource: AuditResource.HTTP_REQUEST,
      action: 'delete_http_request',
      targetId: id,
      targetName: name,
      summary: `删除数据请求「${name}」（应用 ${appId}）`,
    });
  }

  /**
   * 兼容旧逻辑入口（新建应用 / 打开请求列表时调用）。
   * 不再写入预置请求；清理历史自动注入的「设备采集数据」（表记录 + draft 幽灵项）。
   */
  async ensureDefaultRequests(app: LowcodeApp): Promise<void> {
    let changed = false;

    const legacyRows = await this.requestRepo.find({
      where: {
        appId: app.appId,
        name: DEFAULT_WEBSOCKET_DEVICE_STREAM.name,
        address: DEFAULT_WEBSOCKET_DEVICE_STREAM.address,
      },
    });
    if (legacyRows.length > 0) {
      await this.requestRepo.remove(legacyRows);
      changed = true;
    }

    const draft = (app.draftConfig ?? {}) as Record<string, unknown>;
    const prevProject =
      (draft.projectConfig as Record<string, unknown> | undefined) ?? {};
    const prevSources = Array.isArray(prevProject.dataSources)
      ? (prevProject.dataSources as Array<Record<string, unknown>>)
      : [];
    const scrubbed = prevSources.filter((item) => {
      const name = String(item?.name ?? '');
      const address = String(item?.address ?? '');
      return !(
        name === DEFAULT_WEBSOCKET_DEVICE_STREAM.name &&
        address === DEFAULT_WEBSOCKET_DEVICE_STREAM.address
      );
    });
    if (scrubbed.length !== prevSources.length) {
      app.draftConfig = {
        ...draft,
        projectConfig: {
          ...prevProject,
          dataSources: scrubbed,
        },
        updatedAt: new Date().toISOString(),
      };
      changed = true;
    }

    for (const template of DEFAULT_APP_HTTP_REQUESTS) {
      const exists = await this.requestRepo.findOne({
        where: { appId: app.appId, name: template.name },
      });
      if (exists) continue;
      await this.requestRepo.save(
        this.requestRepo.create({
          appId: app.appId,
          name: template.name,
          address: template.address,
          type: template.type,
          method: template.method,
          mqttMode: template.mqttMode,
          wsMode: template.wsMode,
          frequencyMs: template.frequencyMs,
          autoRequest: true,
          status: template.status,
          paramsFn: template.paramsFn,
          headersFn: template.headersFn,
          responseFn: template.responseFn,
          configText: template.configText,
        }),
      );
      changed = true;
    }

    if (changed) {
      await this.syncDraft(app);
    }
  }

  private async ensureUniqueName(
    appId: string,
    name: string,
    excludeId?: string,
  ): Promise<void> {
    const dup = await this.requestRepo.findOne({ where: { appId, name } });
    if (dup && dup.id !== excludeId) {
      throw new ConflictException('该项目下已存在同名请求');
    }
  }

  private fromDto(
    appId: string,
    dto: CreateHttpRequestDto,
    id?: string,
  ): Partial<AppHttpRequest> {
    return {
      ...(id ? { id } : {}),
      appId,
      name: dto.name.trim(),
      address: dto.address.trim(),
      type: dto.type,
      method: dto.type === HttpRequestType.HTTP ? (dto.method ?? null) : null,
      mqttMode:
        dto.type === HttpRequestType.MQTT ? (dto.mqttMode ?? null) : null,
      wsMode:
        dto.type === HttpRequestType.WEBSOCKET ? (dto.wsMode ?? null) : null,
      frequencyMs: dto.frequencyMs,
      autoRequest: dto.autoRequest,
      status: dto.status ?? HttpRequestStatus.ENABLED,
      paramsFn: dto.paramsFn ?? '',
      headersFn: dto.headersFn ?? '',
      responseFn: dto.responseFn?.trim() || DEFAULT_RESPONSE_FN,
      configText: dto.configText ?? '',
    };
  }

  private async syncDraft(app: LowcodeApp): Promise<void> {
    const rows = await this.requestRepo.find({
      where: { appId: app.appId },
      order: { createdAt: 'ASC' },
    });
    app.draftConfig = mergeProjectConfigDataSources(app, rows);
    await this.appRepo.save(app);
  }

  private async findRequestOrThrow(
    appId: string,
    id: string,
  ): Promise<AppHttpRequest> {
    const row = await this.requestRepo.findOne({ where: { id, appId } });
    if (!row) {
      throw new NotFoundException('请求配置不存在');
    }
    return row;
  }

  private async findAppOrThrow(
    appId: string,
    user: AuthPayload,
    mode: 'view' | 'edit',
  ): Promise<LowcodeApp> {
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    if (mode === 'view') await this.projectAccess.assertCanView(user, app);
    else await this.projectAccess.assertCanEditContent(user, app);
    return app;
  }

  private toListItem(row: AppHttpRequest): HttpRequestListItem {
    return {
      id: row.id,
      name: row.name,
      address: row.address,
      type: row.type,
      method: row.method,
      status: row.status ?? HttpRequestStatus.ENABLED,
      autoRequest: row.autoRequest,
      frequencyMs: row.frequencyMs,
      mqttMode: row.mqttMode,
      wsMode: row.wsMode,
      paramsFn: row.paramsFn ?? '',
      headersFn: row.headersFn ?? '',
      responseFn: row.responseFn ?? DEFAULT_RESPONSE_FN,
      configText: row.configText ?? '',
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toDetail(row: AppHttpRequest): HttpRequestDetail {
    return {
      id: row.id,
      appId: row.appId,
      name: row.name,
      address: row.address,
      type: row.type,
      method: row.method,
      mqttMode: row.mqttMode,
      wsMode: row.wsMode,
      status: row.status ?? HttpRequestStatus.ENABLED,
      autoRequest: row.autoRequest,
      frequencyMs: row.frequencyMs,
      paramsFn: row.paramsFn ?? '',
      headersFn: row.headersFn ?? '',
      responseFn: row.responseFn ?? DEFAULT_RESPONSE_FN,
      configText: row.configText ?? '',
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
