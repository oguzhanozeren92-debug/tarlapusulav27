import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { supabase } from '../../../supabaseClient';
import type { WeeklyPusulaReport } from '../types';
import { generatePusulaPdf } from './pusulaPdfRenderer.service';

// App-private durable storage: never silently write to Apple's Files or shared
// Downloads. A user may explicitly export to Files via the share sheet.
const REPORT_FOLDER = 'pusulapdf';
const saving = new Map<string, Promise<SavedPusulaPdf | null>>();

type SavedPusulaPdf = { path: string; uri: string; fileName: string };

export function canSavePusulaPdfLocally() {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('Filesystem');
}

function safeName(value: string) {
  return String(value || 'Tarla').normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-').slice(0, 80);
}

function makePath(report: WeeklyPusulaReport, userId: string) {
  const fileName = `TarlaPusula-${safeName(report.report_data?.field?.name || 'Tarla')}-${safeName(report.period_end || report.id)}.pdf`;
  const safeId = String(report.id).replace(/[^a-zA-Z0-9_-]/g, '');
  return { fileName, path: `${REPORT_FOLDER}/${userId}/${safeId}.pdf` };
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('PDF okunamadı.'));
    reader.onload = () => {
      const raw = String(reader.result ?? '');
      resolve(raw.slice(raw.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function getSavedPusulaPdf(report: WeeklyPusulaReport): Promise<SavedPusulaPdf | null> {
  if (!canSavePusulaPdfLocally()) return null;
  const { data: session } = await supabase.auth.getUser();
  const userId = session.user?.id;
  if (!userId || report.user_id !== userId) return null;
  const { path, fileName } = makePath(report, userId);
  try {
    const result = await Filesystem.stat({ path, directory: Directory.Data });
    if (result.size === 0) return null;
    return { path, uri: result.uri, fileName };
  } catch {
    return null;
  }
}

export async function savePusulaPdfOnDevice(report: WeeklyPusulaReport): Promise<SavedPusulaPdf | null> {
  if (!canSavePusulaPdfLocally() || !report.report_data) return null;
  const previous = saving.get(report.id);
  if (previous) return previous;
  const task = (async () => {
    const existing = await getSavedPusulaPdf(report);
    if (existing) return existing;

    const { data: session } = await supabase.auth.getUser();
    const userId = session.user?.id;
    if (!userId || userId !== report.user_id) return null;

    const doc = await generatePusulaPdf(report.report_data);
    const blob = doc.output('blob');
    if (blob.size === 0) throw new Error('PDF boş üretildi.');
    const { path, fileName } = makePath(report, userId);
    const written = await Filesystem.writeFile({
      path,
      data: await blobToBase64(blob),
      directory: Directory.Data,
      recursive: true,
    });
    return { path, uri: written.uri, fileName };
  })();
  saving.set(report.id, task);
  try {
    return await task;
  } finally {
    saving.delete(report.id);
  }
}

export async function shareSavedPusulaPdf(report: WeeklyPusulaReport) {
  const saved = await getSavedPusulaPdf(report);
  if (!saved || !Capacitor.isPluginAvailable('Share')) return false;
  const available = await Share.canShare();
  if (!available.value) return false;
  await Share.share({
    title: 'TarlaPusula · PusulaPDF',
    url: saved.uri,
    dialogTitle: 'PDF’yi aç, paylaş veya Dosyalara kaydet',
  });
  return true;
}
