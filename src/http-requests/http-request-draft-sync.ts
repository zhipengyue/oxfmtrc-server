import { LowcodeApp } from '../lowcode/lowcode-app.entity';
import { AppHttpRequest } from './http-request.entity';
import { HttpRequestStatus } from './http-request.enums';

/** 同步到 draftConfig.projectConfig.dataSources */
export function toDataSourceJson(row: AppHttpRequest): Record<string, unknown> {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    type: row.type,
    ...(row.method ? { method: row.method } : {}),
    ...(row.mqttMode ? { mqttMode: row.mqttMode } : {}),
    ...(row.wsMode ? { wsMode: row.wsMode } : {}),
    status: row.status ?? HttpRequestStatus.ENABLED,
    autoRequest: row.autoRequest,
    frequencyMs: row.frequencyMs,
    paramsFn: row.paramsFn ?? '',
    headersFn: row.headersFn ?? '',
    responseFn: row.responseFn ?? '',
    configText: row.configText ?? '',
  };
}

export function mergeProjectConfigDataSources(
  app: LowcodeApp,
  rows: AppHttpRequest[],
): Record<string, unknown> {
  const draft = { ...(app.draftConfig as Record<string, unknown>) };
  const prev =
    (draft.projectConfig as Record<string, unknown> | undefined) ?? {};
  draft.projectConfig = {
    ...prev,
    dataSources: rows.map(toDataSourceJson),
    globalVars: (prev.globalVars as unknown[]) ?? [],
    cssVars: (prev.cssVars as unknown[]) ?? [],
    jsText: (prev.jsText as string) ?? '',
    styleText: (prev.styleText as string) ?? '',
  };
  draft.updatedAt = new Date().toISOString();
  return draft;
}
