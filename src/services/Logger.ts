import { logger, consoleTransport } from 'react-native-logs';
import { Paths, Directory, File } from 'expo-file-system';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { Platform, NativeModules } from 'react-native';
import { nativeCopyFile } from 'native-util';
import JSZip from 'jszip';
import { CLIPBOARD_TEMP_DIR } from '@/utils/fileStorage';

const LOG_DIR = new Directory(Paths.document, 'logs');
const MAX_LOG_DAYS = 3;

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogConfig {
  level: LogLevel;
  enableConsole: boolean;
}

interface CustomTransportOptions {
  _custom?: string;
}

let isInitialized = false;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let logInstance: any = null;

const customFileTransport = (props: {
  msg: string;
  rawMsg: unknown;
  level: { severity: number; text: string };
  extension?: string | null;
  options?: CustomTransportOptions;
}): void => {
  try {
    if (!LOG_DIR.exists) {
      LOG_DIR.create();
    }

    const today = new Date();
    const dateStr = today.toISOString().slice(0, 10);
    const fileName = `app_${dateStr}.log`;
    const logFile = new File(LOG_DIR, fileName);

    const timestamp = today.toISOString().slice(0, 19).replace('T', ' ');
    const level = props.level.text.toUpperCase();
    const extension = props.extension ? ` [${props.extension}]` : '';
    const message = props.msg;

    const logLine = `${timestamp} ${level}${extension}: ${message}\n`;

    if (logFile.exists) {
      const existingContent = logFile.textSync() || '';
      logFile.write(existingContent + logLine);
    } else {
      logFile.write(logLine);
    }
  } catch (error) {
    console.error('Failed to write log file:', error);
  }
};

export function initLogger(config?: Partial<LogConfig>): void {
  if (isInitialized) {
    return;
  }

  const logConfig = {
    level: config?.level ?? 'debug',
    enableConsole: config?.enableConsole ?? true,
  };

  const transports = logConfig.enableConsole
    ? [consoleTransport, customFileTransport]
    : [customFileTransport];

  logInstance = logger.createLogger({
    levels: {
      debug: 0,
      info: 1,
      warn: 2,
      error: 3,
    },
    severity: logConfig.level,
    transport: transports,
    async: true,
    dateFormat: 'iso',
    printLevel: true,
    printDate: true,
  });

  logInstance.patchConsole();
  isInitialized = true;

  cleanOldLogs();
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getLogger(): any {
  if (!logInstance) {
    initLogger();
  }
  return logInstance;
}

export function setLogLevel(level: LogLevel): void {
  if (logInstance) {
    logInstance.setSeverity(level);
  }
}

export function getLogDirectory(): Directory {
  return LOG_DIR;
}

export function getLogFilePaths(): string[] {
  if (!LOG_DIR.exists) {
    return [];
  }

  const files = LOG_DIR.list();
  return files
    .filter((entry): entry is File => entry instanceof File)
    .filter((file) => file.name.endsWith('.log'))
    .map((file) => file.uri);
}

export function calculateLogSize(): number {
  if (!LOG_DIR.exists) {
    return 0;
  }

  let totalSize = 0;
  const files = LOG_DIR.list();

  for (const entry of files) {
    if (entry instanceof File) {
      try {
        const info = entry.info();
        totalSize += info.size || 0;
      } catch {
        // ignore
      }
    }
  }

  return totalSize;
}

export function clearLogs(): void {
  if (LOG_DIR.exists) {
    const files = LOG_DIR.list();
    for (const entry of files) {
      try {
        if (entry instanceof File) {
          entry.delete();
        }
      } catch {
        // ignore
      }
    }
  }
}

export function cleanOldLogs(): void {
  if (!LOG_DIR.exists) {
    return;
  }

  const today = new Date();
  const cutoffDate = new Date(today);
  cutoffDate.setDate(cutoffDate.getDate() - MAX_LOG_DAYS);

  const files = LOG_DIR.list();
  for (const entry of files) {
    if (entry instanceof File && entry.name.endsWith('.log')) {
      const match = entry.name.match(/app_(\d{4}-\d{2}-\d{2})\.log/);
      if (match) {
        const fileDate = new Date(match[1]);
        if (fileDate < cutoffDate) {
          try {
            entry.delete();
          } catch {
            // ignore
          }
        }
      }
    }
  }
}

export const log = {
  debug: (...args: unknown[]) => getLogger().debug(args.length === 1 ? args[0] : args),
  info: (...args: unknown[]) => getLogger().info(args.length === 1 ? args[0] : args),
  warn: (...args: unknown[]) => getLogger().warn(args.length === 1 ? args[0] : args),
  error: (...args: unknown[]) => getLogger().error(args.length === 1 ? args[0] : args),
};

export async function exportLogs(): Promise<string | null> {
  if (!LOG_DIR.exists) {
    return null;
  }

  const files = LOG_DIR.list().filter(
    (entry): entry is File => entry instanceof File && entry.name.endsWith('.log')
  );

  if (files.length === 0) {
    return null;
  }

  const zip = new JSZip();

  for (const file of files) {
    try {
      const content = file.textSync() || '';
      zip.file(file.name, content);
    } catch {
      // ignore
    }
  }

  const zipContent = await zip.generateAsync({ type: 'base64' });

  if (!CLIPBOARD_TEMP_DIR.exists) {
    CLIPBOARD_TEMP_DIR.create();
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const zipFileName = `logs_${timestamp}.zip`;
  const zipFile = new File(CLIPBOARD_TEMP_DIR, zipFileName);

  const binaryString = atob(zipContent);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  zipFile.write(bytes);

  return zipFile.uri;
}

export async function saveLogsToFile(): Promise<boolean> {
  const zipUri = await exportLogs();
  if (!zipUri) {
    return false;
  }

  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const zipFileName = `logs_${timestamp}`;

    const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) {
      return false;
    }

    const destUri = await StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      zipFileName,
      'application/zip'
    );

    const hashModule = Platform.OS === 'android' ? (NativeModules.NativeUtilModule ?? null) : null;

    if (hashModule?.copyFile) {
      await nativeCopyFile(zipUri, destUri);
    } else {
      const FileSystem = await import('expo-file-system/legacy');
      const content = await FileSystem.readAsStringAsync(zipUri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      await FileSystem.writeAsStringAsync(destUri, content, {
        encoding: FileSystem.EncodingType.Base64,
      });
    }

    return true;
  } catch {
    return false;
  }
}
