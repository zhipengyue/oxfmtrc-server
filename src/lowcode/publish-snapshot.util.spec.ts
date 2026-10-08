import {
  buildPublishedSnapshot,
  nextPatchVersion,
  stripPublishAccessCode,
} from './publish-snapshot.util';

describe('publish-snapshot.util', () => {
  it('increments the patch version', () => {
    expect(nextPatchVersion('1.0.0')).toBe('1.0.1');
    expect(nextPatchVersion('2.3.9')).toBe('2.3.10');
    expect(nextPatchVersion('bad')).toBe('1.0.1');
  });

  it('strips the plaintext access code from publish options', () => {
    expect(
      stripPublishAccessCode({
        allowThemeSwitch: true,
        accessCode: 'secret',
        accessCodeHash: 'abc',
      }),
    ).toEqual({
      allowThemeSwitch: true,
      accessCodeHash: 'abc',
    });
  });

  it('builds a published snapshot without the access code', () => {
    const published = buildPublishedSnapshot(
      {
        appId: 'app-1',
        version: '1.0.0',
        currentDraftVersion: '1.0.0',
        publishedVersions: [],
        publishOptions: { accessCode: 'gate-9', accessCodeHash: 'hash' },
      },
      'go live',
      '2026-09-06T00:00:00.000Z',
    );

    expect(published.version).toBe('1.0.1');
    expect(published.publishOptions).toEqual({ accessCodeHash: 'hash' });
    expect(published.publishedVersions).toEqual([
      {
        version: '1.0.1',
        note: 'go live',
        createdAt: '2026-09-06T00:00:00.000Z',
        isDefault: true,
      },
    ]);
  });
});
