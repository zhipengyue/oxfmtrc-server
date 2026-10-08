export interface PublishedVersionEntry {
  version: string;
  note: string;
  createdAt: string;
  isDefault: boolean;
}

export function nextPatchVersion(version: string): string {
  const parts = version.split('.').map((item) => Number.parseInt(item, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    return '1.0.1';
  }
  const major = parts[0] ?? 1;
  const minor = parts[1] ?? 0;
  const patch = parts[2] ?? 0;
  return `${major}.${minor}.${patch + 1}`;
}

export function stripPublishAccessCode(
  options: unknown,
): Record<string, unknown> | undefined {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    return undefined;
  }
  const { accessCode: _accessCode, ...rest } = options as Record<string, unknown>;
  return rest;
}

export function buildPublishedSnapshot(
  draft: Record<string, unknown>,
  note = '',
  now = new Date().toISOString(),
): Record<string, unknown> {
  const nextVersion = nextPatchVersion(
    String(draft.currentDraftVersion || draft.version || '1.0.0'),
  );
  const versions = Array.isArray(draft.publishedVersions)
    ? (draft.publishedVersions as PublishedVersionEntry[])
    : [];
  const publishedVersions: PublishedVersionEntry[] = [
    {
      version: nextVersion,
      note: note.trim() || `Publish ${nextVersion}`,
      createdAt: now,
      isDefault: true,
    },
    ...versions.map((item) => ({ ...item, isDefault: false })),
  ];
  return {
    ...draft,
    version: nextVersion,
    currentDraftVersion: nextVersion,
    updatedAt: now,
    publishedVersions,
    publishOptions: stripPublishAccessCode(draft.publishOptions) ?? {
      allowThemeSwitch: true,
      allowLocaleSwitch: true,
      allowManualDataRefresh: true,
    },
  };
}
