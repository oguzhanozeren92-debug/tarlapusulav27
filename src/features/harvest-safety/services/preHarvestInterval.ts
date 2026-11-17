/**
 * Hasat öncesi bekleme süresi (ilacın etiketinde yazan, son uygulama ile hasat
 * arasındaki gün sayısı). Uygulama ilaç önermez; çiftçinin girdiği etiket
 * bilgisini işlem notuna yazar ve "en erken hasat tarihi"ni hesaplar.
 * Not biçimi diğer teknik notlarla (ör. "Toplam sulama suyu: 40 m³") aynıdır.
 */
export const PHI_MAX_DAYS = 365;
const PHI_RE = /hasat öncesi bekleme süresi\s*:\s*(\d{1,3})\s*gün/i;

export function phiNote(days: number): string {
  return `Hasat öncesi bekleme süresi: ${Math.round(days)} gün.`;
}

/** Formdaki metni doğrular: boş → null, geçersiz → 'invalid'. */
export function parsePhiInput(value: string): number | null | 'invalid' {
  const text = value.trim();
  if (!text) return null;
  if (!/^\d{1,3}$/.test(text)) return 'invalid';
  const days = Number(text);
  return days >= 0 && days <= PHI_MAX_DAYS ? days : 'invalid';
}

export function parsePhiDays(notes: string | null | undefined): number | null {
  const match = String(notes ?? '').match(PHI_RE);
  return match ? Number(match[1]) : null;
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export type HarvestHold = { activityDate: string; productName: string | null; days: number; safeFrom: string };

/**
 * Bugün hâlâ süren bekleme süreleri; en geç biten başta.
 * safeFrom: hasadın yapılabileceği ilk gün (uygulama günü + bekleme süresi).
 */
export function activeHarvestHolds(
  activities: Array<{ type: string; activityDate: string; productName: string | null; notes: string | null }>,
  todayIso: string,
): HarvestHold[] {
  const holds: HarvestHold[] = [];
  for (const a of activities) {
    if (a.type !== 'İlaçlama') continue;
    const days = parsePhiDays(a.notes);
    if (days === null || !/^\d{4}-\d{2}-\d{2}/.test(a.activityDate)) continue;
    const safeFrom = addDays(a.activityDate, days);
    if (safeFrom > todayIso) holds.push({ activityDate: a.activityDate.slice(0, 10), productName: a.productName, days, safeFrom });
  }
  return holds.sort((x, y) => y.safeFrom.localeCompare(x.safeFrom));
}

export function daysUntil(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(`${toIso}T00:00:00Z`) - Date.parse(`${fromIso}T00:00:00Z`)) / 86400000);
}
