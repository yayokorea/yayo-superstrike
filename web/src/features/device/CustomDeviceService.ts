import { CUSTOM_SERVICE_UUID, DEVICE_CHARACTERISTICS, SMP_SERVICE_UUID, SYSTEM_COMMANDS, CAL_COMMANDS } from './constants';

export type CalibrationStatus = {
  hall1Idle: number;
  hall1Press: number;
  hall1Threshold: number;
  hall1Release: number;
  hall2Idle: number;
  hall2Press: number;
  hall2Threshold: number;
  hall2Release: number;
  activeCommand: number;
  sampleCount: number;
  hall1Ready: boolean;
  hall2Ready: boolean;
};

export type DeviceSnapshot = {
  name: string | null;
  temperatureC: number | null;
  batteryPercent: number | null;
  batteryVoltage: number | null;
  hall1: number | null;
  hall2: number | null;
  calStatus: CalibrationStatus | null;
};

type Logger = (scope: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;

type SnapshotListener = (snapshot: DeviceSnapshot) => void;
type ConnectionListener = (connected: boolean, device: BluetoothDevice | null) => void;

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
    calStatus: null,
  };

  private systemControl: BluetoothRemoteGATTCharacteristic | null = null;
  private calStatusChar: BluetoothRemoteGATTCharacteristic | null = null;
  private calCommandChar: BluetoothRemoteGATTCharacteristic | null = null;
  private listeners = new Set<SnapshotListener>();
  private connectionListeners = new Set<ConnectionListener>();
  private notificationCleanup: Array<() => void> = [];
  private userRequestedDisconnect = false;
  private reconnectAttempts = 0;

  constructor(private readonly log: Logger) {}

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  onConnectionChange(listener: ConnectionListener) {
    this.connectionListeners.add(listener);
    listener(this.isConnected(), this.device);
    return () => this.connectionListeners.delete(listener);
  }

  async connect() {
    this.teardown();
    this.userRequestedDisconnect = false;
    this.reconnectAttempts = 0;
    this.log('BLE', 'Requesting custom control device');
    this.device = await navigator.bluetooth.requestDevice({
      filters: [{ services: [CUSTOM_SERVICE_UUID] }],
      optionalServices: [SMP_SERVICE_UUID],
    });

    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect);
    await this.connectToDevice(this.device, false);
  }

  disconnect() {
    this.userRequestedDisconnect = true;
    this.device?.gatt?.disconnect();
  }

  async reboot() {
    if (!this.systemControl) {
      throw new Error('System control characteristic unavailable');
    }

    await this.systemControl.writeValue(new Uint8Array([SYSTEM_COMMANDS.reboot]));
    this.log('BLE', 'Reboot command sent', 'warning');
  }

  async refreshCalibrationStatus() {
    if (!this.calStatusChar) {
      this.log('BLE', 'Calibration status characteristic unavailable', 'error');
      return;
    }
    
    try {
      const value = await this.calStatusChar.readValue();
      const status: CalibrationStatus = {
        hall1Idle: value.getInt32(0, true),
        hall1Press: value.getInt32(4, true),
        hall1Threshold: value.getInt32(8, true),
        hall1Release: value.getInt32(12, true),
        hall2Idle: value.getInt32(16, true),
        hall2Press: value.getInt32(20, true),
        hall2Threshold: value.getInt32(24, true),
        hall2Release: value.getInt32(28, true),
        activeCommand: value.getUint8(32),
        sampleCount: value.getUint8(33),
        hall1Ready: value.getUint8(34) === 1,
        hall2Ready: value.getUint8(35) === 1
      };
      this.snapshot = { ...this.snapshot, calStatus: status };
      this.emit();
      this.log('BLE', 'Calibration status refreshed');
    } catch (e) {
       this.log('BLE', `Failed to read cal status: ${e instanceof Error ? e.message : String(e)}`, 'error');
    }
  }

  async sendCalibrationCommand(command: number) {
    if (!this.calCommandChar) {
      throw new Error('Calibration command characteristic unavailable');
    }
    
    this.log('BLE', `Sending cal command: ${command}`);
    await this.calCommandChar.writeValue(new Uint8Array([command]));
    
    // Wait slightly for the device to process and start sampling
    await new Promise((resolve) => window.setTimeout(resolve, 500));
    await this.refreshCalibrationStatus();
  }

  isConnected() {
    return Boolean(this.device?.gatt?.connected);
  }

  getDevice() {
    return this.device;
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
    this.calStatusChar = null;
    this.calCommandChar = null;
    this.server = null;
    this.snapshot = {
      name: this.snapshot.name,
      temperatureC: null,
      batteryPercent: null,
      batteryVoltage: null,
      hall1: null,
      hall2: null,
      calStatus: null,
    };
    this.emit();
    this.emitConnectionChange();
    this.log('BLE', 'Custom control transport disconnected', 'warning');

    if (this.userRequestedDisconnect || !this.device) {
      this.device = null;
      this.userRequestedDisconnect = false;
      this.reconnectAttempts = 0;
      return;
    }

    void this.reconnect();
  };

  private async connectToDevice(device: BluetoothDevice, isReconnect: boolean) {
    this.server = await device.gatt?.connect() ?? null;

    if (!this.server) {
      throw new Error('GATT server connection failed');
    }

    const service = await this.server.getPrimaryService(CUSTOM_SERVICE_UUID);
    this.systemControl = await service.getCharacteristic(DEVICE_CHARACTERISTICS.systemControl);
    
    try {
      this.calStatusChar = await service.getCharacteristic(DEVICE_CHARACTERISTICS.calStatus);
      this.calCommandChar = await service.getCharacteristic(DEVICE_CHARACTERISTICS.calCommand);
    } catch (e) {
      this.log('BLE', 'Calibration characteristics not found on device', 'warning');
    }

    await this.bindTemperature(service);
    await this.bindBattery(service);
    await this.bindHall(service, DEVICE_CHARACTERISTICS.hall1, 'hall1');
    await this.bindHall(service, DEVICE_CHARACTERISTICS.hall2, 'hall2');

    this.snapshot = { ...this.snapshot, name: device.name ?? 'Unknown device' };
    this.emit();
    this.emitConnectionChange();
    this.reconnectAttempts = 0;
    this.log('BLE', `${isReconnect ? 'Reconnected to' : 'Connected to'} ${this.snapshot.name ?? 'device'}`, 'success');
    
    if (this.calStatusChar) {
      void this.refreshCalibrationStatus();
    }
  }

  private async reconnect() {
    if (!this.device || this.userRequestedDisconnect) {
      return;
    }

    this.reconnectAttempts += 1;
    const delayMs = Math.min(500 * this.reconnectAttempts, 3000);
    this.log('BLE', `Attempting reconnect (${this.reconnectAttempts})`, 'warning');
    await new Promise((resolve) => window.setTimeout(resolve, delayMs));

    if (!this.device || this.userRequestedDisconnect) {
      return;
    }

    try {
      await this.connectToDevice(this.device, true);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Reconnect failed';
      this.log('BLE', message, 'error');
      void this.reconnect();
    }
  }

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

  private emitConnectionChange() {
    const connected = this.isConnected();
    for (const listener of this.connectionListeners) {
      listener(connected, this.device);
    }
  }
}
