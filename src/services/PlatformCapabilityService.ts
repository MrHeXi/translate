export const KNOWN_PLATFORMS = [
  'chrome',
  'firefox',
  'safari',
  'userscript',
  'zotero',
  'ios',
  'android'
] as const;

export type KnownPlatform = typeof KNOWN_PLATFORMS[number];

export const PLATFORM_CAPABILITIES = [
  'extensionBuild',
  'pageTranslation',
  'sidePanel',
  'sidebar',
  'tabCapture'
] as const;

export type PlatformCapability = typeof PLATFORM_CAPABILITIES[number];
export type CapabilityStatus = 'supported' | 'unsupported' | 'unverified';
export type CapabilityTrigger = 'none' | 'explicit-user-action';
export type CapabilityInvocation = 'explicit-user-action' | 'automatic';

export interface CapabilityBoundary {
  readonly status: CapabilityStatus;
  readonly trigger: CapabilityTrigger;
  readonly evidence: string;
}

export interface PlatformCapabilityProfile {
  readonly platform: KnownPlatform;
  readonly releaseStatus: CapabilityStatus;
  readonly releaseEvidence: string;
  readonly capabilities: Readonly<Record<PlatformCapability, CapabilityBoundary>>;
}

export interface CapabilityQueryResult {
  readonly knownPlatform: boolean;
  readonly available: boolean;
  readonly platform: KnownPlatform | null;
  readonly capability: PlatformCapability | null;
  readonly status: CapabilityStatus | 'unknown';
  readonly requiresExplicitUserAction: boolean;
  readonly reason: string;
}

const supported = (
  trigger: CapabilityTrigger,
  evidence: string
): CapabilityBoundary => Object.freeze({ status: 'supported', trigger, evidence });

const unsupported = (evidence: string): CapabilityBoundary => Object.freeze({
  status: 'unsupported',
  trigger: 'none',
  evidence
});

const unsupportedCapabilities = (
  evidence: string
): Readonly<Record<PlatformCapability, CapabilityBoundary>> => Object.freeze({
  extensionBuild: unsupported(evidence),
  pageTranslation: unsupported(evidence),
  sidePanel: unsupported(evidence),
  sidebar: unsupported(evidence),
  tabCapture: unsupported(evidence)
});

export const PLATFORM_CAPABILITY_MATRIX: Readonly<
  Record<KnownPlatform, PlatformCapabilityProfile>
> = Object.freeze({
  chrome: Object.freeze({
    platform: 'chrome',
    releaseStatus: 'supported',
    releaseEvidence: 'A Chrome MV3 manifest and production build target exist in this repository.',
    capabilities: Object.freeze({
      extensionBuild: supported('none', 'Webpack emits the Chrome MV3 target to dist.'),
      pageTranslation: supported(
        'explicit-user-action',
        'The popup or floating control sends toggleTranslation; content initialization does not start page translation.'
      ),
      sidePanel: supported(
        'explicit-user-action',
        'The Chrome manifest declares sidePanel and the panel is opened from a command or popup action.'
      ),
      sidebar: unsupported('Chrome has no Firefox sidebar_action target in this repository.'),
      tabCapture: supported(
        'explicit-user-action',
        'The Chrome manifest declares tabCapture and capture starts only from the subtitle-page capture control.'
      )
    })
  }),
  firefox: Object.freeze({
    platform: 'firefox',
    releaseStatus: 'supported',
    releaseEvidence: 'A Firefox manifest and production build target exist in this repository.',
    capabilities: Object.freeze({
      extensionBuild: supported('none', 'Webpack emits the Firefox target to dist-firefox.'),
      pageTranslation: supported(
        'explicit-user-action',
        'The shared page-translation runtime requires the popup or floating toggle action.'
      ),
      sidePanel: unsupported('The Firefox target does not declare the Chrome sidePanel permission or manifest key.'),
      sidebar: supported(
        'explicit-user-action',
        'The Firefox manifest declares sidebar_action with open_at_install disabled.'
      ),
      tabCapture: unsupported('The Firefox manifest does not declare tabCapture and no Firefox capture adapter exists.')
    })
  }),
  safari: Object.freeze({
    platform: 'safari',
    releaseStatus: 'unsupported',
    releaseEvidence: 'No Safari extension project, manifest, build target, or package is present.',
    capabilities: unsupportedCapabilities('No Safari runtime or release artifact is implemented.')
  }),
  userscript: Object.freeze({
    platform: 'userscript',
    releaseStatus: 'unsupported',
    releaseEvidence: 'No userscript entry point, metadata block, build target, or package is present.',
    capabilities: unsupportedCapabilities('No userscript runtime or release artifact is implemented.')
  }),
  zotero: Object.freeze({
    platform: 'zotero',
    releaseStatus: 'unsupported',
    releaseEvidence: 'No Zotero plugin manifest, bootstrap entry point, build target, or package is present.',
    capabilities: unsupportedCapabilities('No Zotero runtime or release artifact is implemented.')
  }),
  ios: Object.freeze({
    platform: 'ios',
    releaseStatus: 'unsupported',
    releaseEvidence: 'No iOS application or extension target and no mobile package are present.',
    capabilities: unsupportedCapabilities('No iOS runtime or release artifact is implemented.')
  }),
  android: Object.freeze({
    platform: 'android',
    releaseStatus: 'unsupported',
    releaseEvidence: 'No Android application or extension target and no mobile package are present.',
    capabilities: unsupportedCapabilities('No Android runtime or release artifact is implemented.')
  })
});

export const isKnownPlatform = (platform: string): platform is KnownPlatform => (
  Object.prototype.hasOwnProperty.call(PLATFORM_CAPABILITY_MATRIX, platform)
);

export const isPlatformCapability = (capability: string): capability is PlatformCapability => (
  (PLATFORM_CAPABILITIES as readonly string[]).includes(capability)
);

export const getPlatformCapabilityProfile = (
  platform: string
): PlatformCapabilityProfile | null => (
  isKnownPlatform(platform) ? PLATFORM_CAPABILITY_MATRIX[platform] : null
);

export const queryPlatformCapability = (
  platform: string,
  capability: string,
  invocation: CapabilityInvocation = 'explicit-user-action'
): CapabilityQueryResult => {
  const profile = getPlatformCapabilityProfile(platform);
  if (!profile) {
    return Object.freeze({
      knownPlatform: false,
      available: false,
      platform: null,
      capability: isPlatformCapability(capability) ? capability : null,
      status: 'unknown',
      requiresExplicitUserAction: false,
      reason: `Unknown platform: ${platform}`
    });
  }

  if (!isPlatformCapability(capability)) {
    return Object.freeze({
      knownPlatform: true,
      available: false,
      platform: profile.platform,
      capability: null,
      status: 'unknown',
      requiresExplicitUserAction: false,
      reason: `Unknown capability: ${capability}`
    });
  }

  const boundary = profile.capabilities[capability];
  const requiresExplicitUserAction = boundary.trigger === 'explicit-user-action';
  if (boundary.status !== 'supported') {
    return Object.freeze({
      knownPlatform: true,
      available: false,
      platform: profile.platform,
      capability,
      status: boundary.status,
      requiresExplicitUserAction,
      reason: boundary.evidence
    });
  }

  if (requiresExplicitUserAction && invocation !== 'explicit-user-action') {
    return Object.freeze({
      knownPlatform: true,
      available: false,
      platform: profile.platform,
      capability,
      status: boundary.status,
      requiresExplicitUserAction: true,
      reason: `${capability} requires an explicit user action and cannot start automatically.`
    });
  }

  return Object.freeze({
    knownPlatform: true,
    available: true,
    platform: profile.platform,
    capability,
    status: boundary.status,
    requiresExplicitUserAction,
    reason: boundary.evidence
  });
};
