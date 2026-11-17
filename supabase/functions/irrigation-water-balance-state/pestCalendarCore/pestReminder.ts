// OTOMATİK KOPYA — düzenleme: src/features/pest-calendar/services/pestReminder.ts, sonra scripts/sync-water-need-core.mjs
/**
 * Zararlı takvimi bildirim metinleri ve yağışsız gün seçimi.
 * Uygulama ve sunucu (irrigation-water-balance-state içindeki tarama) aynı kodu
 * kullanır; sunucu kopyası scripts/sync-water-need-core.mjs ile üretilir.
 */
import { calendarForCrop, splitByMonth, type PestEntry } from './pestCalendar.ts';

export const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
/** Tahmindeki günlük yağış bu değerin altındaysa gün "yağışsız" sayılır (mm). */
export const DRY_DAY_MM = 0.5;
/** Aylık hatırlatmadan kaç gün sonra "ilaçlama yaptın mı?" diye sorulur. */
export const CHECKIN_AFTER_DAYS = 7;
/** "Yapacağım" cevabından kaç gün sonra tekrar sorulur. */
export const CHECKIN_FOLLOWUP_DAYS = 5;
export const CHECKIN_MAX_ASKS = 3;

export type SprayResponse = 'yaptim' | 'yapacagim' | 'yapmayacagim';

export function monthPests(crop: string | null | undefined, month: number): { calendarName: string; entries: PestEntry[] } | null {
  const cal = calendarForCrop(crop);
  if (!cal) return null;
  const { thisMonth } = splitByMonth(cal, month);
  return thisMonth.length ? { calendarName: cal.ad, entries: thisMonth } : null;
}

export function dryDays(forecast: Array<{ date: string; rain: number | null }>, fromIso: string, limit = 7): string[] {
  return forecast
    .filter((d) => d.date >= fromIso && d.rain !== null && d.rain < DRY_DAY_MM)
    .slice(0, limit)
    .map((d) => d.date);
}

const dayShort = (iso: string) => {
  const d = new Date(`${iso}T12:00:00Z`);
  return `${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]}`;
};

function listNames(entries: PestEntry[], max = 3) {
  const names = entries.map((e) => e.ad);
  return names.length <= max ? names.join(', ') : `${names.slice(0, max).join(', ')} ve ${names.length - max} diğeri`;
}

export function pestReminderText(input: {
  fieldName: string; crop: string; month: number; entries: PestEntry[]; dry: string[] | null;
}): { title: string; message: string } {
  const head = `${input.fieldName} (${input.crop}): ${MONTH_NAMES[input.month - 1]} ayında takvimde ${listNames(input.entries)} var.`;
  const weather = input.dry === null ? ''
    : input.dry.length
      ? ` Önümüzdeki günlerde yağış beklenmeyen günler: ${input.dry.slice(0, 5).map(dayShort).join(', ')}.`
      : ' Önümüzdeki 7 günün her gününde yağış bekleniyor.';
  const tail = ' İzleme zamanı ve eşikler Risk sekmesinde.';
  return { title: 'Pusula · Bu ay zararlı/hastalık kontrolü', message: `${head}${weather}${tail}`.slice(0, 320) };
}

export function checkinText(input: { fieldName: string; crop: string; pests: string[] }): { title: string; message: string } {
  const pests = input.pests.length ? ` (${input.pests.slice(0, 3).join(', ')})` : '';
  return {
    title: 'Pusula · İlaçlama yaptın mı?',
    message: `${input.fieldName} (${input.crop}) için bu ayki kontrol${pests} sonrası ilaçlama yaptın mı? Pusula'ya dokunup "Yaptım", "Yapacağım" ya da "Yapmayacağım" de; cevabın kaydedilir.`.slice(0, 320),
  };
}

export function followUpAt(response: SprayResponse, now = new Date()): Date | null {
  if (response !== 'yapacagim') return null;
  const d = new Date(now);
  d.setDate(d.getDate() + CHECKIN_FOLLOWUP_DAYS);
  return d;
}
