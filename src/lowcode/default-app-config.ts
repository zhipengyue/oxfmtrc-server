import { AppLayoutType } from './app-layout-type.enum';
import { CanvasLayoutMode } from './canvas-layout-mode.enum';

export interface DefaultLayoutRoot {
  nodes: unknown[];
  props?: Record<string, unknown>;
}

export function createEmptyLayout(): DefaultLayoutRoot {
  return { nodes: [] };
}

/** 与前端 createDefaultAppConfig 对齐的初始草稿 */
export function buildDefaultDraftConfig(input: {
  appId: string;
  name: string;
  slug: string;
  ownerAccount: string;
  categoryId: string;
  primaryLayout: AppLayoutType;
  canvasLayoutMode: CanvasLayoutMode;
  defaultPageId: string;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const empty = createEmptyLayout();
  return {
    appId: input.appId,
    name: input.name,
    slug: input.slug,
    ownerAccount: input.ownerAccount,
    categoryId: input.categoryId,
    primaryLayout: input.primaryLayout,
    canvasLayoutMode: input.canvasLayoutMode,
    version: '1.0.0',
    currentDraftVersion: '1.0.0',
    updatedAt: now,
    theme: {
      '--primary-color': '#409eff',
      '--text-color': '#303133',
    },
    splash: { enabled: false, pageId: '', targetPageId: '', minDurationMs: 800 },
    i18n: {
      defaultLocale: 'zh-CN',
      messages: {
        'zh-CN': { appTitle: input.name },
        'en-US': { appTitle: input.name },
      },
    },
    publishOptions: {
      allowThemeSwitch: true,
      allowLocaleSwitch: true,
      allowManualDataRefresh: true,
    },
    publishedVersions: [],
    pages: [
      {
        id: input.defaultPageId,
        name: '首页',
        pc:
          input.primaryLayout === AppLayoutType.WEB ? empty : createEmptyLayout(),
        mobile:
          input.primaryLayout === AppLayoutType.MOBILE
            ? empty
            : createEmptyLayout(),
      },
    ],
    editorCurrentPageId: input.defaultPageId,
  };
}
