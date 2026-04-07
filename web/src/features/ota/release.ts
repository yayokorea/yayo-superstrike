export type FirmwareReleaseManifest = {
  product: string;
  channel: string;
  version: string;
  tag: string;
  board: string;
  releasedAt: string;
  asset: {
    name: string;
    url: string;
    sha256: string;
    size: number;
  };
  releaseNotesUrl: string;
};

const DEFAULT_GITHUB_REPO = 'yayokorea/yayo-superstrike';
export type ReleaseChannel = 'stable' | 'dev';

function getDefaultPagesBaseUrl(repository: string) {
  const [owner, name] = repository.split('/');
  return `https://${owner}.github.io/${name}/ota`;
}

function stripVersionPrefix(version: string) {
  return version.trim().replace(/^v/i, '').split('+')[0].split('-')[0];
}

function parseVersion(version: string) {
  const normalized = stripVersionPrefix(version);
  const [major = '0', minor = '0', patch = '0'] = normalized.split('.');

  return [major, minor, patch].map((part) => Number.parseInt(part, 10));
}

export function compareSemver(left: string, right: string) {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);

  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }

  return 0;
}

export function getReleaseManifestUrl(channel: ReleaseChannel = 'stable') {
  const explicitUrl = import.meta.env.VITE_RELEASE_MANIFEST_URL?.trim();
  if (explicitUrl) {
    return explicitUrl;
  }

  const repository = import.meta.env.VITE_GITHUB_REPO?.trim() || DEFAULT_GITHUB_REPO;
  const explicitBaseUrl = import.meta.env.VITE_OTA_BASE_URL?.trim();
  const baseUrl = explicitBaseUrl || getDefaultPagesBaseUrl(repository);
  const manifestName = channel === 'dev' ? 'manifest-dev.json' : 'manifest.json';
  return `${baseUrl.replace(/\/$/, '')}/${manifestName}`;
}

export async function fetchLatestFirmwareRelease(channel: ReleaseChannel = 'stable'): Promise<FirmwareReleaseManifest> {
  const response = await fetch(getReleaseManifestUrl(channel), {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch release manifest (${response.status})`);
  }

  const manifest = await response.json() as FirmwareReleaseManifest;

  if (!manifest?.version || !manifest?.asset?.url || !manifest?.asset?.name) {
    throw new Error('Release manifest is missing required fields');
  }

  return manifest;
}

export async function downloadReleaseAsset(manifest: FirmwareReleaseManifest) {
  const response = await fetch(manifest.asset.url, {
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Failed to download release asset (${response.status})`);
  }

  return response.arrayBuffer();
}
