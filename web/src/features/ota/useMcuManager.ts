import { useEffect, useMemo, useState } from 'react';
import { McuManagerClient } from './McuManagerClient';
import type { ImageInfo, ImageSlot } from './types';

type Logger = (scope: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;

function getTestTargetImage(images: ImageSlot[]) {
  return images.find((image) => image.slot === 1 && !image.active && image.hash)
    ?? images.find((image) => !image.active && image.hash)
    ?? null;
}

export function useMcuManager(log: Logger, bluetoothDevice: BluetoothDevice | null = null, bluetoothConnected = false) {
  const client = useMemo(() => new McuManagerClient(log), [log]);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [uploadState, setUploadState] = useState<'idle' | 'uploading' | 'completed' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState('No upload in progress');
  const [file, setFile] = useState<File | null>(null);
  const [fileBuffer, setFileBuffer] = useState<ArrayBuffer | null>(null);
  const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null);
  const [imageState, setImageState] = useState<ImageSlot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const testTargetImage = useMemo(() => getTestTargetImage(imageState), [imageState]);

  useEffect(() => {
    return client.onConnectionChange(setConnected);
  }, [client]);

  useEffect(() => {
    if (!bluetoothDevice || !bluetoothConnected) {
      return;
    }

    let cancelled = false;

    void (async () => {
      setConnecting(true);
      setError(null);
      setStatusMessage('Attaching OTA transport to active BLE session');

      try {
        await client.attachDevice(bluetoothDevice);

        if (cancelled) {
          return;
        }

        setConnected(true);
        const images = await client.readImageState();

        if (cancelled) {
          return;
        }

        setImageState(images);
        setStatusMessage('OTA transport ready');
      } catch (unknownError) {
        if (cancelled) {
          return;
        }

        const message = unknownError instanceof Error ? unknownError.message : 'OTA connection failed';
        setError(message);
        setConnected(false);
        setStatusMessage(message);
        log('OTA', message, 'error');
      } finally {
        if (!cancelled) {
          setConnecting(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bluetoothConnected, bluetoothDevice, client, log]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    setStatusMessage('Connecting to MCUmgr transport');
    try {
      if (bluetoothDevice && bluetoothConnected) {
        await client.attachDevice(bluetoothDevice);
      } else {
        await client.connect();
      }

      setConnected(true);
      const images = await client.readImageState();
      setImageState(images);
      setStatusMessage('OTA transport ready');
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'OTA connection failed';
      setError(message);
      setConnected(false);
      setUploadState('error');
      setStatusMessage(message);
      log('OTA', message, 'error');
    } finally {
      setConnecting(false);
    }
  };

  const disconnect = async () => {
    await client.disconnect();
    setConnected(false);
    setStatusMessage('OTA transport disconnected');
  };

  const prepareImage = async (nextFile: File, buffer?: ArrayBuffer) => {
    const nextBuffer = buffer ?? await nextFile.arrayBuffer();
    const nextInfo = await client.imageInfo(nextBuffer);

    setFile(nextFile);
    setFileBuffer(nextBuffer);
    setImageInfo(nextInfo);
    setUploadState('idle');
    setProgress(0);
    setError(null);
    setStatusMessage(`Image ${nextInfo.version} validated`);
    log('OTA', `Validated image ${nextInfo.version}`, 'success');

    return nextBuffer;
  };

  const selectFile = async (nextFile: File | null) => {
    setFile(nextFile);
    setFileBuffer(null);
    setImageInfo(null);
    setError(null);

    if (!nextFile) {
      setUploadState('idle');
      setStatusMessage('No image selected');
      return;
    }

    try {
      await prepareImage(nextFile);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Image validation failed';
      setError(message);
      setUploadState('error');
      setStatusMessage(message);
      log('OTA', message, 'error');
    }
  };

  const selectRemoteImage = async (name: string, buffer: ArrayBuffer) => {
    const nextFile = new File([buffer], name, {
      type: 'application/octet-stream',
    });

    await prepareImage(nextFile, buffer);
  };

  const refreshImageState = async () => {
    setBusy(true);
    try {
      const images = await client.readImageState();
      setImageState(images);
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Failed to refresh image state';
      setError(message);
      log('OTA', message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!fileBuffer) {
      setError('Select a valid MCUboot image first');
      return;
    }

    setBusy(true);
    setProgress(0);
    setUploadState('uploading');
    setStatusMessage('Uploading firmware image');
    try {
      await client.upload(fileBuffer, (percentage) => {
        setProgress(percentage);
        setStatusMessage(`Uploading firmware image (${percentage}%)`);
      });
      setProgress(100);
      setUploadState('completed');
      setStatusMessage('Upload completed successfully');
      log('OTA', 'Firmware upload finished', 'success');
      await refreshImageState();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Upload failed';
      setError(message);
      setUploadState('error');
      setStatusMessage(message);
      log('OTA', message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const uploadPreparedImage = async (name: string, buffer: ArrayBuffer) => {
    const nextBuffer = await prepareImage(new File([buffer], name, {
      type: 'application/octet-stream',
    }), buffer);

    setBusy(true);
    setProgress(0);
    setUploadState('uploading');
    setStatusMessage('Uploading firmware image');
    try {
      await client.upload(nextBuffer, (percentage) => {
        setProgress(percentage);
        setStatusMessage(`Uploading firmware image (${percentage}%)`);
      });
      setProgress(100);
      setUploadState('completed');
      setStatusMessage('Upload completed successfully');
      log('OTA', 'Firmware upload finished', 'success');
      await refreshImageState();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Upload failed';
      setError(message);
      setUploadState('error');
      setStatusMessage(message);
      log('OTA', message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    if (!testTargetImage?.hash) {
      setError('No testable image found on device');
      return;
    }

    setBusy(true);
    try {
      await client.test(testTargetImage.hash);
      setStatusMessage(`Slot ${testTargetImage.slot} image marked for test boot`);
      log('OTA', `Slot ${testTargetImage.slot} image marked for test boot`, 'success');
      await refreshImageState();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Test command failed';
      setError(message);
      setStatusMessage(message);
      log('OTA', message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    const activeImage = imageState.find((image) => image.active);
    if (!activeImage?.hash) {
      setError('No active image hash available to confirm');
      return;
    }

    setBusy(true);
    try {
      await client.confirm(activeImage.hash);
      setStatusMessage('Active image confirmed');
      log('OTA', 'Active image confirmed', 'success');
      await refreshImageState();
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Confirm command failed';
      setError(message);
      setStatusMessage(message);
      log('OTA', message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    try {
      await client.reset();
      setStatusMessage('Reset command sent');
      log('OTA', 'Reset command sent', 'warning');
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Reset command failed';
      setError(message);
      setStatusMessage(message);
      log('OTA', message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return {
    connecting,
    connected,
    busy,
    progress,
    uploadState,
    statusMessage,
    file,
    imageInfo,
    imageState,
    error,
    testTargetImage,
    deviceName: client.getDeviceName(),
    connect,
    disconnect,
    selectFile,
    selectRemoteImage,
    refreshImageState,
    upload,
    uploadPreparedImage,
    test,
    confirm,
    reset,
  };
}
