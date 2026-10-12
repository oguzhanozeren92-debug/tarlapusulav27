export type PusulaPdfPeriodPreset = '7' | '14' | '30' | 'custom';

export function todayLocalIso(now = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function dateParts(raw: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const millis = Date.parse(`${raw}T00:00:00Z`);
  if (!Number.isFinite(millis) || new Date(millis).toISOString().slice(0,10) !== raw) return null;
  return millis;
}

export function presetReportPeriod(preset: Exclude<PusulaPdfPeriodPreset,'custom'>, today = todayLocalIso()) {
  const days = Number(preset);
  const endMillis = dateParts(today);
  if (endMillis === null) throw new Error('Güncel tarih alınamadı.');
  return { start: new Date(endMillis-(days-1)*86400000).toISOString().slice(0,10), end: today };
}

export function reportPeriodValidation(start: string, end: string, today = todayLocalIso()) {
  const from = dateParts(start), to = dateParts(end), latest = dateParts(today);
  if (from === null || to === null || latest === null) return 'Başlangıç ve bitiş tarihini seç.';
  if (to > latest) return 'Gelecek tarihler için rapor alınamaz.';
  const days = Math.round((to - from)/86400000)+1;
  if (days < 7) return 'Rapor dönemi en az 7 gün olmalıdır.';
  if (days > 180) return 'Tek raporda en fazla 180 günlük dönem seçilebilir.';
  return '';
}
