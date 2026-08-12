import {
  getPlatformCapabilityProfile,
  isKnownPlatform,
  isPlatformCapability,
  KNOWN_PLATFORMS,
  PLATFORM_CAPABILITIES,
  PLATFORM_CAPABILITY_MATRIX,
  queryPlatformCapability
} from '../PlatformCapabilityService';

describe('PlatformCapabilityService', () => {
  it('keeps the platform inventory explicit and rejects unknown platforms', () => {
    expect(KNOWN_PLATFORMS).toEqual([
      'chrome',
      'firefox',
      'safari',
      'userscript',
      'zotero',
      'ios',
      'android'
    ]);
    expect(isKnownPlatform('chrome')).toBe(true);
    expect(isKnownPlatform('edge')).toBe(false);
    expect(getPlatformCapabilityProfile('edge')).toBeNull();

    expect(queryPlatformCapability('edge', 'pageTranslation')).toEqual(expect.objectContaining({
      knownPlatform: false,
      available: false,
      platform: null,
      capability: 'pageTranslation',
      status: 'unknown'
    }));
  });

  it('reports only Chrome and Firefox as implemented release targets', () => {
    expect(PLATFORM_CAPABILITY_MATRIX.chrome.releaseStatus).toBe('supported');
    expect(PLATFORM_CAPABILITY_MATRIX.firefox.releaseStatus).toBe('supported');

    for (const platform of ['safari', 'userscript', 'zotero', 'ios', 'android'] as const) {
      const profile = PLATFORM_CAPABILITY_MATRIX[platform];
      expect(profile.releaseStatus).toBe('unsupported');
      for (const capability of PLATFORM_CAPABILITIES) {
        expect(profile.capabilities[capability].status).toBe('unsupported');
      }
    }
  });

  it('models side panel, sidebar, and tab capture from the current browser targets', () => {
    expect(queryPlatformCapability('chrome', 'sidePanel')).toEqual(expect.objectContaining({
      available: true,
      status: 'supported',
      requiresExplicitUserAction: true
    }));
    expect(queryPlatformCapability('chrome', 'sidebar')).toEqual(expect.objectContaining({
      available: false,
      status: 'unsupported'
    }));
    expect(queryPlatformCapability('chrome', 'tabCapture')).toEqual(expect.objectContaining({
      available: true,
      status: 'supported',
      requiresExplicitUserAction: true
    }));

    expect(queryPlatformCapability('firefox', 'sidePanel')).toEqual(expect.objectContaining({
      available: false,
      status: 'unsupported'
    }));
    expect(queryPlatformCapability('firefox', 'sidebar')).toEqual(expect.objectContaining({
      available: true,
      status: 'supported',
      requiresExplicitUserAction: true
    }));
    expect(queryPlatformCapability('firefox', 'tabCapture')).toEqual(expect.objectContaining({
      available: false,
      status: 'unsupported'
    }));
  });

  it('rejects unknown capabilities without inferring browser support', () => {
    expect(isPlatformCapability('pageTranslation')).toBe(true);
    expect(isPlatformCapability('nativeShareSheet')).toBe(false);
    expect(queryPlatformCapability('chrome', 'nativeShareSheet')).toEqual(expect.objectContaining({
      knownPlatform: true,
      available: false,
      platform: 'chrome',
      capability: null,
      status: 'unknown'
    }));
  });

  it('requires an explicit user action for every interactive runtime capability', () => {
    const interactiveCapabilities = ['pageTranslation', 'sidePanel', 'sidebar', 'tabCapture'] as const;

    for (const platform of KNOWN_PLATFORMS) {
      for (const capability of interactiveCapabilities) {
        const automatic = queryPlatformCapability(platform, capability, 'automatic');
        expect(automatic.available).toBe(false);

        const boundary = PLATFORM_CAPABILITY_MATRIX[platform].capabilities[capability];
        if (boundary.status === 'supported') {
          expect(boundary.trigger).toBe('explicit-user-action');
          expect(automatic.requiresExplicitUserAction).toBe(true);
          expect(automatic.reason).toContain('cannot start automatically');
          expect(queryPlatformCapability(platform, capability, 'explicit-user-action').available)
            .toBe(true);
        }
      }
    }
  });

  it('allows non-interactive build capability queries without a user gesture', () => {
    expect(queryPlatformCapability('chrome', 'extensionBuild', 'automatic')).toEqual(
      expect.objectContaining({
        available: true,
        status: 'supported',
        requiresExplicitUserAction: false
      })
    );
    expect(queryPlatformCapability('firefox', 'extensionBuild', 'automatic').available).toBe(true);
    expect(queryPlatformCapability('safari', 'extensionBuild', 'automatic').available).toBe(false);
  });
});
