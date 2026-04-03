import React, { useCallback } from 'react';
import { ToastAndroid, PermissionsAndroid, Platform } from 'react-native';
import { useSyncStore } from '@/stores/syncStore';
import { useSettingsStore } from '@/stores';
import { SyncManager } from '@/services/SyncManager';
import { getSmsCodeService } from '@/services/SmsCodeService';
import { QuickLoadingPage } from '@/components/QuickLoadingPage';
import { readRecentSms } from 'sms-forwarder';
import { calculateTextHash } from '@/utils/hash';

interface QuickSmsCodeUploadScreenProps {
  onComplete: () => void;
}

export const QuickSmsCodeUploadScreen: React.FC<QuickSmsCodeUploadScreenProps> = ({
  onComplete,
}) => {
  const task = useCallback(async (_signal: AbortSignal) => {
    // 检查 READ_SMS 权限
    if (Platform.OS === 'android') {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
      if (!granted) {
        const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS);
        if (result !== PermissionsAndroid.RESULTS.GRANTED) {
          throw new Error('需要短信读取权限');
        }
      }
    }

    // 确保 SyncManager 已初始化
    await useSyncStore.getState().initialize();
    const initError = useSyncStore.getState().error;
    if (initError) throw new Error(initError);

    const syncManager = SyncManager.getInstance();
    const apiClient = syncManager.getAPIClient();
    if (!apiClient) {
      throw new Error('服务器未配置');
    }

    const smsService = getSmsCodeService();
    const messages = readRecentSms(5);

    if (messages.length === 0) {
      throw new Error('没有找到短信');
    }

    for (const msg of messages) {
      const code = smsService.extractVerificationCode(msg.body);
      if (code) {
        const profileHash = await calculateTextHash(code);

        await apiClient.putContent({
          type: 'Text',
          text: code,
          profileHash,
          localClipboardHash: profileHash,
          timestamp: Date.now(),
        });

        ToastAndroid.show(`已上传验证码: ${code}`, ToastAndroid.SHORT);
        return;
      }
    }

    const smsPreview = messages.map((msg, i) => `[${i + 1}] ${msg.from}: ${msg.body}`).join('\n');
    const debugMode = useSettingsStore.getState().config?.debugMode;
    if (debugMode) {
      throw new Error(`最近的短信中未找到验证码\n\n${smsPreview}`);
    }
    throw new Error('最近的短信中未找到验证码');
  }, []);

  return (
    <QuickLoadingPage
      task={task}
      loadingText="正在读取短信..."
      successText="验证码上传成功"
      failureText="上传失败"
      onComplete={onComplete}
    />
  );
};
