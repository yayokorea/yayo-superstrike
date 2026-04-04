import { CUSTOM_SERVICE_UUID, DEVICE_CHARACTERISTICS, SYSTEM_COMMANDS } from './constants';

export type DeviceSnapshot = {
  name: string | null;
  temperatureC: number | null;
  batteryPercent: number | null;
  batteryVoltage: number | null;
  hall1: number | null;
  hall2: number | null;
};

type Logger = (scope: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;

type SnapshotListener = (snapshot: DeviceSnapshot) => void;

export class CustomDeviceService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private snapshot: DeviceSnapshot = {
    name: null,
    temperatureC: null,
    batteryPercent: null,
    batteryVoltage: null,
    hall1: null,
    hall2: null,
  };

  private systemControl: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners = new Set<SnapshotListener>();
  private notificationCleanup: Array<() => void> = [];

  constructor(private readonly log: Logger) {}

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  async connect() {
    this.teardown();
    this.log('BLE', 'Requesting custom control device');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [CUSTOM_SERVICE_UUID] }],
    });

    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    this.server = await this.device.gatt?.connect() ?? null;

    if (!this.server) {
      throw new Error('GATT server connection failed');
    }

    const service = await this.server.getPrimaryService(CUSTOM_SERVICE_UUID);
    this.systemControl = await service.getCharacteristic(DEVICE_CHARACTERISTICS.systemControl);

    await this.bindTemperature(service);
    await this.bindBattery(service);
    await this.bindHall(service, DEVICE_CHARACTERISTICS.hall1, 'hall1');
    await this.bindHall(service, DEVICE_CHARACTERISTICS.hall2, 'hall2');

    this.snapshot = { ...this.snapshot, name: this.device.name ?? 'Unknown device' };
    this.emit();
    this.log('BLE', `Connected to ${this.snapshot.name ?? 'device'}`, 'success');
  }

  disconnect() {
    this.device?.gatt?.disconnect();
  }

  async reboot() {
    if (!this.systemControl) {
      throw new Error('System control characteristic unavailable');
    }

    await this.systemControl.writeValue(new Uint8Array([SYSTEM_COMMANDS.reboot]));
    this.log('BLE', 'Reboot command sent', 'warning');
  }

  isConnected() {
    return Boolean(this.device?.gatt?.connected);
  }

  getSnapshot() {
    return this.snapshot;
  }

  private async bindTemperature(service: BluetoothRemoteGATTService) {
    const characteristic = await service.getCharacteristic(DEVICE_CHARACTERISTICS.temperature);
    const update = (value: DataView) => {
      const encoded = value.getInt32(0, true);
      this.snapshot = { ...this.snapshot, temperatureC: encoded / 100 };
      this.emit();
    };

    const listener = (event: Event) => {
      update((event.target as BluetoothRemoteGATTCharacteristic).value!);
    };
    characteristic.addEventListener('characteristicvaluechanged', listener);
    await characteristic.startNotifications();
    this.notificationCleanup.push(() => characteristic.removeEventListener('characteristicvaluechanged', listener));
  }

  private async bindBattery(service: BluetoothRemoteGATTService) {
    const characteristic = await service.getCharacteristic(DEVICE_CHARACTERISTICS.battery);
    const update = (value: DataView) => {
      const millivolts = value.getUint16(0, true);
      const percent = value.getUint8(2);
      this.snapshot = {
        ...this.snapshot,
        batteryPercent: percent,
        batteryVoltage: millivolts / 1000,
      };
      this.emit();
    };

    const listener = (event: Event) => {
      update((event.target as BluetoothRemoteGATTCharacteristic).value!);
    };
    characteristic.addEventListener('characteristicvaluechanged', listener);
    await characteristic.startNotifications();
    this.notificationCleanup.push(() => characteristic.removeEventListener('characteristicvaluechanged', listener));
    update(await characteristic.readValue());
  }

  private async bindHall(
    service: BluetoothRemoteGATTService,
    uuid: string,
    key: 'hall1' | 'hall2',
  ) {
    const characteristic = await service.getCharacteristic(uuid);
    const update = (value: DataView) => {
      const nextValue = value.getInt32(0, true);
      this.snapshot = key === 'hall1'
        ? { ...this.snapshot, hall1: nextValue }
        : { ...this.snapshot, hall2: nextValue };
      this.emit();
    };

    const listener = (event: Event) => {
      update((event.target as BluetoothRemoteGATTCharacteristic).value!);
    };
    characteristic.addEventListener('characteristicvaluechanged', listener);
    await characteristic.startNotifications();
    this.notificationCleanup.push(() => characteristic.removeEventListener('characteristicvaluechanged', listener));
  }

  private handleDisconnect = () => {
    this.teardown();
    this.systemControl = null;
    this.server = null;
    this.snapshot = {
      name: this.snapshot.name,
      temperatureC: null,
      batteryPercent: null,
      batteryVoltage: null,
      hall1: null,
      hall2: null,
    };
    this.emit();
    this.log('BLE', 'Custom control transport disconnected', 'warning');
  };

  private teardown() {
    for (const cleanup of this.notificationCleanup) {
      cleanup();
    }
    this.notificationCleanup = [];

    if (this.device) {
      this.device.removeEventListener('gattserverdisconnected', this.handleDisconnect);
    }
  }

  private emit() {
    for (const listener of this.listeners) {
      listener(this.snapshot);
    }
  }
}
