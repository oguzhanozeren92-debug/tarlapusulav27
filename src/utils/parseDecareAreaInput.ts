/**
 * Tarla alanını dekar cinsinden çözer.
 * Türkçe binlik (5.618), Türkçe ondalık (5,5), karma (5.618,324)
 * ve basit noktalı ondalık (5.5) girişlerini kabul eder.
 * Üç haneli tek nokta Türkçe binlik ayırıcı sayılır;
 * üç basamaklı ondalık yazmak için virgül kullanılmalıdır (5,618).
 */
export function parseDecareAreaInput(value: string): number {
  const compact = value.trim().replace(/[\s\u00a0\u202f]/g, '');
  if (!compact) return Number.NaN;

  let normalized: string;
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(compact)) {
    normalized = compact.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(?:,\d{3})+\.\d+$/.test(compact)) {
    normalized = compact.replace(/,/g, '');
  } else if (/^\d+(?:[.,]\d+)?$/.test(compact)) {
    normalized = compact.replace(',', '.');
  } else {
    return Number.NaN;
  }

  return Number(normalized);
}
