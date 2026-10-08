export type VersionedComponent = {
  id: string
  name: string
  platform: string
  status: string
  visibility?: string | null
  ownerUserId?: string | null
  familyId?: string | null
  version?: string | null
  versionCount?: number
  template?: string
  script?: string
  style?: string
  updatedAt?: Date | string
}

export function nextPatchVersion(version?: string | null): string {
  const parts = String(version || '1.0.0')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
  const major = Number.isFinite(parts[0]) ? parts[0]! : 1
  const minor = Number.isFinite(parts[1]) ? parts[1]! : 0
  const patch = Number.isFinite(parts[2]) ? parts[2]! : 0
  return `${major}.${minor}.${patch + 1}`
}

export function componentFamilyKey(item: VersionedComponent): string {
  const visibility = item.visibility || 'unpublished'
  const owner = visibility === 'official' ? 'official' : item.ownerUserId || 'anon'
  return `fam:${visibility}:${item.platform}:${item.name.trim().toLowerCase()}:${owner}`
}

function parseVersion(version?: string | null): [number, number, number] {
  const parts = String(version || '1.0.0')
    .split('.')
    .map((part) => Number.parseInt(part, 10))
  return [
    Number.isFinite(parts[0]) ? parts[0]! : 1,
    Number.isFinite(parts[1]) ? parts[1]! : 0,
    Number.isFinite(parts[2]) ? parts[2]! : 0,
  ]
}

export function compareComponentVersions(a?: string | null, b?: string | null): number {
  const left = parseVersion(a)
  const right = parseVersion(b)
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i]! - right[i]!
  }
  return 0
}

export function sortComponentVersions<T extends VersionedComponent>(list: T[]): T[] {
  return list.slice().sort((a, b) => {
    const versionDelta = compareComponentVersions(b.version, a.version)
    if (versionDelta) return versionDelta
    return String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? ''))
  })
}

export function collapseMarketToLatestVersions<T extends VersionedComponent>(list: T[]): T[] {
  const groups = new Map<string, T[]>()
  for (const item of list) {
    if (item.status !== 'published' || !item.visibility) continue
    const key = componentFamilyKey(item)
    const bucket = groups.get(key) ?? []
    bucket.push(item)
    groups.set(key, bucket)
  }
  const latest: T[] = []
  for (const rows of groups.values()) {
    const sorted = sortComponentVersions(rows)
    const head = sorted[0]
    if (head) latest.push({ ...head, versionCount: sorted.length } as T)
  }
  return latest
}

export function findPublishFamilyHead<T extends VersionedComponent>(
  existing: T[],
  draft: T,
  visibility: string,
): T | undefined {
  const published = existing.filter(
    (item) =>
      item.status === 'published' &&
      item.visibility === visibility &&
      item.platform === draft.platform &&
      item.id !== draft.id,
  )
  if (draft.familyId) {
    const byFamily = sortComponentVersions(published.filter((item) => item.familyId === draft.familyId))
    if (byFamily[0]) return byFamily[0]
  }
  const key = componentFamilyKey({ ...draft, visibility })
  return sortComponentVersions(published.filter((item) => componentFamilyKey(item) === key))[0]
}

export function sameComponentSource(
  a: Pick<VersionedComponent, 'template' | 'script' | 'style'>,
  b: Pick<VersionedComponent, 'template' | 'script' | 'style'>,
): boolean {
  return a.template === b.template && a.script === b.script && a.style === b.style
}
