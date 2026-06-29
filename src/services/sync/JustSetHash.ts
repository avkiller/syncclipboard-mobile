/**
 * JustSetHash
 * 管理刚上传/刚设置到本地剪贴板的 hash，用于防止循环同步
 */

/** 刚上传的 hash：用于防止上传后立即被远程回流触发重复处理 */
let justUploadedHash: string | null = null;

export function setJustUploadedHash(hash: string): void {
  justUploadedHash = hash;
}

export function getJustUploadedHash(): string | null {
  return justUploadedHash;
}

export function clearJustUploadedHash(): void {
  justUploadedHash = null;
}

/** 刚设置到本地剪贴板的 hash：用于防止下载后立即被 ClipboardMonitor 触发自动上传 */
let justSetLocalHash: string | null = null;

export function setJustSetLocalHash(hash: string): void {
  justSetLocalHash = hash;
}

export function getJustSetLocalHash(): string | null {
  return justSetLocalHash;
}

export function clearJustSetLocalHash(): void {
  justSetLocalHash = null;
}
