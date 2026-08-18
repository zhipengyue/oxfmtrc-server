import { AppLayoutType } from './app-layout-type.enum';
import { createEmptyLayout } from './default-app-config';
import { LowcodeApp } from './lowcode-app.entity';
import { LowcodePage } from './lowcode-page.entity';
import { layoutHasContent } from './copy-app.util';

/** 合并 DB 页面与 draftConfig 中缓存的非主端布局 */
export function mergeSourceDraftPages(
  app: LowcodeApp,
  pages: LowcodePage[],
): Record<string, unknown>[] {
  const dbDraft = buildDraftPagesFromRecords(app, pages);
  const storedDraft = app.draftConfig as Record<string, unknown>;
  const storedPages = Array.isArray(storedDraft.pages)
    ? (storedDraft.pages as Record<string, unknown>[])
    : [];

  return dbDraft.map((dbPage) => {
    const stored = storedPages.find((p) => p.id === dbPage.id);
    if (!stored) return dbPage;

    if (
      app.primaryLayout === AppLayoutType.WEB &&
      layoutHasContent(stored.mobile)
    ) {
      return { ...dbPage, mobile: stored.mobile };
    }
    if (
      app.primaryLayout === AppLayoutType.MOBILE &&
      layoutHasContent(stored.pc)
    ) {
      return { ...dbPage, pc: stored.pc };
    }
    return dbPage;
  });
}

/** 将 lowcode_pages 同步写入 draftConfig.pages（供编辑器 draft 接口使用） */
export function buildDraftPagesFromRecords(
  app: LowcodeApp,
  pages: LowcodePage[],
): Record<string, unknown>[] {
  return pages.map((p) => ({
    id: p.id,
    name: p.name,
    pc:
      app.primaryLayout === AppLayoutType.WEB
        ? p.detail
        : (createEmptyLayout() as unknown as Record<string, unknown>),
    mobile:
      app.primaryLayout === AppLayoutType.MOBILE
        ? p.detail
        : (createEmptyLayout() as unknown as Record<string, unknown>),
  }));
}

export function mergeDraftConfigPages(
  app: LowcodeApp,
  pages: LowcodePage[],
): Record<string, unknown> {
  const draft = { ...(app.draftConfig as Record<string, unknown>) };
  draft.pages = buildDraftPagesFromRecords(app, pages);
  draft.updatedAt = new Date().toISOString();
  return draft;
}

/** 保留 remapped draft 中非主端布局分支 */
export function mergeInactiveLayoutBranches(
  app: LowcodeApp,
  targetDraft: Record<string, unknown>,
  remappedPages: Record<string, unknown>[],
): void {
  const pages = Array.isArray(targetDraft.pages)
    ? (targetDraft.pages as Record<string, unknown>[])
    : [];
  for (const page of pages) {
    const remapped = remappedPages.find((p) => p.id === page.id);
    if (!remapped) continue;
    if (app.primaryLayout === AppLayoutType.WEB) {
      page.mobile = remapped.mobile;
    } else {
      page.pc = remapped.pc;
    }
  }
}
