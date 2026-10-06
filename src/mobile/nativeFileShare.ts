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

export async function shareRemoteFileOnDevice(input: NativeFileInput) {
  if (!isNativeFileShareAvailable()) {
    return { handled: false as const };
  }

  const response = await fetch(input.url);
  if (!response.ok) {
    throw new Error(`Dosya indirilemedi (HTTP ${response.status}).`);
  }

  const blob = await response.blob();
  const base64 = await blobToBase64(blob);
  const fileName = safeFileName(input.fileName);

  const written = await Filesystem.writeFile({
    path: `tarlapusula-share/${fileName}`,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  const canShare = await Share.canShare();
  if (!canShare.value) {
    throw new Error('Bu cihaz dosya paylaşımını desteklemiyor.');
  }

  await Share.share({
    title: input.title ?? 'TarlaPusula',
    text: input.text,
    url: written.uri,
    dialogTitle: input.dialogTitle ?? 'Dosyayı paylaş / kaydet',
  });

  return {
    handled: true as const,
    uri: written.uri,
    fileName,
  };
}

export function openRemoteFileInWeb(url: string) {
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.href = url;
}
