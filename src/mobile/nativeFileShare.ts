import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

type NativeFileInput = {
  url: string;
  fileName: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
};

function safeFileName(value: string) {
  return String(value || 'TarlaPusula-dosya')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 140) || 'TarlaPusula-dosya';
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => {
      reject(reader.error ?? new Error('Dosya okunamadı.'));
    };

    reader.onload = () => {
      const value = String(reader.result ?? '');
      const commaIndex = value.indexOf(',');
      resolve(commaIndex >= 0 ? value.slice(commaIndex + 1) : value);
    };

    reader.readAsDataURL(blob);
  });
}

export function isNativeFileShareAvailable() {
  return (
    Capacitor.isNativePlatform() &&
    Capacitor.isPluginAvailable('Filesystem') &&
    Capacitor.isPluginAvailable('Share')
  );
}

export async function shareBlobFileOnDevice(input: {
  blob: Blob;
  fileName: string;
  title?: string;
  text?: string;
  dialogTitle?: string;
}) {
  if (!isNativeFileShareAvailable()) return { handled: false as const };
  if (!input.blob.size) throw new Error('PDF dosyası boş; tekrar oluşturmayı deneyin.');
  const name = safeFileName(input.fileName);
  const base64 = await blobToBase64(input.blob);
  const written = await Filesystem.writeFile({
    path: `tarlapusula-share/${name}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });
  const canShare = await Share.canShare();
  if (!canShare.value) throw new Error('Bu cihaz dosya kaydetme/paylaşmayı desteklemiyor.');
  await Share.share({
    title: input.title ?? 'TarlaPusula',
    text: input.text,
    url: written.uri,
    dialogTitle: input.dialogTitle ?? 'PDF’yi Dosyalara Kaydet',
  });
  return { handled: true as const, uri: written.uri, fileName: name };
}

export async function shareRemoteFileOnDevice(input: NativeFileInput) {
  if (!isNativeFileShareAvailable()) {
    return { handled: false as const };
  }

  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Dosya indirilemedi (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.size) throw new Error('İndirilen dosya boş. Tekrar deneyin.');
  return shareBlobFileOnDevice({ ...input, blob });
}

export function openRemoteFileInWeb(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = url;
}
