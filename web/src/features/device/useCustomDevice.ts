import { useEffect, useMemo, useState } from 'react';
import { CustomDeviceService, type DeviceSnapshot } from './CustomDeviceService';

type Logger = (scope: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;

const EMPTY_SNAPSHOT: DeviceSnapshot = {
  name: null,
  temperatureC: null,
  batteryPercent: null,
  batteryVoltage: null,
  hall1: null,
  hall2: null,
};

export function useCustomDevice(log: Logger) {
  const service = useMemo(() => new CustomDeviceService(log), [log]);
  const [snapshot, setSnapshot] = useState<DeviceSnapshot>(EMPTY_SNAPSHOT);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = service.subscribe(setSnapshot);
    const unsubscribeConnection = service.onConnectionChange((nextConnected, nextDevice) => {
      setConnected(nextConnected);
      setBluetoothDevice(nextDevice);
    });

    return () => {
      unsubscribe();
      unsubscribeConnection();
    };
  }, [service]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    try {
      await service.connect();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Unknown BLE error';
      setError(message);
      log('BLE', message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = () => {
    service.disconnect();
  };

  const reboot = async () => {
    try {
      await service.reboot();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Reboot failed';
      setError(message);
      log('BLE', message, 'error');
    }
  };

  return {
    snapshot,
    connecting,
    connected,
    bluetoothDevice,
    error,
    connect,
    disconnect,
    reboot,
  };
}
