import type { ClipboardContent } from '@/types/clipboard';
import { configService } from '../ConfigService';
import { File } from 'expo-file-system';
import { saveFileToDirectory } from '@/utils/fileActions';

/**
 * 将同步的文件保存到用户指定的目录
 * @param content 下载完成的剪贴板内容
 */
export async function saveSyncFileToUserPath(content: ClipboardContent): Promise<void> {
  // 只处理文件类型
  if (!content.fileUri || !content.fileName) return;

  const config = await configService.getConfig();

  // 检查是否启用自动保存
  if (!config.autoSaveSyncFile || !config.syncFileSavePath) return;

  try {
    const sourceFile = new File(content.fileUri);
    if (!sourceFile.exists) {
      console.warn('[saveSyncFileToUserPath] Source file does not exist:', content.fileUri);
      return;
    }

    const destUri = await saveFileToDirectory(
      content.fileUri,
      config.syncFileSavePath,
      content.fileName
    );
    console.log('[saveSyncFileToUserPath] File saved to:', destUri);
  } catch (error) {
    console.error('[saveSyncFileToUserPath] Failed to save file:', error);
  }
}
