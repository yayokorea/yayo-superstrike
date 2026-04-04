export type LogLevel = 'info' | 'success' | 'warning' | 'error';

export type LogEntry = {
  id: string;
  level: LogLevel;
  scope: string;
  message: string;
  timestamp: string;
};
