/** 从应用名称生成 URL slug */
export function slugifyFromName(name: string): string {
  const base = name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (base.length >= 2) return base.slice(0, 48);
  return `app-${Date.now().toString(36)}`;
}

export function newAppId(): string {
  return `app-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}
