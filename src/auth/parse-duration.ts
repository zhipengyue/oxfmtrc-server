/** 解析如 30d、2h、15m 为毫秒 */
export function parseDurationMs(raw: string, fallbackMs: number): number {
  const s = raw.trim();
  const m = /^(\d+)([smhd])$/i.exec(s);
  if (!m) return fallbackMs;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const multipliers: Record<string, number> = {
    s: 1000,
    m: 60 * 1000,
    h: 60 * 60 * 1000,
    d: 24 * 60 * 60 * 1000,
  };
  return n * (multipliers[unit] ?? 0) || fallbackMs;
}
