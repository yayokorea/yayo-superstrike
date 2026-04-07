/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GITHUB_REPO?: string;
  readonly VITE_OTA_BASE_URL?: string;
  readonly VITE_RELEASE_CHANNEL?: string;
  readonly VITE_RELEASE_MANIFEST_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
