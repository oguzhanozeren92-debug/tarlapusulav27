import { supabase } from '../../../supabaseClient';
import { getPrivateFileUrl, uploadPrivateFile } from '../../../services/r2Storage';
import type { WeeklyPusulaReport } from '../types';
import { generatePusulaPdf } from './pusulaPdfRenderer.service';
import {
  openRemoteFileInWeb,
  shareBlobFileOnDevice,
  shareRemoteFileOnDevice,
} from '../../../mobile/nativeFileShare';

function safePart(value: unknown) {
  return String(value ?? 'report').toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü-]+/gi, '-').replace(/^-+|-+$/g, '') || 'report';
}

export async function ensurePusulaPdfArchived(report: WeeklyPusulaReport) {
  if (report.pdf_path) return report.pdf_path;
  if (!report.report_data) throw new Error('Rapor snapshot verisi bulunamadı.');

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!authData.user) throw new Error('Rapor arşivi için oturum bulunamadı.');

  const doc = await generatePusulaPdf(report.report_data);
  const blob = doc.output('blob');
  const objectPath = [
    authData.user.id,
    report.field_id,
    safePart(report.report_data.field?.name),
    `${report.id}.pdf`,
  ].join('/');

  const storedPath = await uploadPrivateFile('reports', objectPath, blob, 'application/pdf');
  const { data, error } = await supabase
    .from('weekly_field_reports')
    .update({ pdf_bucket: 'r2:reports', pdf_path: storedPath, generated_at: new Date().toISOString() })
    .eq('id', report.id)
.eq('user_id', authData.user.id)
    .select('*')
    .single();
  if (error) throw error;
  return String(data.pdf_path ?? storedPath);
}

/**
 * PDF save must never be blocked by R2 signing, CORS, or temporary network
 * errors. Render from the approved snapshot and let the user save locally.
 */
async function saveLocalPusulaPdf(
  report: WeeklyPusulaReport,
  fileName: string,
) {
  if (!report.report_data) throw new Error('Rapor verileri henüz hazırlanmadı.');
  const doc = await generatePusulaPdf(report.report_data);
  const blob = doc.output('blob');
  if (!blob.size) throw new Error('PDF boş üretildi. Tekrar deneyin.');
  const saved = await shareBlobFileOnDevice({
    blob,
    fileName,
    title: 'TarlaPusula · Tarla Analiz Raporu',
    dialogTitle: 'PDF’yi Dosyalara Kaydet',
  });
  if (saved.handled) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Allow WebKit to start the file transfer before releasing the blob.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export async function openArchivedPusulaPdf(report: WeeklyPusulaReport) {
  const fieldName = safePart(report.report_data?.field?.name || 'tarla');
  const periodEnd = safePart(report.period_end || report.generated_at || report.id);
  const fileName = `TarlaPusula-${fieldName}-${periodEnd}.pdf`;

  try {
    const storedPath = await ensurePusulaPdfArchived(report);
    const url = await getPrivateFileUrl('reports', storedPath);
    if (!url) throw new Error('PDF indirme bağlantısı hazırlanamadı.');

    const nativeResult = await shareRemoteFileOnDevice({
      url,
      fileName,
      title: 'TarlaPusula · Tarla Analiz Raporu',
      text: `${report.report_data?.field?.name || 'Tarla'} için TarlaPusula raporu`,
      dialogTitle: 'Raporu paylaş / kaydet',
    });

    if (!nativeResult.handled) openRemoteFileInWeb(url);
    return storedPath;
  } catch (error) {
    // A failed R2 upload, a signed URL/CORS issue or a temporary network
    // failure cannot prevent saving a successfully rendered PDF on this phone.
    console.warn('[PUSULAPDF] Bulut indirmesi başarısız; yerel PDF yedeği:', error);
    await saveLocalPusulaPdf(report, fileName);
    return report.pdf_path || '';
  }
}
