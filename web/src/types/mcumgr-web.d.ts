import type { ImageInfo, ImageSlot, UploadProgress } from '../features/ota/types';

declare global {
  interface Window {
    MCUManager?: new (di?: {
      logger?: {
        info: (message: string) => void;
        error: (message: string) => void;
      };
    }) => MCUManagerInstance;
  }

  var MCUManager:
    | (new (di?: {
        logger?: {
          info: (message: string) => void;
          error: (message: string) => void;
        };
      }) => MCUManagerInstance)
    | undefined;
}

export interface MCUManagerMessage {
  group: number;
  id: number;
  data: {
    images?: ImageSlot[];
    rc?: number;
    [key: string]: unknown;
  };
}

export interface MCUManagerInstance {
  readonly name: string | null;
  connect(filters?: BluetoothLEScanFilter[]): Promise<void>;
  disconnect(): void;
  onConnecting(callback: () => void): MCUManagerInstance;
  onConnect(callback: () => void): MCUManagerInstance;
  onDisconnect(callback: () => void): MCUManagerInstance;
  onMessage(callback: (message: MCUManagerMessage) => void): MCUManagerInstance;
  onImageUploadProgress(callback: (progress: UploadProgress) => void): MCUManagerInstance;
  onImageUploadFinished(callback: () => void): MCUManagerInstance;
  onImageUploadError(callback: (error: { error?: string; errorCode?: number }) => void): MCUManagerInstance;
  cmdImageState(): Promise<void>;
  cmdImageTest(hash: Uint8Array): Promise<void>;
  cmdImageConfirm(hash: Uint8Array): Promise<void>;
  cmdUpload(image: ArrayBuffer, slot?: number): Promise<void>;
  cmdReset(): Promise<void>;
  imageInfo(image: ArrayBuffer): Promise<ImageInfo>;
}

export {};
