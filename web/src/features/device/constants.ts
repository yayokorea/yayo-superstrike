export const CUSTOM_SERVICE_UUID = '2cfd0a83-f013-4fe2-8dbd-fe3a5f4a64ff';
export const SMP_SERVICE_UUID = '8d53dc1d-1db7-4cd3-868b-8a527460aa84';

export const DEVICE_CHARACTERISTICS = {
  temperature: '2cfd0a85-f013-4fe2-8dbd-fe3a5f4a64ff',
  battery: '2cfd0a8d-f013-4fe2-8dbd-fe3a5f4a64ff',
  hall1: '2cfd0a87-f013-4fe2-8dbd-fe3a5f4a64ff',
  hall2: '2cfd0a88-f013-4fe2-8dbd-fe3a5f4a64ff',
  systemControl: '2cfd0a8c-f013-4fe2-8dbd-fe3a5f4a64ff',
  calStatus: '2cfd0a8a-f013-4fe2-8dbd-fe3a5f4a64ff',
  calCommand: '2cfd0a8b-f013-4fe2-8dbd-fe3a5f4a64ff',
} as const;

export const SYSTEM_COMMANDS = {
  reboot: 1,
} as const;

export const CAL_COMMANDS = {
  hall1Idle: 1,
  hall1Press: 2,
  hall2Idle: 3,
  hall2Press: 4,
} as const;
