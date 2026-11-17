/**
 * Bitki su ihtiyacı — TAGEM/DSİ "Türkiye'de Sulanan Bitkilerin Bitki Su
 * Tüketimleri" (2017) rehberindeki 259 istasyonun uzun yıllar verisi.
 *
 * Bu modül yalnızca rehberin kendi yöntemini uygular; tahmin veya demo değer
 * üretmez. Veri yoksa açıkça `null` döner ve arayüz "rehberde yok" der.
 *  - ETc = Kc × ETo (rehberde 36 adet 10 günlük dönem olarak verilir)
 *  - Etkili yağış Pe = yağışın %80'i
 *  - Yüzey/yağmurlama: dn = ETc − Pe ; damla: T = ETc × Ps/85, dn = T − Pe
 *  - Toplam sulama suyu dt = dn / (Ea × Ec); basınçlı sistemlerde Ec = 0,98
 * 1 mm su = dekara 1 m³ = 1 ton.
 */

export type WaterNeedCrop = { etc: number[]; toplam: number; kaynak: 'rehber' | 'hesap' };
export type WaterNeedStation = {
  no: string; ad: string; il: string; bolge: string;
  enlem: number; boylam: number; rakim: number;
  eto: number[]; yagis: number[];
  bitkiler: Record<string, WaterNeedCrop>;
};
export type WaterNeedDataset = { meta: Record<string, unknown>; istasyonlar: WaterNeedStation[] };

export type IrrigationSystemId =
  | 'yuzey' | 'tasinabilir_yagmurlama' | 'sabit_yagmurlama' | 'lineer_pivot'
  | 'mikro_yagmurlama' | 'yuzey_damla' | 'yuzeyalti_damla';

/** Randımanlar rehberin 5. bölümünden; yüzey sulama için rehber randıman vermez. */
export const IRRIGATION_SYSTEMS: Array<{ id: IrrigationSystemId; label: string; ea: number | null; drip: boolean }> = [
  { id: 'yuzey', label: 'Salma / karık / tava', ea: null, drip: false },
  { id: 'tasinabilir_yagmurlama', label: 'Yağmurlama (taşınabilir)', ea: 0.70, drip: false },
  { id: 'sabit_yagmurlama', label: 'Yağmurlama (sabit)', ea: 0.75, drip: false },
  { id: 'lineer_pivot', label: 'Lineer / center pivot', ea: 0.80, drip: false },
  { id: 'mikro_yagmurlama', label: 'Ağaçaltı mikro yağmurlama', ea: 0.85, drip: false },
  { id: 'yuzey_damla', label: 'Damla (yüzey)', ea: 0.90, drip: true },
  { id: 'yuzeyalti_damla', label: 'Damla (toprak altı)', ea: 0.95, drip: true },
];
export const EFFECTIVE_RAIN_RATIO = 0.8;
export const PRESSURIZED_CONVEYANCE = 0.98;

/** Tarladaki kayıtlı yöntemden hesaplayıcının başlangıç seçimi. */
export function systemFromFieldMethod(method: string | null | undefined): IrrigationSystemId {
  if (method === 'trickle') return 'yuzey_damla';
  if (method === 'sprinkler') return 'sabit_yagmurlama';
  return 'yuzey';
}

/** Damla sulamada gölgelenen alan yüzdesi (Ps) — rehberin önerdiği değerler. */
export const SHADE_OPTIONS = [
  { ps: 80, label: 'Tarla bitkisi / sebze' },
  { ps: 75, label: 'Bağ veya sık dikim meyve (sıra arası < 4 m)' },
  { ps: 70, label: 'Geniş dikim meyve (sıra arası ≥ 4 m)' },
] as const;

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
export function decadeLabel(index: number): string {
  const month = MONTHS[Math.floor(index / 3)] ?? '';
  return `${month} ${['1-10', '11-20', '21-son'][index % 3]}`;
}
export function decadeOf(date: Date): number {
  const day = date.getDate();
  return date.getMonth() * 3 + (day <= 10 ? 0 : day <= 20 ? 1 : 2);
}

const trLower = (value: string) => value.replace(/I/g, 'ı').replace(/İ/g, 'i').toLocaleLowerCase('tr-TR');
export const normalizeCropName = (value: string) =>
  trLower(value).replace(/fasülye/g, 'fasulye').replace(/[^a-zçğıöşü0-9]/g, '');
const baseName = (rehberName: string) => rehberName.split(' (')[0];

/** Uygulamadaki ürün adı → rehberdeki adlar (yalnız birebir karşılığı olanlar). */
const ALIASES: Record<string, string[]> = {
  antepfistigi: ['Antepfıstığı'],
  balkabagi: ['Balkabağı'],
  cerezlikkabak: ['Balkabağı (Çerezlik)'],
  beyazlahana: ['Lahana (Beyaz)'],
  cayirotu: ['Çayır, Mera (Tek Yıllık)'],
  cukurovapamugu: ['Pamuk'],
  kurufasulye: ['Fasülye (Kuru)', 'Fasülye (Barbunya, Kuru)', 'Fasülye (Kuru, 2. Ürün)'],
  gul: ['Gül (Yağlık)'],
  kolzakanola: ['Kanola'],
  limon: ['Narenciye'], mandalina: ['Narenciye'], portakal: ['Narenciye'], greyfurt: ['Narenciye'],
  sekerpancari: ['Şekerpancarı', 'Şekerpancarı (Diğer)'],
  soyafasulyesi: ['Soya Fasülyesi', 'Soya Fasülyesi (2. Ürün)'],
  yerfistigi: ['Yerfıstığı', 'Yerfıstığı (2. Ürün)'],
  pancar: ['Şekerpancarı'],
  soya: ['Soya Fasülyesi'],
  misir: ['Mısır (Dane)', 'Mısır (Silajlık)', 'Mısır (Dane, 2. Ürün)', 'Mısır (Silajlık, 2. Ürün)'],
};
// Tek kelimelik adlarda ilk tercih edilen çeşit (ana ürün, 2. ürün değil).
const PREFERRED = ['Kışlık', 'Yer', 'Sivri', 'Dane', 'Sofralık', 'Kuru', 'Yağlık', 'Taze', 'Normal', 'Beyaz', 'Kırmızı'];
const fixKey = (value: string) => normalizeCropName(value).replace(/ı/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ö/g, 'o').replace(/ç/g, 'c');

/** Rehberdeki uygun ürün adları, en olası olan başta. */
export function matchRehberCrops(appCrop: string, available: string[]): string[] {
  const key = fixKey(appCrop);
  if (!key) return [];
  const aliased = ALIASES[key];
  const candidates = aliased
    ? available.filter((name) => aliased.includes(name))
    : available.filter((name) => fixKey(baseName(name)) === key || fixKey(name) === key);
  const rank = (name: string) => {
    if (aliased) return aliased.indexOf(name);
    const second = /2\. Ürün/.test(name) ? 100 : 0;
    const inside = name.match(/\(([^)]*)\)/)?.[1] ?? '';
    const pref = inside ? PREFERRED.findIndex((p) => inside.startsWith(p)) : -1;
    return second + (inside ? (pref < 0 ? 50 : pref + 1) : 0);
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'tr-TR'));
}

export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)));
}

export type StationPick = { station: WaterNeedStation; distanceKm: number | null; basis: 'konum' | 'il' };
/** En fazla bu uzaklıktaki istasyon kullanılır; daha uzağı farklı iklim olabilir. */
export const MAX_STATION_DISTANCE_KM = 120;

/**
 * Tarlaya en yakın ve ürünü rehberde bulunan istasyon. Koordinat yoksa
 * aynı ildeki (il merkezi adlı, yoksa ilk) istasyon kullanılır.
 */
export function pickStation(
  stations: WaterNeedStation[], appCrop: string,
  location: { lat?: number | null; lng?: number | null; city?: string | null },
): StationPick | null {
  const hasCrop = (s: WaterNeedStation) => matchRehberCrops(appCrop, Object.keys(s.bitkiler)).length > 0;
  const { lat, lng, city } = location;
  if (typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng)) {
    let best: StationPick | null = null;
    for (const station of stations) {
      if (!hasCrop(station)) continue;
      const d = distanceKm(lat, lng, station.enlem, station.boylam);
      if (d <= MAX_STATION_DISTANCE_KM && (!best || d < (best.distanceKm ?? Infinity))) best = { station, distanceKm: d, basis: 'konum' };
    }
    return best;
  }
  if (city) {
    const c = fixKey(city);
    const inCity = stations.filter((s) => fixKey(s.il) === c && hasCrop(s));
    const center = inCity.find((s) => fixKey(s.ad) === c) ?? inCity[0];
    return center ? { station: center, distanceKm: null, basis: 'il' } : null;
  }
  return null;
}

export type WaterNeedResult = {
  crop: string;
  source: 'rehber' | 'hesap';
  activeDecades: number[];
  etc: number[];
  effectiveRain: number[];
  /** Sezon toplamları (mm = m³/da) */
  seasonEtc: number;
  seasonEffectiveRain: number;
  seasonNet: number;
  seasonGross: number | null;
  /** Bu 10 günlük dönem */
  current: { decade: number; etc: number; net: number; gross: number | null; inSeason: boolean };
  efficiency: number | null;
};

const round1 = (value: number) => Math.round(value * 10) / 10;

/** Rehberin 6-9 numaralı eşitlikleri, 10 günlük dönemler üzerinden. */
export function calculateWaterNeed(
  station: WaterNeedStation, crop: string,
  options: { system: IrrigationSystemId; shadePercent?: number; today?: Date },
): WaterNeedResult | null {
  const data = station.bitkiler[crop];
  if (!data || data.etc.length !== 36) return null;
  const sys = IRRIGATION_SYSTEMS.find((s) => s.id === options.system) ?? IRRIGATION_SYSTEMS[0];
  const ps = options.shadePercent ?? 80;
  const factor = sys.drip ? ps / 85 : 1;
  const efficiency = sys.ea === null ? null : sys.ea * PRESSURIZED_CONVEYANCE;
  const activeDecades = data.etc.map((v, i) => (v > 0 ? i : -1)).filter((i) => i >= 0);
  const effectiveRain = station.yagis.map((r, i) => (data.etc[i] > 0 ? r * EFFECTIVE_RAIN_RATIO : 0));
  const net = data.etc.map((v, i) => (v > 0 ? Math.max(0, v * factor - effectiveRain[i]) : 0));
  const seasonNet = net.reduce((a, b) => a + b, 0);
  const decade = decadeOf(options.today ?? new Date());
  return {
    crop, source: data.kaynak, activeDecades,
    etc: data.etc, effectiveRain: effectiveRain.map(round1),
    seasonEtc: data.toplam,
    seasonEffectiveRain: round1(effectiveRain.reduce((a, b) => a + b, 0)),
    seasonNet: round1(seasonNet),
    seasonGross: efficiency === null ? null : round1(seasonNet / efficiency),
    current: {
      decade, etc: data.etc[decade], net: round1(net[decade]),
      gross: efficiency === null ? null : round1(net[decade] / efficiency),
      inSeason: data.etc[decade] > 0,
    },
    efficiency,
  };
}

let datasetPromise: Promise<WaterNeedDataset> | null = null;
/** Veri 1,2 MB; yalnız kart açılınca ve bir kez indirilir. */
export function loadWaterNeedDataset(): Promise<WaterNeedDataset> {
  datasetPromise ??= fetch('/data/bitki-su-tuketimi.json')
    .then((response) => {
      if (!response.ok) throw new Error('Su tüketimi verisi indirilemedi.');
      return response.json() as Promise<WaterNeedDataset>;
    })
    .catch((error) => { datasetPromise = null; throw error; });
  return datasetPromise;
}
