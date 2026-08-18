import { randomUUID } from 'crypto';

/** 复制应用时需替换 ID 的映射表 */
export interface CopyIdMaps {
  pageIds: Map<string, string>;
  requestIds: Map<string, string>;
  customComponentIds: Map<string, string>;
}

const PAGE_REF_KEYS = new Set([
  'popupPageId',
  'pageId',
  'targetPageId',
  'jumpPageId',
  'navigatePageId',
  'linkPageId',
  'openPageId',
]);

const REQUEST_REF_KEYS = new Set(['pageDataSourceId', 'dataSourceId']);

const CUSTOM_COMPONENT_REF_KEYS = new Set(['customComponentId']);

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function remapStringRef(
  key: string,
  value: string,
  maps: CopyIdMaps,
): string {
  if (PAGE_REF_KEYS.has(key) && maps.pageIds.has(value)) {
    return maps.pageIds.get(value)!;
  }
  if (REQUEST_REF_KEYS.has(key) && maps.requestIds.has(value)) {
    return maps.requestIds.get(value)!;
  }
  if (CUSTOM_COMPONENT_REF_KEYS.has(key) && maps.customComponentIds.has(value)) {
    return maps.customComponentIds.get(value)!;
  }
  return value;
}

/** 深度遍历 JSON，替换页面 / 请求 / 自定义组件引用 */
export function remapReferencesDeep(value: unknown, maps: CopyIdMaps): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    return value.map((item) => remapReferencesDeep(item, maps));
  }
  if (typeof value !== 'object') return value;

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === 'string') {
      next[key] = remapStringRef(key, raw, maps);
    } else {
      next[key] = remapReferencesDeep(raw, maps);
    }
  }
  return next;
}

export function buildCustomComponentIdMap(
  customComponents: unknown,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!Array.isArray(customComponents)) return map;
  for (const item of customComponents) {
    if (!item || typeof item !== 'object') continue;
    const id = String((item as Record<string, unknown>).id ?? '').trim();
    if (!id || map.has(id)) continue;
    map.set(id, randomUUID());
  }
  return map;
}

export function remapCustomComponents(
  customComponents: unknown,
  maps: CopyIdMaps,
): unknown[] {
  if (!Array.isArray(customComponents)) return [];
  return customComponents.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = { ...(item as Record<string, unknown>) };
    const oldId = String(row.id ?? '').trim();
    if (oldId && maps.customComponentIds.has(oldId)) {
      row.id = maps.customComponentIds.get(oldId)!;
    }
    return row;
  });
}

export function remapDraftPages(
  pages: unknown,
  maps: CopyIdMaps,
): Record<string, unknown>[] {
  if (!Array.isArray(pages)) return [];
  return pages.map((item) => {
    if (!item || typeof item !== 'object') return item as Record<string, unknown>;
    const page = item as Record<string, unknown>;
    const oldId = String(page.id ?? '').trim();
    const newId = maps.pageIds.get(oldId) ?? oldId;
    return {
      ...page,
      id: newId,
      pc: remapReferencesDeep(page.pc, maps),
      mobile: remapReferencesDeep(page.mobile, maps),
    } as Record<string, unknown>;
  });
}

export function remapProjectConfig(
  projectConfig: unknown,
  maps: CopyIdMaps,
): Record<string, unknown> {
  if (!projectConfig || typeof projectConfig !== 'object') {
    return {
      dataSources: [],
      globalVars: [],
      cssVars: [],
      jsText: '',
      styleText: '',
    };
  }
  const cfg = deepClone(projectConfig) as Record<string, unknown>;
  const dataSources = Array.isArray(cfg.dataSources) ? cfg.dataSources : [];
  cfg.dataSources = dataSources.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const row = { ...(item as Record<string, unknown>) };
    const oldId = String(row.id ?? '').trim();
    if (oldId && maps.requestIds.has(oldId)) {
      row.id = maps.requestIds.get(oldId)!;
    }
    return row;
  });
  cfg.globalVars = remapReferencesDeep(cfg.globalVars ?? [], maps);
  cfg.cssVars = remapReferencesDeep(cfg.cssVars ?? [], maps);
  if (typeof cfg.jsText === 'string') {
    cfg.jsText = replaceEmbeddedIdsInText(cfg.jsText, maps);
  }
  if (typeof cfg.styleText === 'string') {
    cfg.styleText = replaceEmbeddedIdsInText(cfg.styleText, maps);
  }
  return cfg;
}

function replaceEmbeddedIdsInText(text: string, maps: CopyIdMaps): string {
  let result = text;
  for (const [oldId, newId] of maps.pageIds) {
    result = result.split(oldId).join(newId);
  }
  for (const [oldId, newId] of maps.requestIds) {
    result = result.split(oldId).join(newId);
  }
  for (const [oldId, newId] of maps.customComponentIds) {
    result = result.split(oldId).join(newId);
  }
  return result;
}

export interface RemapDraftMeta {
  appId: string;
  name: string;
  slug: string;
  ownerAccount: string;
  categoryId: string;
}

/** 复制并替换 draftConfig 内所有跨实体 ID 引用 */
export function remapDraftConfig(
  draft: Record<string, unknown>,
  maps: CopyIdMaps,
  meta: RemapDraftMeta,
): Record<string, unknown> {
  const next = deepClone(draft);
  next.appId = meta.appId;
  next.name = meta.name;
  next.slug = meta.slug;
  next.ownerAccount = meta.ownerAccount;
  next.categoryId = meta.categoryId;
  next.updatedAt = new Date().toISOString();
  next.publishedVersions = [];
  next.version = '1.0.0';
  next.currentDraftVersion = '1.0.0';

  next.pages = remapDraftPages(next.pages, maps);

  const editorCurrentPageId = String(next.editorCurrentPageId ?? '').trim();
  if (editorCurrentPageId && maps.pageIds.has(editorCurrentPageId)) {
    next.editorCurrentPageId = maps.pageIds.get(editorCurrentPageId)!;
  }

  next.customComponents = remapCustomComponents(next.customComponents, maps);
  next.projectConfig = remapProjectConfig(next.projectConfig, maps);

  if (next.i18n && typeof next.i18n === 'object') {
    const i18n = next.i18n as Record<string, unknown>;
    const messages = i18n.messages as Record<string, Record<string, string>> | undefined;
    if (messages?.['zh-CN']) {
      messages['zh-CN'].appTitle = meta.name;
    }
    if (messages?.['en-US']) {
      messages['en-US'].appTitle = meta.name;
    }
  }

  return next;
}

export function layoutHasContent(layout: unknown): boolean {
  if (!layout || typeof layout !== 'object') return false;
  const nodes = (layout as Record<string, unknown>).nodes;
  return Array.isArray(nodes) && nodes.length > 0;
}
