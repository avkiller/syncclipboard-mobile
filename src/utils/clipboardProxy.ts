/**
 * Clipboard Proxy
 * 剪贴板代理 - 在 Android 后台时通过悬浮窗获取剪贴板，其他情况直接调用 expo-clipboard
 */

import * as Clipboard from 'expo-clipboard';
import { AppState, Platform } from 'react-native';
import { useSettingsStore } from '@/stores/settingsStore';

let overlayModule: typeof import('clipboard-overlay') | null = null;
if (Platform.OS === 'android') {
  overlayModule = require('clipboard-overlay');
}

/**
 * 判断是否应该使用悬浮窗获取剪贴板
 * 条件：Android + 后台 + 设置启用 + 权限已授予
 */
function shouldUseOverlay(): boolean {
  if (Platform.OS !== 'android' || !overlayModule) return false;
  if (AppState.currentState !== 'background') return false;
  const config = useSettingsStore.getState().config;
  if (!(config?.enableClipboardOverlay ?? false)) return false;
  // Sync overlay visibility and retry count to native module
  const isDebug = config?.debugMode ?? false;
  const showOverlay = isDebug && (config?.debugOverlayVisible ?? false);
  overlayModule.setDebugMode(showOverlay);
  overlayModule.setMaxRetries(isDebug ? 20 : 5);
  return overlayModule.hasOverlayPermission();
}

/**
 * 获取剪贴板文本
 */
export async function getStringAsync(options?: Clipboard.GetStringOptions): Promise<string> {
  if (shouldUseOverlay()) {
    try {
      return await overlayModule!.getStringViaOverlay();
    } catch (e) {
      console.warn('[ClipboardProxy] Overlay getStringAsync failed, falling back:', e);
    }
  }
  return Clipboard.getStringAsync(options);
}

/**
 * 设置剪贴板文本
 */
export async function setStringAsync(
  text: string,
  options?: Clipboard.SetStringOptions
): Promise<boolean> {
  return Clipboard.setStringAsync(text, options);
}

/**
 * 检查剪贴板是否有文本
 */
export async function hasStringAsync(): Promise<boolean> {
  if (shouldUseOverlay()) {
    try {
      return await overlayModule!.hasStringViaOverlay();
    } catch (e) {
      console.warn('[ClipboardProxy] Overlay hasStringAsync failed, falling back:', e);
    }
  }
  return Clipboard.hasStringAsync();
}

/**
 * 检查剪贴板是否有图片
 */
export async function hasImageAsync(): Promise<boolean> {
  if (shouldUseOverlay()) {
    try {
      return await overlayModule!.hasImageViaOverlay();
    } catch (e) {
      console.warn('[ClipboardProxy] Overlay hasImageAsync failed, falling back:', e);
    }
  }
  return Clipboard.hasImageAsync();
}

/**
 * 获取剪贴板图片
 */
export async function getImageAsync(
  options: Clipboard.GetImageOptions
): Promise<Clipboard.ClipboardImage | null> {
  if (shouldUseOverlay()) {
    try {
      const result = await overlayModule!.getImageViaOverlay();
      if (result) {
        return {
          data: result.data,
          size: result.size,
        };
      }
      return null;
    } catch (e) {
      console.warn('[ClipboardProxy] Overlay getImageAsync failed, falling back:', e);
    }
  }
  return Clipboard.getImageAsync(options);
}

/**
 * 设置剪贴板图片
 */
export async function setImageAsync(base64Image: string): Promise<void> {
  return Clipboard.setImageAsync(base64Image);
}
