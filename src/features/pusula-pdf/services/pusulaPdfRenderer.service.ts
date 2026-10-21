import { jsPDF } from 'jspdf';
import type { PusulaPdfFieldPhoto, PusulaPdfSatellitePoint, PusulaPdfSnapshot } from '../types';
import type { PusulaInsight } from './pusulaPdfInsights.service';
import { buildPusulaPdfGuidance } from './pusulaPdfInsights.service';

const W = 1240;
const H = 1754;
const OUTPUT_SCALE = 2; // A4: ~300 dpi instead of the old ~150 dpi.
const BRAND_BODY = 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-body.webp';
const BRAND_NEEDLE = 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-needle-centered.webp';
const INK = '#10243a';
const MUTED = '#667784';
const LINE = '#dfe6e9';
const WHITE = '#ffffff';
const PAGE = '#f7f9fa';
const GREEN = '#07964f';
const GREEN_DARK = '#07513f';
const GREEN_SOFT = '#edf9f1';
const BLUE = '#1677e8';
const BLUE_SOFT = '#edf5ff';
const ORANGE = '#f58219';
const ORANGE_SOFT = '#fff4e8';
const RED = '#ec3f42';
const RED_SOFT = '#fff0f1';
const PURPLE = '#7a23d7';
const PURPLE_SOFT = '#f5efff';
const TEAL = '#009688';
const GRAY_SOFT = '#f3f6f7';

const APP_WEB_URL = String(import.meta.env.VITE_PUBLIC_APP_URL || 'https://tarlapusulav27.vercel.app/').trim();
const ANDROID_URL = String(import.meta.env.VITE_ANDROID_DOWNLOAD_URL || APP_WEB_URL).trim();
const IOS_URL = String(import.meta.env.VITE_IOS_DOWNLOAD_URL || APP_WEB_URL).trim();

const fmt = (value?: string | null, year = true) => {
  if (!value) return '—';
  const raw = String(value).slice(0, 10);
  const d = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString('tr-TR', year
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: 'numeric', month: 'short' });
};

const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = W * OUTPUT_SCALE;
  canvas.height = H * OUTPUT_SCALE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PDF çizim alanı oluşturulamadı.');
  ctx.scale(OUTPUT_SCALE, OUTPUT_SCALE);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = PAGE;
  ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'alphabetic';
  return { canvas, ctx };
}

function font(ctx: CanvasRenderingContext2D, size: number, weight = 500) {
  ctx.font = `${weight} ${size}px Inter, "Noto Sans", Arial, sans-serif`;
}

function rr(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r = 16,
  fill = WHITE,
  stroke = LINE,
  lineWidth = 1.2,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

function text(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 18,
  weight = 500,
  color = INK,
) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  ctx.fillText(String(value ?? ''), x, y);
}

function fittedText(ctx:CanvasRenderingContext2D,value:string,x:number,y:number,maxWidth:number,
 size=12,weight=750,color=INK){
  let actual=size;
  const copy=String(value??'');
  while(actual>8){
    font(ctx,actual,weight);
    if(ctx.measureText(copy).width<=maxWidth)break;
    actual-=0.5;
  }
  font(ctx,actual,weight);
  ctx.fillStyle=color;
  ctx.fillText(copy,x,y,Math.max(8,maxWidth));
}

function wrap(
  ctx: CanvasRenderingContext2D,
  value: string,
  x: number,
  y: number,
  size = 15,
  weight = 500,
  color = INK,
  maxWidth = 300,
  lineHeight = 1.25,
  maxLines = 4,
) {
  font(ctx, size, weight);
  ctx.fillStyle = color;
  const words = String(value ?? '').split(/\s+/).filter(Boolean);
  let current = '';
  let yy = y;
  let rendered = 0;

  for (let i = 0; i < words.length; i += 1) {
    const word = words[i];
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      const finalLine = rendered === maxLines - 1 && i < words.length ? `${current.replace(/[.,;:]?$/, '')}…` : current;
      ctx.fillText(finalLine, x, yy);
      rendered += 1;
      if (rendered >= maxLines) return yy;
      current = word;
      yy += size * lineHeight;
    } else {
      current = candidate;
    }
  }

  if (current && rendered < maxLines) ctx.fillText(current, x, yy);
  return yy;
}

function circleIcon(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  fill: string,
  symbol: string,
  symbolColor = WHITE,
  symbolSize = 16,
) {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.textAlign = 'center';
  text(ctx, symbol, x, y + symbolSize * 0.34, symbolSize, 900, symbolColor);
  ctx.textAlign = 'left';
}

async function logo(ctx: CanvasRenderingContext2D, x: number, y: number, compact = false) {
  const radius = compact ? 24 : 30;
  // Use the exact same 2-image compass mark as the app header.
  const body = await imageBitmapFrom(BRAND_BODY);
  const needle = await imageBitmapFrom(BRAND_NEEDLE);
  if (body) {
    ctx.drawImage(body, x - radius, y - radius, radius * 2, radius * 2);
    body.close();
  }
  if (needle) {
    ctx.drawImage(needle, x - radius, y - radius, radius * 2, radius * 2);
    needle.close();
  }
  // Never synthesize a surrogate green seed icon if the real mark is offline.
  text(ctx, 'TarlaPusula', x + radius + 12, y - 1, compact ? 24 : 31, 900, INK);
  text(ctx, 'TARLANIN AKLI, YANINDA.', x + radius + 14, y + (compact ? 20 : 24), compact ? 9 : 11, 800, MUTED);
}
function sectionHeader(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  number: number,
  titleValue: string,
  accent: string,
  symbol: string,
) {
  circleIcon(ctx, x + 18, y + 18, 16, accent, symbol, WHITE, 13);
  text(ctx, `${number}. ${titleValue}`, x + 42, y + 24, 17, 900, accent);
}

function wv(row: any, ...keys: string[]) {
  for (const key of keys) {
    const value = row?.[key];
    if (valid(value)) return value;
  }
  return null;
}

function wd(row: any) {
  return String(row?.date ?? row?.time ?? row?.datetime ?? '').slice(0, 10);
}

function avg(values: Array<number | null | undefined>) {
  const filtered = values.filter(valid);
  return filtered.length ? filtered.reduce((sum, value) => sum + value, 0) / filtered.length : null;
}

function periodCompare(points: PusulaPdfSatellitePoint[], key: 'ndvi' | 'ndmi') {
  const usable = points.filter((point) => valid(point[key]));
  if (usable.length < 2) return { current: null, previous: null, pct: null };
  const split = Math.max(1, Math.floor(usable.length / 2));
  const previous = avg(usable.slice(0, split).map((point) => point[key]));
  const current = avg(usable.slice(split).map((point) => point[key]));
  const pct = valid(previous) && previous !== 0 && valid(current)
    ? ((current - previous) / Math.abs(previous)) * 100
    : null;
  return { current, previous, pct };
}

function latestLayer(snapshot: PusulaPdfSnapshot, layer: string) {
  return [...(snapshot.layerArchive ?? [])]
    .filter((row: any) => String(row?.layer ?? row?.payload?.layer ?? '') === layer)
    .sort((a: any, b: any) => String(a?.observedAt ?? a?.archivedAt ?? '').localeCompare(String(b?.observedAt ?? b?.archivedAt ?? '')))
    .at(-1) ?? null;
}

function layerPayload(value: any) {
  return value?.payload ?? value ?? null;
}

function metricNumber(payload: any, ...keys: string[]) {
  const metrics = payload?.metrics ?? {};
  for (const key of keys) {
    const raw = metrics?.[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function detailText(payload: any, ...keys: string[]) {
  const details = payload?.details ?? {};
  for (const key of keys) {
    const value = String(details?.[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

function evidenceValue(insight: PusulaInsight | undefined, labels: string[]) {
  if (!insight) return '';
  const normalized = labels.map((label) => label.toLocaleLowerCase('tr-TR'));
  const hit = insight.evidence.find((item) => normalized.includes(String(item.label).toLocaleLowerCase('tr-TR')));
  return hit?.value ?? '';
}

function statusColor(value: string) {
  const normalized = value.toLocaleLowerCase('tr-TR');
  if (/yüksek|kritik|kötü|azal|geril|riskli|beklet|ertele/.test(normalized)) return { accent: RED, soft: RED_SOFT };
  if (/orta|dikkat|takip|kısmi|sinir|sınır|izle/.test(normalized)) return { accent: ORANGE, soft: ORANGE_SOFT };
  if (/iyi|düşük|dusuk|normal|sağlıklı|yeterli|dengeli|hazır/.test(normalized)) return { accent: GREEN, soft: GREEN_SOFT };
  return { accent: BLUE, soft: BLUE_SOFT };
}

function imageBitmapFrom(src: string | null | undefined) {
  if (!src) return Promise.resolve<ImageBitmap | null>(null);
  return fetch(src)
    .then((response) => response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`)))
    .then((blob) => createImageBitmap(blob))
    .catch(() => null);
}

async function drawImage(
  ctx: CanvasRenderingContext2D,
  src: string | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
  options: { cover?: boolean; radius?: number; placeholder?: string; overlay?: string } = {},
) {
  const { cover = true, radius = 12, placeholder = 'Görüntü yok', overlay } = options;
  rr(ctx, x, y, w, h, radius, '#edf1f2', LINE);
  const bitmap = await imageBitmapFrom(src);
  if (!bitmap) {
    text(ctx, placeholder, x + 18, y + h / 2, 13, 700, MUTED);
    return false;
  }

  const scale = cover
    ? Math.max(w / bitmap.width, h / bitmap.height)
    : Math.min((w - 8) / bitmap.width, (h - 8) / bitmap.height);
  const dw = bitmap.width * scale;
  const dh = bitmap.height * scale;

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, radius);
  ctx.clip();
  ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  if (overlay) {
    ctx.fillStyle = overlay;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
  bitmap.close();
  return true;
}

async function drawLayeredHero(
  ctx: CanvasRenderingContext2D,
  trueColor: string | null | undefined,
  ndvi: string | null | undefined,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  await drawImage(ctx, trueColor ?? ndvi, x, y, w, h, { radius: 15, placeholder: 'Uydu görüntüsü hazırlanıyor' });
  if (trueColor && ndvi) {
    const bitmap = await imageBitmapFrom(ndvi);
    if (bitmap) {
      const scale = Math.max(w / bitmap.width, h / bitmap.height);
      const dw = bitmap.width * scale;
      const dh = bitmap.height * scale;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x + 1, y + 1, w - 2, h - 2, 15);
      ctx.clip();
      ctx.globalAlpha = 0.48;
      ctx.drawImage(bitmap, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
      ctx.restore();
      bitmap.close();
    }
  }
}

function chart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  points: PusulaPdfSatellitePoint[],
) {
  const series = VEGETATION_INDICES.map((item) => ({
    ...item,
    points: knownSeries(points, item.key),
  }));
  const ready = series.filter((item) => item.points.length >= 2);
  if (!ready.length) {
    const latestMeasurement = series.find((item) => item.points.length)?.points.at(-1);
    text(ctx, 'Karşılaştırma için ikinci ölçüm bekleniyor', x + 10, y + 49, 12, 850, INK);
    wrap(ctx, 'Harita tarihleri mevcut olsa da yalnız sayısal ölçümü doğrulanmış tarihler grafik oluşturabilir.', x + 10, y + 77, 10, 650, MUTED, w - 20, 1.35, 4);
    if (latestMeasurement) text(ctx, `Son sayısal ölçüm: ${fmt(latestMeasurement.date, false)}`, x + 10, y + h - 15, 9.5, 750, BLUE);
    return;
  }
  const dates = [...new Set(ready.flatMap((item) => item.points.map((p) => p.date)))].sort();
  const gx = x + 24, gy = y + 20, gw = w - 41, gh = h - 55;
  ctx.strokeStyle = '#e4ebee'; ctx.lineWidth = 1;
  for (let k = 0; k < 4; k++) {
    const yy = gy + gh * k / 3;
    ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke();
  }
  for (const item of ready) {
    ctx.beginPath(); ctx.strokeStyle = item.color; ctx.lineWidth = 3;
    item.points.forEach((point, index) => {
      const px = gx + dates.indexOf(point.date) / Math.max(dates.length - 1, 1) * gw;
      const py = gy + gh - clamp(((point[item.key] as number) + 0.2) / 1.3, 0, 1) * gh;
      if (!index) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  text(ctx, fmt(dates[0], false), gx, y + h - 7, 9.5, 700, MUTED);
  ctx.textAlign = 'right';
  text(ctx, fmt(dates.at(-1), false), gx + gw, y + h - 7, 9.5, 700, MUTED);
  ctx.textAlign = 'left';
}


function progressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  value: number | null,
  accent: string,
) {
  rr(ctx, x, y, w, 10, 5, '#e8ecee', '#e8ecee');
  if (value !== null) rr(ctx, x, y, Math.max(8, w * clamp(value, 0, 100) / 100), 10, 5, accent, accent);
}

export function fieldHealthScore(snapshot: PusulaPdfSnapshot) {
  // A risk score is not a field-health score. Only accept a separately
  // calculated, dated and named health metric from the actual reporting period.
  const health = layerPayload(latestPeriodLayer(snapshot, 'field-health-score'));
  const value = metricNumber(health, 'healthScore', 'fieldHealthScore');
  return value !== null && value >= 0 && value <= 100 ? value : null;
}

function latestPeriodLayer(snapshot: PusulaPdfSnapshot, name: string) {
  return [...(snapshot.layerArchive ?? [])]
    .filter((row) => row.layer === name
      && typeof row.observedAt === 'string'
      && row.observedAt.slice(0, 10) >= snapshot.period.start
      && row.observedAt.slice(0, 10) <= snapshot.period.end)
    .sort((a, b) => String(a.observedAt).localeCompare(String(b.observedAt)))
    .at(-1) ?? null;
}

// Never assign a present-day phenological stage to a previous season.
export function phenologyLabel(snapshot: PusulaPdfSnapshot) {
  const pcse = layerPayload(latestPeriodLayer(snapshot, 'phenology-pcse-wofost'));
  const pcseStage = detailText(pcse, 'stageLabel', 'phenologyStage', 'stage');
  if (pcseStage) return {value:pcseStage, sub:'Dönem fenolojisi'};
  const irrigation = layerPayload(latestPeriodLayer(snapshot, 'irrigation-synthesis'));
  const stageFromIrrigation = String(irrigation?.metrics?.stageLabel ?? irrigation?.details?.stageLabel ?? '').trim();
  if (stageFromIrrigation) return {value:stageFromIrrigation, sub:'Kayıtlı ürün evresi'};
  return {value:'Kayıt yok', sub:'Dönem evresi eksik'};
}

export function summaryRisk(snapshot: PusulaPdfSnapshot) {
  const layer = latestPeriodLayer(snapshot, 'plant-health-synthesis');
  const payload = layerPayload(layer);
  if (!payload) return {value:'Veri yok',sub:'Dönem riski eksik'};
  const level = String(payload.metrics?.riskLevel ?? '').trim().toLowerCase();
  const title = String(payload.details?.title ?? '').toLocaleLowerCase('tr-TR');
  const riskLabel:Record<string,string> = {
    low:'Düşük',medium:'Orta',moderate:'Orta',high:'Yüksek',
    critical:'Kritik',düşük:'Düşük',orta:'Orta',yüksek:'Yüksek',kritik:'Kritik',
  };
  const translated = riskLabel[level] ?? null;
  const conflict = (['low','düşük'].includes(level) && /risk.*yüksek|yüksek.*risk|kritik/i.test(title))
    || (['high','critical','yüksek','kritik'].includes(level) && /risk.*düşük|düşük.*risk/i.test(title));
  // Contradictory headline and machine level is insufficient for a firm risk label.
  if (conflict) return {value:'Ön sinyal',sub:'Model uyuşmazlığı'};
  if (!translated) return {value:'Ön risk',sub:'Dönem kaydı'};
  const confidence=String(payload.details?.confidence ?? '').toLowerCase();
  return {value:translated,sub:confidence==='preliminary'?'Ön model riski':'Model risk kaydı'};
}

function irrigationNeed(snapshot: PusulaPdfSnapshot, guidance: ReturnType<typeof buildPusulaPdfGuidance>) {
  const synthesis = layerPayload(latestLayer(snapshot, 'irrigation-synthesis'));
  const mm = metricNumber(synthesis, 'netWaterMm', 'recommendedMm', 'irrigationMm');
  if (mm !== null) return { mm, text: `${Math.round(mm)} mm` };
  const water = guidance.insights.find((item) => item.id === 'water-scarcity-plan-evidence' || item.id === 'irrigation-synthesis-evidence');
  const evidence = evidenceValue(water, ['Sulama ihtiyacı', 'Net su', 'Öneri']);
  return { mm: null, text: evidence || 'Karar bekleniyor' };
}

function yieldSummary(snapshot: PusulaPdfSnapshot) {
  const payload = layerPayload(latestLayer(snapshot, 'yield-harvest-quality'))
    ?? layerPayload(latestLayer(snapshot, 'yield-harvest-ensemble'));
  const metrics = payload?.metrics ?? {};
  const details = payload?.details ?? {};
  const rawYield = metrics.currentYieldKgHa ?? metrics.forecastCentralKgHa;
  const kgHa = rawYield == null || rawYield === '' ? null : Number(rawYield);
  const yieldKgDa = kgHa !== null && Number.isFinite(kgHa) && kgHa > 0 ? kgHa / 10 : null;
  const quality = String(details.qualityGrade ?? metrics.qualityScore ?? '').trim();
  const rawHarvest = String(details.actualHarvestDate ?? details.expectedHarvestDate ?? details.harvestTiming?.centralDate ?? '').trim();
  const isObserved = Boolean(details.actualHarvestDate) || Boolean(details.provenance?.currentHarvestOperationIds?.length);
  const validatedModel = (Number(details.harvestTiming?.memberCount ?? 0) >= 2)
    && !['low', 'limited', 'unknown'].includes(String(details.harvestTiming?.confidence ?? '').toLowerCase())
    && details.harvestTiming?.status !== 'phenology_only';
  const reportDay = String(snapshot.period.end ?? '').slice(0, 10);
  const currentHarvest = /^\d{4}-\d{2}-\d{2}$/.test(rawHarvest)
    && (isObserved || (validatedModel && rawHarvest >= reportDay));
  // A phenology-only placeholder (e.g. cherry on 12 October) is not a harvest forecast.
  return {
    yieldKgDa,
    quality: quality || 'Ölçüm bekleniyor',
    harvest: currentHarvest ? fmt(rawHarvest, false) : 'Doğrulanmadı',
    harvestNote: currentHarvest ? (isObserved ? 'Kaydedilmiş tarih' : 'Model tahmini') : 'Saha/çeşit verisi gerekli',
  };
}

function photoDiagnosis(photo: PusulaPdfFieldPhoto | undefined) {
  const root: any = photo?.aiResult ?? {};
  const diagnosis = root?.diagnosis && typeof root.diagnosis === 'object' ? root.diagnosis : root;
  const headline = String(diagnosis?.headline ?? diagnosis?.possibleIssue ?? '').trim();
  const summary = Array.isArray(diagnosis?.observations)
    ? diagnosis.observations.map((item: unknown) => String(item)).filter(Boolean).slice(0, 2).join(' ')
    : '';
  const severity = String(diagnosis?.severity ?? '').trim();
  return { headline, summary, severity };
}

function riskItems(guidance: ReturnType<typeof buildPusulaPdfGuidance>) {
  const find = (id: string) => guidance.insights.find((item) => item.id === id);
  const entries = [
    ['Kuraklık Stresi', find('water-scarcity-plan-evidence') ?? find('irrigation-synthesis-evidence')],
    ['Hastalık Riski', find('plant-health-synthesis-evidence')],
    ['Zararlı Riski', find('multi-stress-synthesis-evidence')],
    ['Don Riski', find('frost-pocket-evidence')],
    ['Su Baskını Riski', find('disaster-recovery-evidence')],
  ] as const;
  return entries.map(([label, insight]) => {
    // Confidence is about evidence quality, NOT risk severity.
    const observed = evidenceValue(insight, ['Risk seviyesi', 'Risk düzeyi', 'Risk']);
    const riskLevel = /^(yüksek|orta|düşük|kritik)$/i.test(observed.trim()) ? observed.trim() : null;
    const status = riskLevel ?? (insight ? 'Ön değerlendirme' : 'Veri eksik');
    const description = String(insight?.meaning ?? '').trim();
    // Split at an actual sentence boundary, not at decimal dots such as 0.3.
    const firstSentence = description.split(/(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])/u)[0] ?? '';
    const detail = (firstSentence && firstSentence.length <= 165 ? firstSentence : '')
      || (insight
        ? 'Mevcut kanıtlar kesin risk düzeyi hesaplamaya yetmiyor. Saha kontrolü önerilir.'
        : 'Bu risk için doğrulanmış saha ölçümü veya yeterli model kanıtı bulunmuyor.');
    const action = String(insight?.action ?? '').trim();
    const style = riskLevel ? statusColor(riskLevel) : insight
      ? {accent:ORANGE,soft:ORANGE_SOFT}
      : {accent:MUTED,soft:GRAY_SOFT};
    return { label, detail, action, status, statusAccent: style.accent, statusSoft: style.soft };
  });
}


function latestSoilValues(snapshot: PusulaPdfSnapshot) {
  const latest: any = snapshot.soilAnalyses?.[0] ?? null;
  if (!latest) return [] as Array<{ label: string; value: number | null; text: string; accent: string }>;

  const candidates = [
    { label: 'Azot (N)', keys: ['nitrogen', 'n', 'total_n', 'nitrogen_ppm'], accent: GREEN },
    { label: 'Fosfor (P)', keys: ['phosphorus', 'p', 'phosphorus_ppm'], accent: ORANGE },
    { label: 'Potasyum (K)', keys: ['potassium', 'k', 'potassium_ppm'], accent: GREEN },
    { label: 'Organik Madde', keys: ['organic_matter', 'organicMatter', 'organic_matter_pct'], accent: GREEN },
  ];

  return candidates.map((candidate) => {
    let value: number | null = null;
    for (const key of candidate.keys) {
      const raw = latest?.[key];
      if (raw === null || raw === undefined || raw === '') continue;
      const n = Number(raw);
      if (Number.isFinite(n)) {
        value = n;
        break;
      }
    }
    const normalized = value === null ? null : value <= 1 ? value * 100 : clamp(value, 0, 100);
    return {
      label: candidate.label,
      value: normalized,
      text: value === null ? 'Veri yok' : value.toLocaleString('tr-TR', { maximumFractionDigits: 1 }),
      accent: candidate.accent,
    };
  });
}

type VegetationKey = 'ndvi' | 'ndre' | 'gndvi' | 'savi';
const VEGETATION_INDICES: Array<{ key: VegetationKey; label: string; meaning: string; color: string }> = [
  { key: 'ndvi', label: 'NDVI', meaning: 'Genel bitki canlılığı', color: GREEN },
  { key: 'ndre', label: 'NDRE', meaning: 'Klorofil duyarlılığı', color: BLUE },
  { key: 'gndvi', label: 'GNDVI', meaning: 'Yeşil doku sinyali', color: TEAL },
  { key: 'savi', label: 'SAVI', meaning: 'Toprak etkisi azaltılmış', color: ORANGE },
];

function knownSeries(points: PusulaPdfSatellitePoint[], key: VegetationKey) {
  return points.filter((point) => valid(point[key])).sort((a,b) => a.date.localeCompare(b.date));
}

type PeriodClimateBucket = {
  start:string;end:string;days:number;rainMm:number|null;et0Mm:number|null;
  meanMaxC:number|null;
};
function periodWeatherSummary(rows:any[],from:string,to:string){
  const start=Date.parse(from+'T00:00:00Z'),end=Date.parse(to+'T00:00:00Z');
  const days=Math.max(0,Math.round((end-start)/86400000)+1);
  const inPeriod=rows.filter(r=>wd(r)&&wd(r)>=from&&wd(r)<=to);
  const observedDays=new Set(inPeriod.map(r=>wd(r))).size;
  const vals=(key:string[])=>inPeriod.map(r=>wv(r,...key)).filter(valid);
  const rainy=vals(['precipitation','rain','precipitationMm']);
  const et0=vals(['et0','referenceEt0']);
  const maxTemps=vals(['tempMax','maxTemp','maxTemperature']);
  const minTemps=vals(['tempMin','minTemp','minTemperature']);
  const winds=vals(['windSpeed','windSpeedKmh','windKmh']);
  const total=(v:number[])=>v.length===days&&observedDays===days
    ? v.reduce((a,b)=>a+b,0):null;
  const totalRain=total(rainy),totalEt0=total(et0);
  const hotDays=maxTemps.length===days&&observedDays===days
    ? maxTemps.filter(v=>v>=30).length:null;
  const bucketDays=Math.max(7,Math.ceil(days/5));
  const buckets:PeriodClimateBucket[]=[];
  for(let ix=0;ix<days;ix+=bucketDays){
    const fromDate=new Date(start+ix*86400000).toISOString().slice(0,10);
    const toDate=new Date(Math.min(end,start+(ix+bucketDays-1)*86400000)).toISOString().slice(0,10);
    const period=inPeriod.filter(r=>wd(r)>=fromDate&&wd(r)<=toDate);
    const count=Math.min(bucketDays,days-ix);
    const validTotal=(keys:string[])=>{
      const v=period.map(r=>wv(r,...keys)).filter(valid);
      return v.length===count?v.reduce((a,b)=>a+b,0):null;
    };
    const temperatures=period.map(r=>wv(r,'tempMax','maxTemp','maxTemperature')).filter(valid);
    buckets.push({start:fromDate,end:toDate,days:count,
      rainMm:validTotal(['precipitation','rain','precipitationMm']),
      et0Mm:validTotal(['et0','referenceEt0']),
      meanMaxC:temperatures.length===count?temperatures.reduce((a,b)=>a+b,0)/count:null,
    });
  }
  return {days,observedDays,totalRain,totalEt0,hotDays,
    maximum:maxTemps.length?Math.max(...maxTemps):null,
    minimum:minTemps.length?Math.min(...minTemps):null,
    maximumWind:winds.length?Math.max(...winds):null,
    averageMax:maxTemps.length?maxTemps.reduce((a,b)=>a+b,0)/maxTemps.length:null,
    rainyDays:rainy.length===days?rainy.filter(v=>v>0).length:null,
    buckets};
}
const numTr=(n:number|null,decimals=1)=>n===null?'—':n.toLocaleString('tr-TR',{maximumFractionDigits:decimals});

function soilGridsProfile(snapshot: PusulaPdfSnapshot) {
  const layers = [...(snapshot.layerArchive ?? [])]
    .filter((v) => v.layer === 'soil-intelligence'
      && String(v.observedAt??v.archivedAt??'').slice(0,10)<=snapshot.period.end)
    .sort((a,b) => String(b.observedAt ?? b.archivedAt ?? '').localeCompare(String(a.observedAt ?? a.archivedAt ?? '')));
  const isHistoricalRecord=layers.length>0;
  // This later-query static model is context, NOT an observation from the
  // historical reporting period.
  if(!isHistoricalRecord && snapshot.soilReference?.metrics){
    layers.push({layer:'soil-intelligence',source:snapshot.soilReference.source,
      observedAt:snapshot.soilReference.recordedAt,metrics:snapshot.soilReference.metrics});
  }
  const read = (key: string, min: number, max: number) => {
    for (const row of layers) {
      const value = row.metrics?.[key];
      if (value == null || value === '') continue;
      const number = Number(value);
      if (Number.isFinite(number) && number >= min && number <= max) return number;
    }
    return null;
  };
  const ph = read('phTopsoil0To30', 3, 11);
  const carbon = read('organicCarbonTopsoil0To30', 0.1, 300);
  const clay = read('clayPercent', 0, 100);
  const silt = read('siltPercent', 0, 100);
  const sand = read('sandPercent', 0, 100);
  return { ph, carbon, clay, silt, sand, isHistoricalRecord,
    referenceDate:snapshot.soilReference?.recordedAt??layers[0]?.observedAt??null,
    available: [ph, carbon, clay, silt, sand].some((n) => n !== null) };
}

function numericIndexText(value: number | null | undefined) {
  return valid(value) ? value.toLocaleString('tr-TR', { minimumFractionDigits: 3, maximumFractionDigits: 3 }) : 'Ölçülmedi';
}

function englishFree(value: string) {
  return String(value)
    .replace(/\blimited\b/gi, 'Sınırlı kanıt')
    .replace(/\bunknown\b/gi, 'Bilinmiyor')
    .replace(/\bready\b/gi, 'Hazır')
    .replace(/\bblocked\b/gi, 'Engellendi')
    .replace(/\bcontext-only\b/gi, 'Ön değerlendirme');
}

type PusulaBioMetric = {key:string;title:string;unit:string;accent:string;soft:string};
const BIO_METRICS: PusulaBioMetric[] = [
  {key:'LAI',title:'Yaprak Alanı',unit:'LAI',accent:GREEN,soft:GREEN_SOFT},
  {key:'CCC',title:'Klorofil',unit:'CCC',accent:BLUE,soft:BLUE_SOFT},
  {key:'CWC',title:'Bitki Suyu',unit:'CWC',accent:TEAL,soft:GREEN_SOFT},
  {key:'fCOVER',title:'Bitki Örtüsü',unit:'%',accent:PURPLE,soft:PURPLE_SOFT},
  {key:'fAPAR',title:'Işık Kullanımı',unit:'%',accent:ORANGE,soft:ORANGE_SOFT},
  {key:'Albedo',title:'Yansıtım',unit:'Albedo',accent:BLUE,soft:BLUE_SOFT},
];
function bioValue(metric: PusulaBioMetric, value:number|null|undefined){
  if(!valid(value))return 'Ölçüm yok';
  const shown=(metric.unit==='%'?value*100:value);
  return shown.toLocaleString('tr-TR',{minimumFractionDigits:metric.unit==='%'?0:2,maximumFractionDigits:metric.unit==='%'?0:3})+(metric.unit==='%'?'%':'');
}
function qrImageUrl(target: string) {
  return `https://quickchart.io/qr?size=180&margin=1&ecLevel=M&text=${encodeURIComponent(target)}`;
}

async function drawQr(
  ctx: CanvasRenderingContext2D,
  target: string,
  x: number,
  y: number,
  size: number,
  label: string,
  platform: 'android' | 'ios',
) {
  rr(ctx, x, y, size + 72, size + 24, 12, WHITE, '#cfd9dd');
  circleIcon(ctx, x + 21, y + 22, 13, platform === 'android' ? '#34a853' : '#111111', platform === 'android' ? 'A' : 'i', WHITE, 11);
  text(ctx, platform === 'android' ? 'Android' : 'iOS', x + 41, y + 27, 11, 850, INK);
  const ok = await drawImage(ctx, qrImageUrl(target), x + size + 8, y + 7, 58, 58, { cover: false, radius: 5, placeholder: 'QR' });
  if (!ok) {
    rr(ctx, x + size + 8, y + 7, 58, 58, 5, GRAY_SOFT, LINE);
    text(ctx, 'QR', x + size + 27, y + 42, 13, 900, MUTED);
  }
  text(ctx, label, x + 12, y + size + 12, 9, 850, MUTED);
}


function footerSocial(ctx: CanvasRenderingContext2D, x: number, y: number, symbol: string, fill: string, label: string, value: string) {
  circleIcon(ctx, x + 17, y + 15, 14, fill, symbol, WHITE, 11);
  text(ctx, label, x + 38, y + 9, 9.5, 800, MUTED);
  text(ctx, value, x + 38, y + 26, 11, 850, INK);
}

export async function generatePusulaPdf(snapshot: PusulaPdfSnapshot) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const { canvas, ctx } = makeCanvas();
  const guidance = buildPusulaPdfGuidance(snapshot);
  const narrative=snapshot.aiNarrative;
  const sat = [...snapshot.satellite.points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sat.at(-1);
  const historicalWeather: any[] = Array.isArray((snapshot.weather as any)?.history) ? (snapshot.weather as any).history : [];
  const allWeather = historicalWeather.filter((row) => wd(row) && wd(row) <= snapshot.period.end).sort((a,b) => wd(a).localeCompare(wd(b)));
  // Weather history is NOT a future forecast. Report the most recent recorded days.
  const weather = allWeather.filter((row) => wd(row) >= snapshot.period.start);
  const climate=periodWeatherSummary(weather,snapshot.period.start,snapshot.period.end);
  const isHistoricalReport=snapshot.period.end<new Date(Date.now()-7*86400000).toISOString().slice(0,10);
  const hasSatelliteMeasurements=sat.some(p=>VEGETATION_INDICES.some(i=>valid(p[i.key])));
  const hasBiophysics=(snapshot.biophysical??[]).some(p=>
    p.date&&p.date>=snapshot.period.start&&p.date<=snapshot.period.end
    &&Object.values(p.metrics??{}).some(valid));
  const photos = [...(snapshot.fieldPhotos ?? [])].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const latestPhoto = photos[0];
  const diagnosis = photoDiagnosis(latestPhoto);
  const ndmiCmp = periodCompare(sat, 'ndmi');
  const need = irrigationNeed(snapshot, guidance);
  const yieldInfo = yieldSummary(snapshot);
  const riskRows = riskItems(guidance);
  const soilRows = latestSoilValues(snapshot);
  const soilGrids = soilGridsProfile(snapshot);
  const location = [snapshot.field.city, snapshot.field.district].filter(Boolean).join(' / ') || 'Konum kaydı yok';

  // Print-safe header: a fixed, subtle topographic motif, with protected
  // logo and metadata zones. Draw decoration before any text.
  rr(ctx, 12, 12, 1216, 94, 15, '#f4f9f8', LINE);
  ctx.save();
  ctx.beginPath();ctx.roundRect(12,12,1216,94,15);ctx.clip();
  ctx.strokeStyle='rgba(29,116,88,.10)';ctx.lineWidth=1.5;
  for(let n=0;n<11;n++){
    const offset=n*26;
    ctx.beginPath();ctx.moveTo(310+offset,12);
    ctx.bezierCurveTo(390+offset,35,350+offset,88,480+offset,108);ctx.stroke();
  }
  ctx.restore();
  rr(ctx, 25, 21, 319, 76, 11, 'rgba(255,255,255,.86)', '');
  rr(ctx, 355, 21, 311, 76, 11, 'rgba(255,255,255,.78)', '');
  rr(ctx, 674, 21, 539, 76, 11, 'rgba(255,255,255,.85)', '');
  await logo(ctx, 50, 59);
  fittedText(ctx, 'Dönemsel Tarla Analizi', 372, 48, 280, 19, 900, INK);
  text(ctx, 'Daha verimli, daha bilinçli, daha güçlü tarım için.', 372, 72, 10.5, 650, MUTED);

  const headerMeta = [
    ['Rapor Tarihi', fmt(snapshot.period.end)],
    ['Tarla Adı', snapshot.field.name],
    ['Ürün', snapshot.field.crop ?? 'Kayıt yok'],
    ['Tarla Büyüklüğü', snapshot.field.areaDecare == null ? '—' : `${snapshot.field.areaDecare.toLocaleString('tr-TR')} da`],
  ];
  let hx = 684;
  headerMeta.forEach(([label, value], index) => {
    if (index) {
      ctx.strokeStyle = '#e4eaec';
      ctx.beginPath();
      ctx.moveTo(hx - 10, 29);
      ctx.lineTo(hx - 10, 89);
      ctx.stroke();
    }
    text(ctx, label, hx, 44, 8.5, 800, MUTED);
    wrap(ctx, value, hx, 65, 10, 850, INK, 120, 1.12, 2);
    hx += index === 0 ? 136 : 130;
  });

  const top = 118;
  const leftX = 12;
  const leftW = 410;
  const midX = 432;
  const midW = 390;
  const rightX = 832;
  const rightW = 396;

  // LEFT COLUMN — premium hero
  rr(ctx, leftX, top, leftW, 532, 15, WHITE, LINE);
  fittedText(ctx, 'Tarla Sağlık ve Karar Özeti', leftX + 16, top + 38, leftW-32, 25, 900, INK);
  wrap(ctx, 'Uydu verileri, hava durumu, toprak analizi ve Pusula karar motorlarıyla hazırlanmış premium tarla özeti.', leftX + 16, top + 67, 11.5, 600, MUTED, leftW - 32, 1.28, 3);
  await drawLayeredHero(ctx, latest?.trueColorImage, latest?.ndviImage, leftX + 8, top + 112, leftW - 16, 272);

  const gradient = ctx.createLinearGradient(leftX + 8, top + 267, leftX + 8, top + 384);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(leftX + 8, top + 112, leftW - 16, 272, 15);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(leftX + 8, top + 112, leftW - 16, 272);
  ctx.restore();

  rr(ctx, leftX + 22, top + 284, 196, 87, 11, 'rgba(5,20,22,.82)', 'rgba(255,255,255,.18)');
  circleIcon(ctx, leftX + 43, top + 302, 11, ORANGE, '●', WHITE, 7);
  fittedText(ctx, snapshot.field.name, leftX + 62, top + 307, 140, 14, 900, WHITE);
  fittedText(ctx, snapshot.field.areaDecare == null ? 'Alan —' : `${snapshot.field.areaDecare.toLocaleString('tr-TR')} da`, leftX + 39, top + 328, 170, 10, 750, WHITE);
  fittedText(ctx, snapshot.field.crop ?? 'Ürün kaydı yok', leftX + 39, top + 348, 170, 10, 750, WHITE);
  fittedText(ctx, location, leftX + 39, top + 365, 170, 9.5, 700, '#dbe7e7');

  const statY = top + 399;
  const lastNdmi = [...sat].filter((p) => valid(p.ndmi)).at(-1);
  const ndmiValue = lastNdmi?.ndmi ?? null;
  // The cover identifies the REPORT'S FOCUS, not a second copy of its metrics.
  // All numbers live only in their dedicated evidence sections below.
  rr(ctx,leftX+8,statY,leftW-16,104,12,'#f3f8f5',LINE);
  fittedText(ctx,'BU RAPORUN ODAĞI',leftX+20,statY+24,leftW-40,9,850,GREEN_DARK);
  const focus=hasSatelliteMeasurements
    ? 'Uydu indeksleri, saha ve toprak kanıtları dönem tarihleriyle karşılaştırılır.'
    : 'Bu tarih aralığında değerlendirme arşiv kayıtları, model referansı ve kayıtlı saha kanıtlarıyla sınırlıdır.';
  wrap(ctx,focus,leftX+20,statY+48,12,750,INK,leftW-40,1.35,3);

  rr(ctx, leftX, 660, leftW, 244, 15, WHITE, LINE);
  text(ctx, hasSatelliteMeasurements?'Uydu Geçmişi ve Karşılaştırma':'Uydu Arşivi ve Ölçüm Kapsamı', leftX + 16, 691, 17, 900, INK);
  const numericDates = [...new Set(sat.filter((p) => VEGETATION_INDICES.some((v) => valid(p[v.key]))).map((p) => p.date))];
  text(ctx, `${numericDates.length} geçerli indeks tarihi · ${sat.length} sahne/kontrol tarihi`,
    leftX + 16, 712, 10, 750, MUTED);
  if(hasSatelliteMeasurements){
    chart(ctx, leftX + 14, 717, leftW - 28, 151, sat);
  }else{
    rr(ctx,leftX+14,731,leftW-28,145,10,'#f3f8fa',LINE);
    const sceneDates=[...new Set(sat.map(p=>p.date))].sort();
    if(sceneDates.length){
      fittedText(ctx,`Kontrol edilen dönem: ${fmt(sceneDates[0],false)} – ${fmt(sceneDates.at(-1)!,false)}`,
        leftX+28,754,leftW-56,10.2,800,INK);
      sceneDates.slice(0,14).forEach((_,i)=>{
        const x=leftX+28+i*24;
        ctx.beginPath();ctx.fillStyle='#9fadb4';ctx.arc(x,785,4,0,Math.PI*2);ctx.fill();
      });
      wrap(ctx,'Uydu sahne tarihleri mevcut; bu döneme ait parsel ortalaması sayısal olarak arşivlenmemiş. Görüntü sayısı ölçüm değildir.',
        leftX+28,816,10.8,750,INK,leftW-57,1.25,3);
    }else{
      wrap(ctx,'Seçilen tarihler için kaydedilmiş uydu sahnesi yok. Hava geçmişi varsa rapor onunla hazırlanır.',
        leftX+28,779,11.5,750,INK,leftW-56,1.28,3);
    }
  }
  text(ctx, hasSatelliteMeasurements?'NDVI • NDRE • GNDVI • SAVI':'İndeksler: sayısal parsel ölçümü gerekli',
    leftX + 16, 891, 9.8, 800, GREEN_DARK);

  rr(ctx, leftX, 914, leftW, 230, 15, PURPLE_SOFT, '#e4d6fb');
  circleIcon(ctx, leftX + 34, 945, 18, PURPLE, '✦', WHITE, 14);
  text(ctx, "Pusula'nın Yorumu", leftX + 62, 951, 18, 900, PURPLE);
  // Data-grounded narrative fallback if the AI provider has no response.
  // Numeric change in NDVI alone does not prove disease, yield or irrigation.
  const ndviSeries=knownSeries(sat,'ndvi');
  let ndviNote='Bu dönemde tarihli NDVI ölçümü yok; güvenilir değişim yorumu yapılamaz.';
  if(ndviSeries.length===1){
    const one=ndviSeries[0];
    ndviNote=`Tek NDVI ölçümü ${fmt(one.date,false)} tarihinde ${numericIndexText(one.ndvi)}. Eğilim için ikinci gerçek ölçüm gerekir.`;
  }else if(ndviSeries.length>=2){
    const last=ndviSeries.at(-1)!;
    const prev=ndviSeries.at(-2)!;
    const delta=Number(last.ndvi)-Number(prev.ndvi);
    const signal=Math.abs(delta)<.015?'belirgin bir farklılık göstermiyor'
      :delta>0?'artış gösteriyor':'azalış gösteriyor';
    ndviNote=`NDVI ${fmt(prev.date,false)} tarihinde ${numericIndexText(prev.ndvi)}, ${fmt(last.date,false)} tarihinde ${numericIndexText(last.ndvi)}: ${signal}. Tek başına hastalık, su stresi veya verim kanıtı değildir.`;
  }
  const summary=!hasSatelliteMeasurements
    ? 'Bu geçmiş dönemde yalnızca doğrulanmış kaynakların desteklediği çıkarımlar yapılabilir. İklim koşullarının bağın gelişimine etkisi, saha gözlemleri ve sulama kayıtları olmadan kesinleştirilemez.'
    : (narrative?.summary||guidance.weeklySummary)+' '+ndviNote;
  wrap(ctx,summary,leftX+20,985,11,650,INK,leftW-40,1.3,6);
  const action=!hasSatelliteMeasurements
    ? 'Gerçek sulama ve saha işlem tarihlerini kaydederek geriye dönük değerlendirmeyi güçlendir.'
    : guidance.next7Days[0]??'Yeni veri geldikçe tarlanın durumunu tekrar değerlendir.';
  rr(ctx, leftX + 18, 1080, leftW - 36, 48, 9, WHITE, '#e6dcf7');
  text(ctx,isHistoricalReport?'DÖNEM':'7 GÜN',leftX+30,1102,8.5,900,PURPLE);
  wrap(ctx, action, leftX + 76, 1098, 10, 750, INK, leftW - 112, 1.15, 2);

  if(hasBiophysics){
  // Plant measurements from the actual field SL2P archive (never mock values).
  rr(ctx, leftX, 1154, leftW, 436, 15, '#f9fbfa', LINE);
  text(ctx, 'Uydu Bitki Ölçümleri', leftX + 18, 1190, 18, 900, INK);
  const bio = (snapshot.biophysical??[]).find(row=>
    row.date && row.date>=snapshot.period.start && row.date<=snapshot.period.end);
  const bioQuality=String(bio?.qc?.quality??'unknown').toLowerCase();
  const bioProof=bio
    ? ('SL2P · '+fmt(bio.date,false)+' · '+(bioQuality==='high'?'Yüksek kalite':bioQuality==='medium'?'Orta kalite':'Düşük güven, yalnız ön inceleme'))
    : 'Bu dönemde ölçüm arşivi yok; farklı tarihlerden değer taşınmadı.';
  text(ctx, bioProof, leftX + 18, 1212, 9.5, 750, MUTED);
  BIO_METRICS.forEach((item,index)=>{
    const col=index%3,row=Math.floor(index/3);
    const x=leftX+15+col*129, y=1227+row*112;
    rr(ctx,x,y,119,101,10,item.soft,LINE);
    fittedText(ctx,item.title,x+9,y+22,101,10.3,800,INK);
    const number=bio?.metrics?.[item.key];
    fittedText(ctx,bioValue(item,number),x+9,y+55,102,number==null?11:18,900,item.accent);
    text(ctx,item.unit==='%'?'Model yüzdesi':item.unit,x+9,y+80,8.6,700,MUTED);
  });
  rr(ctx,leftX+15,1458,leftW-30,111,11,WHITE,LINE);
  text(ctx,'Pusula’nın Bitki Yorumu',leftX+27,1480,12,900,GREEN_DARK);
  const bioNote=(narrative?.plant && narrative.plant.length<=240)
    ? narrative.plant
    : bio
      ? ('Yaprak alanı ve bitki örtüsü SL2P uydu tahminidir; '+(bioQuality==='low'
        ? 'piksel kalitesi düşük olduğu için kesin bir tarla teşhisi sayılmaz.'
        : 'saha gözlemi ve çok tarihli ölçümlerle birlikte değerlendirilmelidir.'))
      : 'Seçilen dönemde uygun SL2P sayısal ölçümü bulunmuyor. Görüntü olması tek başına güvenilir klorofil veya su ölçümü anlamına gelmez.';
  wrap(ctx,bioNote,leftX+27,1503,11,650,INK,leftW-55,1.33,4);
  text(ctx,'Kaynak: Sentinel-2 · SL2P / arşiv · tarla özelinde',leftX+27,1552,9.2,750,MUTED);


  }else{
    // No repeated weather chart here: climate metrics have ONE home below.
    // This entire panel is a practical record-keeping plan instead.
    rr(ctx,leftX,1154,leftW,436,15,'#f5f9f7',LINE);
    text(ctx,'Tarla Takip ve Kayıt Planı',leftX+18,1190,18,900,INK);
    wrap(ctx,'Eksik ölçümleri uydurmak yerine gelecek dönemlerde daha güçlü tarla değerlendirmesi sağlayan kayıt adımları.',
      leftX+18,1214,10.1,700,MUTED,leftW-36,1.23,3);
    const checks=[
      ['Tarihli saha gözlemi','Yaprak, sürgün ve meyvedeki belirtileri konum ve tarih ile kaydet.'],
      ['Sulama günlüğü','Uygulanan su miktarını, yöntemi ve sulama gününü not et.'],
      ['Toprak laboratuvar testi','pH ve besin kararlarını güvenilir parsel örnekleriyle doğrula.'],
      ['Hasat ve kalite defteri','Gerçek hasat tarihi, miktarı ve kaliteyi sonraki yıl için sakla.'],
    ];
    checks.forEach(([title,detail],i)=>{
      const yy=1260+i*71;
      rr(ctx,leftX+15,yy,leftW-30,64,10,i%2===0?WHITE:'#e9f3ee',LINE);
      circleIcon(ctx,leftX+34,yy+23,12,GREEN,i+1+'',WHITE,10);
      fittedText(ctx,title,leftX+54,yy+24,leftW-78,12,850,INK);
      wrap(ctx,detail,leftX+54,yy+44,9.5,670,MUTED,leftW-80,1.14,2);
    });
    text(ctx,'Not: Bunlar hesaplanmış ölçüm değil, kayıt önerileridir.',leftX+19,1568,9,750,GREEN_DARK);
  }


  // MIDDLE COLUMN
  rr(ctx, midX, top, midW, 384, 15, WHITE, LINE);
  sectionHeader(ctx,midX+10,top+8,1,
    hasSatelliteMeasurements?'Bitki Sağlığı ve Gelişim Analizi':'Uydu Katmanları Ne Anlatır?',GREEN,'↑');
  text(ctx, 'Gerçek sayısal ölçümler · tarih ve kaynak doğrulaması', midX + 18, top + 55, 9.5, 700, MUTED);
  if(hasSatelliteMeasurements){
  const vegCardW = 86;
  VEGETATION_INDICES.forEach((item, index) => {
    const x = midX + 17 + index * 93;
    const series = knownSeries(sat, item.key);
    const value = series.at(-1)?.[item.key] ?? null;
    rr(ctx, x, top + 69, vegCardW, 91, 10, index % 2 === 0 ? GREEN_SOFT : BLUE_SOFT, LINE);
    text(ctx, item.label, x + 9, top + 91, 11, 900, item.color);
    text(ctx, numericIndexText(value), x + 9, top + 117, valid(value) ? 16 : 10, 900, INK);
    text(ctx, series.length ? fmt(series.at(-1)?.date, false) : 'Kaynak yok', x + 9, top + 142, 9, 650, MUTED);
  });
  // Multi-index trend: each line uses its own real observations; never interpolate empty dates.
  chart(ctx, midX + 18, top + 169, midW - 36, 130, sat);
  VEGETATION_INDICES.forEach((item, index) => {
    const col = index % 2, row = Math.floor(index / 2);
    const x = midX + 19 + col * 185;
    const yy = top + 316 + row * 29;
    rr(ctx, x, yy - 11, 174, 27, 7, index % 2 === 0 ? GREEN_SOFT : BLUE_SOFT, '');
    text(ctx, item.label, x + 7, yy + 2, 9, 900, item.color);
    text(ctx, item.meaning, x + 52, yy + 2, 8.5, 650, INK);
  });

  const unmeasuredIndices=VEGETATION_INDICES.filter(item=>knownSeries(sat,item.key).length===0);
  if(unmeasuredIndices.length){
    fittedText(ctx,`Sayısal veri yok: ${unmeasuredIndices.map(item=>item.label).join(', ')} · uygun parsel ölçümü gerekli.`,
      midX+17,top+375,midW-34,9,750,MUTED);
  }

  }else{
    // This is a reading guide, not a second rendering of satellite coverage.
    const meanings=[
      ['NDVI','Yeşil bitki örtüsünün canlılık göstergesi',GREEN,GREEN_SOFT],
      ['NDRE','Klorofil değişimini takip etmeye yardımcı',BLUE,BLUE_SOFT],
      ['GNDVI','Yeşil doku ve ışık tepkisine duyarlı',TEAL,GREEN_SOFT],
      ['SAVI','Seyrek örtüde çıplak toprağın etkisini azaltır',ORANGE,ORANGE_SOFT],
    ];
    meanings.forEach(([label,meaning,accent,soft],i)=>{
      const yy=top+77+i*70;
      rr(ctx,midX+17,yy,midW-34,62,11,soft,LINE);
      fittedText(ctx,label,midX+31,yy+24,74,13,900,accent);
      wrap(ctx,meaning,midX+111,yy+20,10.8,700,INK,midW-150,1.18,2);
    });
    fittedText(ctx,'Bu katmanların gerçek sonuçları yalnız tarihli parsel ölçümü varsa gösterilir.',
      midX+17,top+372,midW-34,9.4,750,MUTED);
  }

  const hasIrrigationEvidence=ndmiValue!==null||need.mm!==null;
  rr(ctx,midX,512,midW,204,15,hasIrrigationEvidence?WHITE:'#f4f9ff',LINE);
  sectionHeader(ctx,midX+10,520,2,
    hasIrrigationEvidence?'Su ve Sulama Analizi':'Sulama Kararının Sınırları',BLUE,'●');
  if(hasIrrigationEvidence){
    const waterCards=[
      {title:'NDMI (bitki nem)',main:numericIndexText(ndmiValue),sub:'Toprak nem sensörü değil',accent:BLUE},
      {title:'Sulama İhtiyacı',main:need.mm===null?'—':numTr(need.mm)+' mm',sub:need.mm===null?'Model kanıtı eksik':'Kayıtlı model kararı',accent:BLUE},
      {title:'Nem Eğilimi',main:valid(ndmiCmp.pct)?(ndmiCmp.pct < -5?'Azalıyor':ndmiCmp.pct>5?'Artıyor':'Dengeli'):'—',
       sub:valid(ndmiCmp.pct)?'Dönem NDMI kıyası':'İki ölçüm gerekli',accent:GREEN},
    ];
    waterCards.forEach((card,index)=>{
      const x=midX+14+index*124;
      rr(ctx,x,566,116,132,10,index===0?BLUE_SOFT:index===1?'#f3f8ff':GREEN_SOFT,LINE);
      ctx.textAlign='center';
      fittedText(ctx,card.title,x+58,589,104,8.5,750,MUTED);
      fittedText(ctx,card.main,x+58,635,101,14,900,card.accent);
      ctx.textAlign='left';
      wrap(ctx,card.sub,x+9,664,9,750,MUTED,98,1.2,3);
    });
  }else{
    rr(ctx,midX+16,567,midW-32,129,11,WHITE,LINE);
    text(ctx,'Kesin sulama miktarı hesaplanmadı.',midX+28,594,13,900,INK);
    wrap(ctx,'Bu dönemde geçerli NDMI ve sulama modeli bulunmadığından hava toplamları su ihtiyacı olarak yeniden gösterilmez.',
      midX+28,620,10.6,700,MUTED,midW-60,1.22,3);
    fittedText(ctx,'Karar için: ürün evresi + toprak nemi + sulama kaydı',
      midX+28,679,midW-60,10,850,BLUE);
  }

  rr(ctx, midX, 726, midW, 210, 15, '#fffaf4', LINE);
  sectionHeader(ctx, midX + 10, 734, 3, 'Toprak ve Besin Analizi', '#a74627', '●');
  // Laboratory samples remain authoritative; SoilGrids is explicitly a 250m model estimate.
  if (soilRows.length && soilRows.some((row) => row.value !== null)) {
    soilRows.forEach((row, index) => {
      const yy = 782 + index * 33;
      text(ctx, row.label, midX + 18, yy, 9.5, 750, INK);
      progressBar(ctx, midX + 101, yy - 10, 110, row.value, row.accent);
      text(ctx, row.text, midX + 221, yy, 9, 850, row.value === null ? MUTED : row.accent);
    });
  } else if (soilGrids.available) {
    fittedText(ctx,soilGrids.isHistoricalRecord
      ? 'SoilGrids · 0–30 cm · 250 m model'
      : 'SoilGrids · sonradan alınan model referansı',midX+18,782,235,9.8,900,GREEN_DARK);
    const soilMetrics = [
      ['pH', soilGrids.ph === null ? '—' : soilGrids.ph.toLocaleString('tr-TR', { maximumFractionDigits: 1 })],
      ['Organik C', soilGrids.carbon === null ? '—' : `${soilGrids.carbon.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} g/kg`],
      ['Kil / kum / silt', [soilGrids.clay,soilGrids.sand,soilGrids.silt].every(valid)
        ? `${Math.round(soilGrids.clay!)} / ${Math.round(soilGrids.sand!)} / ${Math.round(soilGrids.silt!)} %` : '—'],
    ];
    soilMetrics.forEach(([label, value], index) => {
      const yy = 815 + index * 31;
      text(ctx, label, midX + 18, yy, 10, 700, MUTED);
      text(ctx, value, midX + 106, yy, 10, 900, INK);
    });
    wrap(ctx,'Laboratuvar değildir. Sonradan sorgulandıysa geçmiş Haziran ölçümü sayılmaz; gübre dozu çıkarılmaz.',
      midX+18,914,8.5,700,MUTED,234,1.16,2);
  } else {
    text(ctx, 'Toprak model ölçümü bekleniyor', midX + 18, 809, 10, 850, MUTED);
    wrap(ctx, 'Uygun veri gelmeden besin miktarı ve pH tahmini yapılmaz.',
      midX + 18, 841, 9.5, 650, MUTED, 232, 1.25, 3);
  }
  rr(ctx, midX + 260, 784, 112, 130, 9, ORANGE_SOFT, '#f4dfba');
  text(ctx, 'Toprak Kararı', midX + 272, 806, 10, 900, INK);
  wrap(ctx, soilGrids.available
    ? 'SoilGrids yalnız bölgesel referanstır. Parsel gübreleme planı için laboratuvar analizi ekle.'
    : 'Doğrulanmış ölçüm olmadan besin dozu önerilmez.',
    midX + 272, 831, 9.5, 650, MUTED, 90, 1.25, 7);

  rr(ctx,midX,946,midW,250,15,'#f5faff',LINE);
  sectionHeader(ctx,midX+10,954,4,'Dönemin Hava ve İklimi',BLUE,'●');
  fittedText(ctx,`${fmt(snapshot.period.start,false)} – ${fmt(snapshot.period.end,false)} · ${climate.observedDays}/${climate.days} gün`,
    midX+17,993,midW-34,10,750,MUTED);
  const monthlyMetrics=[
    ['Toplam yağış',climate.totalRain===null?'Veri eksik':numTr(climate.totalRain)+' mm',BLUE,BLUE_SOFT],
    ['Referans ET₀',climate.totalEt0===null?'Veri eksik':numTr(climate.totalEt0)+' mm',TEAL,GREEN_SOFT],
    ['30°C+ gün',climate.hotDays===null?'Veri eksik':String(climate.hotDays)+' gün',ORANGE,ORANGE_SOFT],
    ['En yüksek',climate.maximum===null?'—':numTr(climate.maximum)+'°C',ORANGE,ORANGE_SOFT],
    ['En düşük',climate.minimum===null?'—':numTr(climate.minimum)+'°C',BLUE,BLUE_SOFT],
    ['Yağışlı gün',climate.rainyDays===null?'—':String(climate.rainyDays)+' gün',GREEN,GREEN_SOFT],
  ] as const;
  monthlyMetrics.forEach(([label,value,accent,soft],i)=>{
    const col=i%3,row=Math.floor(i/3);
    const x=midX+13+col*124,y=1004+row*72;
    rr(ctx,x,y,116,63,9,soft,LINE);
    fittedText(ctx,label,x+8,y+21,100,9,750,MUTED);
    fittedText(ctx,value,x+8,y+47,100,15,900,accent);
  });
  const weatherSource=String((snapshot.weather as any)?.source??'Kayıtlı hava ölçümleri').trim();
  wrap(ctx,`Kaynak: ${weatherSource} · Dönem toplamlarıdır; hava tahmini değildir. ET₀ tek başına sulama ihtiyacı değildir.`,
    midX+17,1167,9.1,700,MUTED,midW-34,1.15,2);

  rr(ctx, midX, 1206, midW, 384, 15, WHITE, LINE);
  sectionHeader(ctx, midX + 10, 1214, 5, latestPhoto?'Saha Gözlemleri':'Saha Kayıtlarının Kapsamı', PURPLE, '▣');
  if (latestPhoto?.signedUrl) {
    await drawImage(ctx, latestPhoto.signedUrl, midX + 16, 1260, 174, 195, { radius: 9, placeholder: 'Fotoğraf açılamadı' });
    rr(ctx, midX + 200, 1260, 174, 195, 9, '#f8fafb', LINE);
    text(ctx, 'Son saha kaydı', midX + 212, 1294, 13, 900, INK);
    text(ctx, fmt(latestPhoto.capturedAt, false), midX + 212, 1320, 11, 750, MUTED);
    wrap(ctx, englishFree(diagnosis.headline || diagnosis.summary || latestPhoto.notes || 'Fotoğraf yüklenmiş, teşhis kaydı henüz yok.'),
      midX + 212, 1360, 10.5, 650, INK, 150, 1.3, 6);
  } else {
    rr(ctx,midX+16,1260,358,195,10,'#f5f8fb',LINE);
    const fieldEvidence=[
      ['Tarla işlem kaydı',String(snapshot.activities?.length??0)+' kayıt'],
      ['Laboratuvar analizi',String(snapshot.soilAnalyses?.length??0)+' kayıt'],
      ['Sulama/Kc geçmişi',String(snapshot.irrigation?.kcSnapshots?.length??0)+' kayıt'],
      ['Saha fotoğrafı','Bu dönemde yok'],
    ];
    fieldEvidence.forEach(([name,value],i)=>{
      const yy=1283+i*41;
      if(i>0){ctx.beginPath();ctx.strokeStyle='#dce5ed';ctx.moveTo(midX+30,yy-14);ctx.lineTo(midX+362,yy-14);ctx.stroke();}
      fittedText(ctx,name,midX+29,yy,184,10.5,800,INK);
      ctx.textAlign='right';
      fittedText(ctx,value,midX+354,yy,135,10.2,850,i===3?ORANGE:BLUE);
      ctx.textAlign='left';
    });
    }
  text(ctx,latestPhoto?'Saha gözlemi arşivi':'Saha kanıtı eksikliği',midX+16,1478,10,850,INK);
  const observationText = latestPhoto
    ? (diagnosis.summary || diagnosis.headline || latestPhoto.notes || 'Gözlem kaydı mevcut; kesin teşhis için ek kanıt gerekebilir.')
    : 'Bu dönem saha fotoğrafı veya doğrulanmış yerinde teşhis bulunmuyor. Hastalık ve zararlı sonuçları bu nedenle kesinleştirilemez.';
  rr(ctx, midX + 16, 1509, 358, 65, 9, PURPLE_SOFT, '#eadfff');
  wrap(ctx, englishFree(observationText), midX + 28, 1535, 10, 650, INK, 333, 1.22, 3);

  // RIGHT COLUMN
  const hasPeriodRiskEvidence=!!latestPeriodLayer(snapshot,'plant-health-synthesis');
  rr(ctx,rightX,top,rightW,476,15,hasPeriodRiskEvidence?'#fffafa':'#f6fbff',LINE);
  sectionHeader(ctx,rightX+10,top+8,6,
    hasPeriodRiskEvidence?'Risk ve Öneri Analizi':'İklim Koşulları ve Kanıt Sınırları',
    hasPeriodRiskEvidence?RED:BLUE,'!');
  if(hasPeriodRiskEvidence){
    riskRows.forEach((row,index)=>{
      const yy=top+64+index*78;
      rr(ctx,rightX+12,yy-12,rightW-24,74,10,index%2===0?WHITE:'#f1f5f9',LINE);
      circleIcon(ctx,rightX+34,yy+15,12,row.statusSoft,'●',row.statusAccent,8);
      fittedText(ctx,row.label,rightX+56,yy+18,180,12,900,INK);
      const pillW=95;
      rr(ctx,rightX+rightW-pillW-13,yy-3,pillW,26,12,row.statusSoft,row.statusSoft);
      ctx.textAlign='center';
      fittedText(ctx,row.status,rightX+rightW-pillW/2-13,yy+14,pillW-8,9,850,row.statusAccent);
      ctx.textAlign='left';
      wrap(ctx,englishFree(row.detail),rightX+20,yy+39,10,650,MUTED,rightW-39,1.17,2);
    });
  }else{
    // Distinct evidence requirements, no duplicate climate measurements.
    const requirements=[
      ['Kuraklık stresi','Toprak nemi, ürün evresi ve kaydedilmiş sulama bilgisi gerekir.'],
      ['Hastalık değerlendirmesi','Yaprak ıslaklığı, görüntü ve saha belirtileri gerekir.'],
      ['Zararlı değerlendirmesi','Saha sayımı, tuzak ve tarihli zarar belirtisi gerekir.'],
      ['Don hasarı','Bitkinin o tarihteki evresi ve sahadaki hasar gözlemi gerekir.'],
      ['Su baskını','Parsel drenajı, topografya ve yerinde su birikimi kanıtı gerekir.'],
    ];
    rr(ctx,rightX+15,top+52,rightW-30,51,10,WHITE,LINE);
    wrap(ctx,'Geçmiş hava gözlemleri tek başına hastalık, zararlı veya hasar teşhisi oluşturmaz.',
      rightX+28,top+72,10.5,750,INK,rightW-54,1.15,2);
    requirements.forEach(([label,detail],i)=>{
      const yy=top+115+i*67;
      rr(ctx,rightX+14,yy,rightW-28,60,10,i%2===0?WHITE:'#eaf4fa',LINE);
      fittedText(ctx,label,rightX+26,yy+21,rightW-52,11.3,850,INK);
      wrap(ctx,detail,rightX+26,yy+39,9.8,650,MUTED,rightW-51,1.18,2);
    });
  }


  const hasYieldEstimate=yieldInfo.yieldKgDa!==null||
    (yieldInfo.quality!=='Ölçüm bekleniyor'&&yieldInfo.quality!=='')||
    yieldInfo.harvest!=='Doğrulanmadı';
  rr(ctx,rightX,604,rightW,216,15,hasYieldEstimate?WHITE:'#fffaf4',LINE);
  sectionHeader(ctx,rightX+10,612,7,
    hasYieldEstimate?'Verim, Hasat ve Kalite':'Verim ve Hasat · Kanıt Durumu',ORANGE,'↑');
  if(hasYieldEstimate){
    const yieldCards=[
      ['Tahmini Verim',yieldInfo.yieldKgDa===null?'—':String(Math.round(yieldInfo.yieldKgDa)),
        yieldInfo.yieldKgDa===null?'Model hesabı yok':'kg/da',ORANGE],
      ['Kalite',yieldInfo.quality==='Ölçüm bekleniyor'?'—':yieldInfo.quality,
        'Kayıtlı değerlendirme',GREEN],
      ['Hasat Zamanı',yieldInfo.harvest,yieldInfo.harvestNote,PURPLE],
    ];
    yieldCards.forEach(([titleValue,value,sub,accent],index)=>{
      const x=rightX+14+index*124;
      rr(ctx,x,655,116,145,10,index===0?ORANGE_SOFT:index===1?GREEN_SOFT:PURPLE_SOFT,LINE);
      ctx.textAlign='center';
      fittedText(ctx,titleValue,x+58,680,103,9.5,800,MUTED);
      fittedText(ctx,value,x+58,727,102,String(value).length<=11?17:11,900,accent);
      ctx.textAlign='left';
      wrap(ctx,sub,x+10,758,9,750,MUTED,95,1.2,3);
    });
  }else{
    rr(ctx,rightX+14,653,rightW-28,146,11,WHITE,LINE);
    text(ctx,'Hasat tahmini üretilmedi',rightX+27,681,14,900,INK);
    wrap(ctx,'Tarihi kesin hasat miktarı, ürün gelişim evresi ve kalite kayıtları bulunmadan verim veya hasat günü hesaplanmaz.',
      rightX+27,712,11,700,MUTED,rightW-56,1.25,4);
    fittedText(ctx,'Eksik tahmini bir değere dönüştürmedik.',
      rightX+27,784,rightW-56,10.3,850,ORANGE);
  }

  rr(ctx, rightX, 830, rightW, 330, 15, '#fbf8ff', LINE);
  sectionHeader(ctx,rightX+10,838,8,latestPhoto?'Kritik Gözlem':'Dönem Sonu Değerlendirmesi',PURPLE,'!');
  rr(ctx, rightX + 16, 884, rightW - 32, 224, 12,
    latestPhoto?.signedUrl ? PURPLE_SOFT : GRAY_SOFT, LINE);
  circleIcon(ctx, rightX + 45, 920, 16, latestPhoto ? PURPLE : BLUE, '!', WHITE, 12);
  fittedText(ctx,latestPhoto?'Doğrulanacak saha bulgusu':'Geçmiş veriye dayalı yorum',
    rightX+75,926,rightW-98,16,900,INK);
  const criticalText = latestPhoto
    ? (diagnosis.headline || diagnosis.summary || 'Fotoğraftaki belirtiler saha gözlemiyle birlikte değerlendirilmelidir.')
    : (climate.observedDays>0
      ? 'Hava geçmişi dönem koşullarını gösterir. Hastalık, zararlı, gerçek su açığı ve verim için saha ölçümü ve ek ürün verisi gerekir. Bu rapor olmayan kanıttan sonuç üretmez.'
      : 'Dönemin yeterli saha ve iklim kanıtı bulunmadığından güvenilir üretim kararı verilemez.');
  wrap(ctx, englishFree(criticalText), rightX + 29, 975, 13, 650, MUTED, rightW - 61, 1.35, 5);
  text(ctx, latestPhoto ? 'Kanıt: Kullanıcı saha fotoğrafı' : 'İstenen kanıt: Güncel saha fotoğrafı',
    rightX + 29, 1081, 11, 850, BLUE);

  rr(ctx, rightX, 1170, rightW, 250, 15, '#f7fbf8', LINE);
  sectionHeader(ctx,rightX+10,1178,9,
    isHistoricalReport?'Raporun Kanıt Türleri':"Pusula'nın Kısa Aksiyonları",GREEN,'✓');
  const narrativeActions=(narrative?.actions??[]).filter(Boolean);
  const actions = isHistoricalReport ? [
    ['Gözlem','Uydu ve geçmiş hava kayıtları tarihli gözlem verisi niteliğindedir.',GREEN,GREEN_SOFT],
    ['Model','SoilGrids parsel laboratuvar testi değil; konumsal model referansıdır.',BLUE,BLUE_SOFT],
    ['Pusula Yorumu','Analitik yorum, doğrulanmış değerler yerine geçmez.',PURPLE,PURPLE_SOFT],
  ] : [
    ['Bugün', narrativeActions[0] ?? guidance.next7Days[0] ?? 'Tarlanın güncel durumunu kontrol et.', GREEN, GREEN_SOFT],
    ['Önümüzdeki 7 Gün', narrativeActions[1] ?? guidance.next7Days[1] ?? 'Uydu ve hava trendini takip et.', BLUE, BLUE_SOFT],
    ['İzle ve Planla', narrativeActions[2] ?? guidance.next7Days[2] ?? guidance.dataQualityNote, PURPLE, PURPLE_SOFT],
  ];
  actions.forEach(([titleValue, value, accent, soft], index) => {
    const x = rightX + 14 + index * 124;
    rr(ctx, x, 1224, 116, 176, 9, soft, soft);
    text(ctx, titleValue, x + 10, 1247, 9.5, 900, accent);
    wrap(ctx, value, x + 10, 1275, 9.2, 650, INK, 96, 1.28, 7);
  });

  // Fixed satellite-field motif, drawn as a background illustration.
  // The original compass image is retained above the pattern, never repeated
  // as a separate branded title inside the same text region.
  ctx.save();
  ctx.beginPath(); ctx.roundRect(rightX,1430,rightW,160,15); ctx.clip();
  const motif=ctx.createLinearGradient(rightX,1430,rightX+rightW,1590);
  motif.addColorStop(0,'#071918'); motif.addColorStop(0.55,'#17433a');
  motif.addColorStop(1,'#0b2325');
  ctx.fillStyle=motif;ctx.fillRect(rightX,1430,rightW,160);
  const farmland=['rgba(131,205,141,.13)','rgba(232,211,125,.13)','rgba(72,154,131,.19)'];
  for(let i=0;i<7;i++){
    ctx.fillStyle=farmland[i%farmland.length];
    ctx.beginPath();const xx=rightX+180+i*54;
    ctx.moveTo(xx,1430);ctx.lineTo(xx+51,1430);ctx.lineTo(xx-34,1590);ctx.lineTo(xx-85,1590);ctx.closePath();ctx.fill();
  }
  ctx.restore();
  const compassBody=await imageBitmapFrom(BRAND_BODY);
  const compassNeedle=await imageBitmapFrom(BRAND_NEEDLE);
  if(compassBody){ctx.drawImage(compassBody,rightX+18,1461,59,59);compassBody.close();}
  if(compassNeedle){ctx.drawImage(compassNeedle,rightX+18,1461,59,59);compassNeedle.close();}
  fittedText(ctx,'TarlaPusula',rightX+91,1471,rightW-110,22,900,WHITE);
  fittedText(ctx,'TARLANIN AKLI, YANINDA.',rightX+92,1492,rightW-110,9,750,'#d2e7dd');
  wrap(ctx,'Veriye dayalı kararlarla daha güçlü yarınlar.',rightX+92,1521,12,800,WHITE,rightW-111,1.2,2);
  text(ctx,'Uydu · Toprak · Hava · Saha',rightX+22,1570,10,700,'#d6eee5');

  // Branded footer; social contacts remain on dedicated contrast surfaces.
  rr(ctx, 12, 1604, 1216, 138, 15, '#f0f6f3', LINE);
  ctx.save();ctx.beginPath();ctx.roundRect(12,1604,1216,138,15);ctx.clip();
  ctx.fillStyle='rgba(31,117,83,.065)';
  for(let i=0;i<9;i++){
    ctx.beginPath();const x=90+i*158;
    ctx.moveTo(x,1604);ctx.lineTo(x+89,1604);
    ctx.lineTo(x-23,1742);ctx.lineTo(x-101,1742);ctx.fill();
  }
  ctx.restore();
  rr(ctx, 27, 1617, 244, 111, 12, 'rgba(255,255,255,.80)', '');
  rr(ctx, 277, 1617, 541, 111, 12, 'rgba(255,255,255,.70)', '');
  rr(ctx, 835, 1617, 377, 111, 12, 'rgba(255,255,255,.84)', '');
  await logo(ctx, 52, 1660, true);
  footerSocial(ctx, 286, 1634, '◎', '#e1306c', 'Instagram', '@tarlapusula');
  footerSocial(ctx, 465, 1634, 'f', '#1877f2', 'Facebook', 'tarlapusula');
  footerSocial(ctx, 632, 1634, '✉', '#15936a', 'E-posta', 'tarlapusula@gmail.com');
  ctx.strokeStyle = '#dfe6e9';
  ctx.beginPath();
  ctx.moveTo(826, 1622);
  ctx.lineTo(826, 1725);
  ctx.stroke();
  await drawQr(ctx, ANDROID_URL, 846, 1623, 57, 'Android indir', 'android');
  await drawQr(ctx, IOS_URL, 1022, 1623, 57, 'iOS indir', 'ios');

  // PNG avoids JPG halos around 8-12px labels and keeps parcel edges sharp.
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, 297, undefined, 'MEDIUM');
  doc.setProperties({
    title: `PUSULAPDF - ${snapshot.field.name}`,
    author: 'TarlaPusula',
    creator: 'TarlaPusula PUSULAPDF',
    subject: 'Seçilen döneme göre uyarlanan, kaynakları ayrıştırılmış tarla analizi',
  });
  return doc;
}

export type PusulaPdfOpenOptions = {
  previewWindow?: Window | null;
};

function pusulaPdfFileName(snapshot: PusulaPdfSnapshot) {
  const name = (snapshot.field.name || 'tarla')
    .toLocaleLowerCase('tr-TR')
    .replace(/[^a-z0-9çğıöşü]+/gi, '-')
    .replace(/^-+|-+$/g, '');
  return `PUSULAPDF-${name || 'tarla'}-${snapshot.period.end}.pdf`;
}

function triggerPdfDownload(url: string, fileName: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

export async function downloadPusulaPdf(
  snapshot: PusulaPdfSnapshot,
  options: PusulaPdfOpenOptions = {},
) {
  const doc = await generatePusulaPdf(snapshot);
  const fileName = pusulaPdfFileName(snapshot);
  const blob = doc.output('blob');
  const url = URL.createObjectURL(blob);

  const previewWindow = options.previewWindow;
  let openedInPreview = false;

  if (previewWindow && !previewWindow.closed) {
    try {
      previewWindow.location.replace(url);
      openedInPreview = true;
    } catch (error) {
      console.warn('[PUSULAPDF] Önizleme sekmesine PDF aktarılamadı:', error);
    }
  }

  try {
    triggerPdfDownload(url, fileName);
  } catch (error) {
    console.warn('[PUSULAPDF] Otomatik indirme tetiklenemedi:', error);
  }

  if (!openedInPreview) {
    try {
      const fallback = window.open(url, '_blank');
      if (fallback) {
        try {
          fallback.opener = null;
        } catch {
          // Tarayıcı izin vermezse sorun değil.
        }
      }
    } catch (error) {
      console.warn('[PUSULAPDF] PDF yeni sekmede açılamadı:', error);
    }
  }

  window.setTimeout(() => URL.revokeObjectURL(url), 2 * 60 * 1000);
  return { fileName, openedInPreview };
}
