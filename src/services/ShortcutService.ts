import { Platform } from 'react-native';
import {
  requestPinDownloadShortcut,
  requestPinUploadShortcut,
  requestPinUploadSmsCodeShortcut,
  isShortcutModuleAvailable,
} from 'shortcut';

export const ShortcutService = {
  addDownloadShortcut(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return Promise.reject(new Error('Home-screen shortcuts are only supported on Android'));
    }
    if (!isShortcutModuleAvailable) {
      return Promise.reject(new Error('ShortcutModule is not available'));
    }
    return requestPinDownloadShortcut().catch((error) => {
      console.error('ShortcutModule addDownloadShortcut error:', error);
      throw error;
    });
  },

  addUploadShortcut(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return Promise.reject(new Error('Home-screen shortcuts are only supported on Android'));
    }
    if (!isShortcutModuleAvailable) {
      return Promise.reject(new Error('ShortcutModule is not available'));
    }
    return requestPinUploadShortcut().catch((error) => {
      console.error('ShortcutModule addUploadShortcut error:', error);
      throw error;
    });
  },

  addUploadSmsCodeShortcut(): Promise<boolean> {
    if (Platform.OS !== 'android') {
      return Promise.reject(new Error('Home-screen shortcuts are only supported on Android'));
    }
    if (!isShortcutModuleAvailable) {
      return Promise.reject(new Error('ShortcutModule is not available'));
    }
    return requestPinUploadSmsCodeShortcut().catch((error) => {
      console.error('ShortcutModule addUploadSmsCodeShortcut error:', error);
      throw error;
    });
  },
};
