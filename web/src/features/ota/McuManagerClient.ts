import type { MCUManagerInstance, MCUManagerMessage } from '../../types/mcumgr-web';
import { CUSTOM_SERVICE_UUID, SMP_SERVICE_UUID } from '../device/constants';
import type { ImageInfo, ImageSlot } from './types';

const CBOR_SCRIPT = 'https://cdn.jsdelivr.net/gh/boogie/mcumgr-web@master/js/cbor.js';
const MCUMGR_SCRIPT = 'https://cdn.jsdelivr.net/gh/boogie/mcumgr-web@master/js/mcumgr.js';
const OTA_SCAN_FILTERS: BluetoothLEScanFilter[] = [
  { services: [SMP_SERVICE_UUID] },
  { services: [CUSTOM_SERVICE_UUID] },
];

type InternalMCUManagerInstance = MCUManagerInstance & {
  _device?: BluetoothDevice | null;
  _connect?: (delay?: number) => void;
  _disconnected?: (error?: Error | null) => Promise<void> | void;
  _userRequestedDisconnect?: boolean;
  _sharedDevice?: BluetoothDevice | null;
  _sharedDeviceDisconnectListener?: EventListener;
};

type Logger = (scope: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded === 'true') {
        resolve();
        return;
      }

      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => {
      script.dataset.loaded = 'true';
      resolve();
    }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
}

function resolveMCUManagerConstructor() {
  if (window.MCUManager) {
    return window.MCUManager;
  }

  if (typeof MCUManager !== 'undefined') {
    return MCUManager;
  }

  return undefined;
}

function normalizeHash(hash: unknown): Uint8Array | undefined {
  if (hash instanceof Uint8Array) {
    return hash;
  }

  if (!hash || typeof hash !== 'object') {
    return undefined;
  }

  const entries = Object.entries(hash)
    .filter(([key, value]) => /^\d+$/.test(key) && typeof value === 'number')
    .sort((left, right) => Number(left[0]) - Number(right[0]));

  if (entries.length === 0) {
    return undefined;
  }

  return new Uint8Array(entries.map(([, value]) => value));
}

function normalizeImageSlots(images: ImageSlot[]) {
  return images.map((image) => ({
    ...image,
    hash: normalizeHash(image.hash),
  }));
}

export class McuManagerClient {
  private manager: MCUManagerInstance | null = null;
  private imageStateResolver: ((images: ImageSlot[]) => void) | null = null;
  private imageStateRejecter: ((error: Error) => void) | null = null;
  private uploadProgressListener: ((percentage: number) => void) | null = null;
  private uploadFinishedResolver: (() => void) | null = null;
  private uploadFinishedRejecter: ((error: Error) => void) | null = null;
  private connectionListener: ((connected: boolean) => void) | null = null;
  private pendingConnectResolver: (() => void) | null = null;
  private pendingConnectRejecter: ((error: Error) => void) | null = null;
  private attachedDevice: BluetoothDevice | null = null;

  constructor(private readonly log: Logger) {}

  async initialize() {
    if (this.manager) {
      return this.manager;
    }

    await loadScript(CBOR_SCRIPT);
    await loadScript(MCUMGR_SCRIPT);

    const MCUManagerConstructor = resolveMCUManagerConstructor();

    if (!MCUManagerConstructor) {
      throw new Error('MCUManager runtime is unavailable');
    }

    this.manager = new MCUManagerConstructor({
      logger: {
        info: (message) => this.log('OTA', message),
        error: (message) => this.log('OTA', message, 'error'),
      },
    });

    this.manager
      .onConnecting(() => this.log('OTA', 'Connecting to SMP transport'))
      .onConnect(() => {
        this.pendingConnectResolver?.();
        this.pendingConnectResolver = null;
        this.pendingConnectRejecter = null;
        this.connectionListener?.(true);
        this.log('OTA', `Connected to ${this.manager?.name ?? 'device'}`, 'success');
      })
      .onDisconnect(() => {
        this.pendingConnectRejecter?.(new Error('SMP transport disconnected before ready'));
        this.pendingConnectResolver = null;
        this.pendingConnectRejecter = null;
        this.attachedDevice = null;
        this.connectionListener?.(false);
        this.log('OTA', 'SMP transport disconnected', 'warning');
      })
      .onMessage((message) => this.handleMessage(message))
      .onImageUploadProgress(({ percentage }) => this.uploadProgressListener?.(percentage))
      .onImageUploadFinished(() => {
        this.uploadFinishedResolver?.();
        this.uploadFinishedResolver = null;
        this.uploadFinishedRejecter = null;
      })
      .onImageUploadError((error) => {
        const message = error.error ?? 'Image upload failed';
        this.uploadFinishedRejecter?.(new Error(message));
        this.uploadFinishedResolver = null;
        this.uploadFinishedRejecter = null;
        this.log('OTA', message, 'error');
      });

    return this.manager;
  }

  async connect() {
    if (this.attachedDevice?.gatt) {
      await this.attachDevice(this.attachedDevice);
      return;
    }

    const manager = await this.initialize();
    await new Promise<void>((resolve, reject) => {
      this.pendingConnectResolver = resolve;
      this.pendingConnectRejecter = reject;

      manager.connect(OTA_SCAN_FILTERS).catch((error: unknown) => {
        const wrapped = error instanceof Error ? error : new Error('Failed to start OTA connection');
        this.pendingConnectResolver = null;
        this.pendingConnectRejecter = null;
        reject(wrapped);
      });
    });
  }

  async attachDevice(device: BluetoothDevice) {
    const manager = await this.initialize() as InternalMCUManagerInstance;

    if (!manager._connect) {
      throw new Error('MCUManager runtime does not support device reuse');
    }

    if (manager._sharedDevice && manager._sharedDevice !== device && manager._sharedDeviceDisconnectListener) {
      manager._sharedDevice.removeEventListener('gattserverdisconnected', manager._sharedDeviceDisconnectListener);
    }

    this.attachedDevice = device;

    await new Promise<void>((resolve, reject) => {
      this.pendingConnectResolver = resolve;
      this.pendingConnectRejecter = reject;

      manager._device = device;
      manager._userRequestedDisconnect = false;

      const disconnectListener: EventListener = async () => {
        this.log('OTA', 'Shared BLE device disconnected', 'warning');
        await manager._disconnected?.();
      };

      if (manager._sharedDevice === device && manager._sharedDeviceDisconnectListener) {
        device.removeEventListener('gattserverdisconnected', manager._sharedDeviceDisconnectListener);
      }

      manager._sharedDevice = device;
      manager._sharedDeviceDisconnectListener = disconnectListener;
      device.addEventListener('gattserverdisconnected', disconnectListener);

      try {
        manager._connect(0);
      } catch (error) {
        const wrapped = error instanceof Error ? error : new Error('Failed to attach OTA transport');
        this.pendingConnectResolver = null;
        this.pendingConnectRejecter = null;
        reject(wrapped);
      }
    });
  }

  async disconnect() {
    const manager = await this.initialize() as InternalMCUManagerInstance;

    if (this.attachedDevice?.gatt?.connected) {
      this.detachSharedDevice(manager);
      this.connectionListener?.(false);
      return;
    }

    this.attachedDevice = null;
    manager.disconnect();
    this.connectionListener?.(false);
  }

  onConnectionChange(listener: (connected: boolean) => void) {
    this.connectionListener = listener;
    return () => {
      if (this.connectionListener === listener) {
        this.connectionListener = null;
      }
    };
  }

  async imageInfo(file: ArrayBuffer): Promise<ImageInfo> {
    const manager = await this.initialize();
    return manager.imageInfo(file);
  }

  async readImageState(): Promise<ImageSlot[]> {
    const manager = await this.initialize();

    return new Promise<ImageSlot[]>((resolve, reject) => {
      this.imageStateResolver = resolve;
      this.imageStateRejecter = reject;
      manager.cmdImageState().catch((error: unknown) => {
        const wrapped = error instanceof Error ? error : new Error('Failed to read image state');
        this.imageStateResolver = null;
        this.imageStateRejecter = null;
        reject(wrapped);
      });
    });
  }

  async upload(image: ArrayBuffer, onProgress: (percentage: number) => void) {
    const manager = await this.initialize();
    this.uploadProgressListener = onProgress;
    await new Promise<void>((resolve, reject) => {
      this.uploadFinishedResolver = resolve;
      this.uploadFinishedRejecter = reject;

      manager.cmdUpload(image).catch((error: unknown) => {
        const wrapped = error instanceof Error ? error : new Error('Upload start failed');
        this.uploadFinishedResolver = null;
        this.uploadFinishedRejecter = null;
        reject(wrapped);
      });
    });
  }

  async test(hash: Uint8Array) {
    const manager = await this.initialize();
    await manager.cmdImageTest(hash);
  }

  async confirm(hash: Uint8Array) {
    const manager = await this.initialize();
    await manager.cmdImageConfirm(hash);
  }

  async reset() {
    const manager = await this.initialize();
    await manager.cmdReset();
  }

  getDeviceName() {
    return this.manager?.name ?? null;
  }

  private detachSharedDevice(manager: InternalMCUManagerInstance) {
    if (manager._sharedDevice && manager._sharedDeviceDisconnectListener) {
      manager._sharedDevice.removeEventListener('gattserverdisconnected', manager._sharedDeviceDisconnectListener);
    }

    manager._sharedDevice = null;
    manager._sharedDeviceDisconnectListener = undefined;
    this.attachedDevice = null;
    void manager._disconnected?.();
  }

  private handleMessage(message: MCUManagerMessage) {
    if (message.group === 1 && message.id === 0 && message.data.images) {
      this.imageStateResolver?.(normalizeImageSlots(message.data.images));
      this.imageStateResolver = null;
      this.imageStateRejecter = null;
      return;
    }

    if (typeof message.data.rc === 'number' && message.data.rc !== 0) {
      const error = new Error(`SMP command failed with rc=${message.data.rc}`);
      this.imageStateRejecter?.(error);
      this.imageStateResolver = null;
      this.imageStateRejecter = null;
      this.log('OTA', error.message, 'error');
    }
  }
}

export function hashHexToBytes(hash: string) {
  const pairs = hash.match(/.{2}/g) ?? [];
  return new Uint8Array(pairs.map((pair) => Number.parseInt(pair, 16)));
}
