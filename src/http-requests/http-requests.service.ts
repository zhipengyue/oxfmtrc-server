import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { AuthPayload } from '../auth/auth.service';
import { LowcodeApp } from '../lowcode/lowcode-app.entity';
import {
  CreateHttpRequestDto,
  DEFAULT_RESPONSE_FN,
  UpdateHttpRequestDto,
} from './dto/http-request.dto';
import { DEFAULT_APP_HTTP_REQUESTS } from './default-app-http-requests';
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
  frequencyMs: number;
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
  ) {}

  async list(appId: string, user: AuthPayload): Promise<HttpRequestListItem[]> {
    const app = await this.findOwnedAppOrThrow(appId, user);
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
    await this.findOwnedAppOrThrow(appId, user);
    const row = await this.findRequestOrThrow(appId, id);
    return this.toDetail(row);
  }

  async create(
    appId: string,
    dto: CreateHttpRequestDto,
    user: AuthPayload,
  ): Promise<HttpRequestDetail> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const name = dto.name.trim();
    await this.ensureUniqueName(appId, name);
    const row = this.requestRepo.create(this.fromDto(appId, { ...dto, name }));
    await this.requestRepo.save(row);
    await this.syncDraft(app);
    return this.toDetail(row);
  }

  async update(
    appId: string,
    id: string,
    dto: UpdateHttpRequestDto,
    user: AuthPayload,
  ): Promise<HttpRequestDetail> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const row = await this.findRequestOrThrow(appId, id);
    const name = dto.name.trim();
    await this.ensureUniqueName(appId, name, id);
    Object.assign(row, this.fromDto(appId, { ...dto, name }, row.id));
    await this.requestRepo.save(row);
    await this.syncDraft(app);
    return this.toDetail(row);
  }

  async remove(appId: string, id: string, user: AuthPayload): Promise<void> {
    const app = await this.findOwnedAppOrThrow(appId, user);
    const row = await this.findRequestOrThrow(appId, id);
    await this.requestRepo.remove(row);
    await this.syncDraft(app);
  }

  /** 写入预置请求（按名称去重），供新建应用与首次打开列表时调用 */
  async ensureDefaultRequests(app: LowcodeApp): Promise<void> {
    let inserted = false;
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
          status: template.status,
          paramsFn: template.paramsFn,
          headersFn: template.headersFn,
          responseFn: template.responseFn,
          configText: template.configText,
        }),
      );
      inserted = true;
    }
    if (inserted) {
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

  private async findOwnedAppOrThrow(
    appId: string,
    user: AuthPayload,
  ): Promise<LowcodeApp> {
    const app = await this.appRepo.findOne({ where: { appId } });
    if (!app) {
      throw new NotFoundException('应用不存在');
    }
    if (app.ownerAccount !== user.phone) {
      throw new ForbiddenException('无权访问该应用');
    }
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
      frequencyMs: row.frequencyMs,
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
