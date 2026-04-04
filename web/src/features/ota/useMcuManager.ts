import { useEffect, useMemo, useState } from 'react';
import { McuManagerClient, hashHexToBytes } from './McuManagerClient';
import type { ImageInfo, ImageSlot } from './types';

type Logger = (scope: string, message: string, level?: 'info' | 'success' | 'warning' | 'error') => void;

export function useMcuManager(log: Logger) {
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

  useEffect(() => {
    return client.onConnectionChange(setConnected);
  }, [client]);

  const connect = async () => {
    setConnecting(true);
    setError(null);
    setStatusMessage('Connecting to MCUmgr transport');
    try {
      await client.connect();
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
      const buffer = await nextFile.arrayBuffer();
      const nextInfo = await client.imageInfo(buffer);
      setFileBuffer(buffer);
      setImageInfo(nextInfo);
      setUploadState('idle');
      setProgress(0);
      setStatusMessage(`Image ${nextInfo.version} validated`);
      log('OTA', `Validated image ${nextInfo.version}`, 'success');
    } catch (unknownError) {
      const message = unknownError instanceof Error ? unknownError.message : 'Image validation failed';
      setError(message);
      setUploadState('error');
      setStatusMessage(message);
      log('OTA', message, 'error');
    }
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

  const test = async () => {
    if (!imageInfo) {
      setError('No validated image selected');
      return;
    }

    setBusy(true);
    try {
      await client.test(hashHexToBytes(imageInfo.hash));
      setStatusMessage('Image marked for test boot');
      log('OTA', 'Image marked for test boot', 'success');
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
    deviceName: client.getDeviceName(),
    connect,
    disconnect,
    selectFile,
    refreshImageState,
    upload,
    test,
    confirm,
    reset,
  };
}
