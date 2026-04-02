/**
 * Background Test Service
 * 后台稳定性测试服务 - 每隔2秒读取系统剪贴板并通过通知/Toast/Log输出
 *
 * 仅受设置中"测试后台服务稳定性"开关控制，不依赖 AppState 前后台状态。
 * 开关启动时清零持续时长，停止时保存持续时长到 AsyncStorage。
 */

import { Platform } from 'react-native';
import * as ClipboardProxy from '@/utils/clipboardProxy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setTimer, clearTimer } from 'native-timer';
import { showDebugNotification, dismissDebugNotification } from 'native-util';

const DURATION_STORAGE_KEY = '@syncclipboard:bg_test_duration';

/**
 * 后台稳定性测试服务（单例）
 */
class BackgroundTestService {
  private static instance: BackgroundTestService | null = null;

  private running = false;
  private startTime: number | null = null;

  private static readonly TIMER_TAG = 'bg_test_toast';

  private constructor() {}

  static getInstance(): BackgroundTestService {
    if (!BackgroundTestService.instance) {
      BackgroundTestService.instance = new BackgroundTestService();
    }
    return BackgroundTestService.instance;
  }

  /**
   * 启动测试
   */
  async start(): Promise<void> {
    if (this.running) return;
    if (Platform.OS !== 'android') return;

    this.running = true;
    this.startTime = Date.now();

    // 清零已保存的持续时长
    await AsyncStorage.setItem(DURATION_STORAGE_KEY, '0');

    console.log('[BackgroundTest] Started');

    setTimer(
      async () => {
        try {
          const clipboardText = await ClipboardProxy.getStringAsync();
          const localText = clipboardText?.slice(0, 50) || '(空)';
          const elapsed = this.startTime
            ? this.formatElapsedTime(Date.now() - this.startTime)
            : '0s';
          const message = `本机剪贴板: ${localText}`;
          showDebugNotification(`测试后台运行状态 ${elapsed}`, message);
          console.log(`[BackgroundTest] ${elapsed} - ${message}`);

          // 持久化当前持续时长
          if (this.startTime) {
            const durationMs = Date.now() - this.startTime;
            await AsyncStorage.setItem(DURATION_STORAGE_KEY, String(durationMs));
          }
        } catch (error) {
          console.error('[BackgroundTest] Error:', error);
        }
      },
      2000,
      BackgroundTestService.TIMER_TAG
    );
  }

  /**
   * 停止测试
   */
  async stop(): Promise<void> {
    if (!this.running) return;

    // 保存最终持续时长
    if (this.startTime) {
      const durationMs = Date.now() - this.startTime;
      await AsyncStorage.setItem(DURATION_STORAGE_KEY, String(durationMs));
    }

    clearTimer(BackgroundTestService.TIMER_TAG);
    dismissDebugNotification();
    this.running = false;
    this.startTime = null;

    console.log('[BackgroundTest] Stopped');
  }

  /**
   * 是否正在运行
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * 获取上次持续时长（毫秒），从 AsyncStorage 读取
   */
  static async getLastDuration(): Promise<number> {
    try {
      const value = await AsyncStorage.getItem(DURATION_STORAGE_KEY);
      if (value) {
        const ms = parseInt(value, 10);
        return isNaN(ms) ? 0 : ms;
      }
    } catch (error) {
      console.error('[BackgroundTest] Failed to read duration:', error);
    }
    return 0;
  }

  /**
   * 格式化毫秒为人类可读时长字符串
   */
  static formatDuration(ms: number): string {
    if (ms <= 0) return '无记录';
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}h${minutes}m${seconds}s`;
    if (minutes > 0) return `${minutes}m${seconds}s`;
    return `${seconds}s`;
  }

  private formatElapsedTime(ms: number): string {
    return BackgroundTestService.formatDuration(ms);
  }
}

/**
 * 获取后台测试服务单例
 */
export function getBackgroundTestService(): BackgroundTestService {
  return BackgroundTestService.getInstance();
}

export { BackgroundTestService };
