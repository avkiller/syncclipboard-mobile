/**
 * Direct Share Receive Screen
 * 直接处理从 ShareActivity 传递的分享数据（不使用 expo-sharing）
 */

import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import {
  createContentFromFile,
  createContentFromText,
} from '@/utils/clipboard/clipboardContentUtils';
import { setRemoteClipboard } from '@/services/sync/ClipboardSyncActions';
import { QuickLoadingPage } from '@/components/QuickLoadingPage';
import type { ProgressInfo } from 'native-util';

interface ShareData {
  type: 'text' | 'file' | 'multiple';
  text?: string;
  uri?: string;
  uris?: string[];
  mimeType?: string;
  fileName?: string;
}

interface DirectShareReceiveScreenProps {
  shareData: ShareData;
  onComplete: () => void;
  overlayMode?: boolean;
}

export const DirectShareReceiveScreen: React.FC<DirectShareReceiveScreenProps> = ({
  shareData,
  onComplete,
  overlayMode = false,
}) => {
  const { t } = useTranslation();
  const activeServer = useSettingsStore((s) => s.getActiveServer());
  const [loadingText, setLoadingText] = useState(() => t('shareReceive.processingFile'));
  const [progress, setProgress] = useState<ProgressInfo | null>(null);
  const [previewText, setPreviewText] = useState<string | undefined>(undefined);
  const [previewImage, setPreviewImage] = useState<string | undefined>(undefined);

  const task = useCallback(
    async (signal: AbortSignal) => {
      if (!activeServer) throw new Error(t('common.serverNotConfigured'));

      // Handle text share
      if (shareData.type === 'text' && shareData.text) {
        setLoadingText(t('shareReceive.uploadingText'));
        setPreviewText(shareData.text.slice(0, 100));
        const textContent = await createContentFromText(shareData.text, { signal });
        await setRemoteClipboard(textContent, signal);
        return;
      }

      // Handle file share
      if (shareData.type === 'file' && shareData.uri) {
        const fileName = shareData.fileName || extractFileNameFromUri(shareData.uri);
        const mimeType = shareData.mimeType || 'application/octet-stream';

        setLoadingText(t('shareReceive.uploadingFile'));
        setPreviewText(fileName);

        // If it's an image, set preview
        if (mimeType.startsWith('image/')) {
          setPreviewImage(shareData.uri);
        }

        const content = await createContentFromFile(shareData.uri, fileName, mimeType, undefined, {
          signal,
        });

        await setRemoteClipboard(content, signal, (info) => {
          setProgress(info ?? null);
        });
        return;
      }

      // Handle multiple files (only upload first file for now)
      if (shareData.type === 'multiple' && shareData.uris && shareData.uris.length > 0) {
        const uri = shareData.uris[0];
        const fileName = extractFileNameFromUri(uri);
        const mimeType = shareData.mimeType || 'application/octet-stream';

        setLoadingText(t('shareReceive.uploadingFile'));
        setPreviewText(fileName);

        const content = await createContentFromFile(uri, fileName, mimeType, undefined, { signal });

        await setRemoteClipboard(content, signal, (info) => {
          setProgress(info ?? null);
        });
        return;
      }

      throw new Error(t('shareReceive.noContent'));
    },
    [shareData, activeServer, t]
  );

  return (
    <QuickLoadingPage
      task={task}
      loadingText={loadingText}
      successText={t('shareReceive.success')}
      failureText={t('shareReceive.failed')}
      onComplete={onComplete}
      progress={progress}
      previewText={previewText}
      previewImage={previewImage}
      overlayMode={overlayMode}
    />
  );
};

/**
 * Extract file name from URI
 */
function extractFileNameFromUri(uri: string): string {
  try {
    const url = new URL(uri);
    const pathname = url.pathname;
    const fileName = pathname.substring(pathname.lastIndexOf('/') + 1);
    return fileName || `shared_${Date.now()}`;
  } catch {
    return `shared_${Date.now()}`;
  }
}
