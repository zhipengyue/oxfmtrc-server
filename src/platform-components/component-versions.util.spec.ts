import {
  collapseMarketToLatestVersions,
  componentFamilyKey,
  findPublishFamilyHead,
  nextPatchVersion,
} from './component-versions.util'

describe('component versions util', () => {
  it('groups official same-name cards and keeps the latest', () => {
    const older = {
      id: 'old',
      name: '聚光卡片',
      platform: 'web',
      status: 'published',
      visibility: 'official',
      version: '1.0.0',
      updatedAt: '2026-01-01',
    }
    const newer = {
      id: 'new',
      name: '聚光卡片',
      platform: 'web',
      status: 'published',
      visibility: 'official',
      version: '1.0.1',
      updatedAt: '2026-02-01',
    }
    expect(componentFamilyKey(older)).toBe(componentFamilyKey(newer))
    expect(collapseMarketToLatestVersions([older, newer]).map((item) => item.id)).toEqual(['new'])
  })

  it('treats same-name official drafts as a new version of the existing family', () => {
    const head = findPublishFamilyHead(
      [
        {
          id: 'head',
          name: '卡片桑基图',
          platform: 'web',
          status: 'published',
          visibility: 'official',
          familyId: 'fam-1',
          version: '1.0.0',
        },
      ],
      {
        id: 'draft',
        name: '卡片桑基图',
        platform: 'web',
        status: 'unpublished',
        visibility: null,
      },
      'official',
    )
    expect(head?.familyId).toBe('fam-1')
    expect(nextPatchVersion(head?.version)).toBe('1.0.1')
  })
})
