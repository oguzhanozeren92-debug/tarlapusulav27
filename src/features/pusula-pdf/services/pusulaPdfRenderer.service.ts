import { jsPDF } from 'jspdf';
import type { PusulaPdfFieldPhoto, PusulaPdfSatellitePoint, PusulaPdfSnapshot } from '../types';
import type { PusulaInsight } from './pusulaPdfInsights.service';
import { buildPusulaPdfGuidance } from './pusulaPdfInsights.service';
import { refreshPusulaPdfImageUrls } from './pusulaPdfImageRefresh.service';
import { encodeQr } from './pusulaPdfQr';

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
// iPhone QR always points to the App Store listing (env can override).
// Short canonical form: same app, opens in the scanner's own storefront, and
// keeps the QR at version 3 (sparser modules = more reliable phone scans).
const IOS_APP_STORE_URL = 'https://apps.apple.com/app/id6819761937';
const IOS_URL = String(import.meta.env.VITE_IOS_DOWNLOAD_URL || IOS_APP_STORE_URL).trim();

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

// Brand band. When the field has a satellite image, the band is a rendered
// aerial photo of THIS parcel under a dark glass layer; otherwise a vector
// field motif. No external decoration assets.
async function brandBand(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  seed = 1, imageSrc?: string | null, imageAlpha = 1,
) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 16); ctx.clip();
  const base = ctx.createLinearGradient(x, y, x + w, y + h);
  base.addColorStop(0, '#062a21'); base.addColorStop(0.5, '#0c4f40'); base.addColorStop(1, '#123b55');
  ctx.fillStyle = base; ctx.fillRect(x, y, w, h);
  const photo = await imageBitmapFrom(imageSrc);
  if (photo) {
    // Sentinel pixels are 10 m; a small parcel is only a few pixels wide. Render
    // the photo as a soft colour wash (downsample + smooth upscale) instead of
    // stretching blocky pixels. Works without canvas filter support.
    const tiny = document.createElement('canvas');
    tiny.width = 48; tiny.height = Math.max(8, Math.round(48 * h / (w * 0.75)));
    const t = tiny.getContext('2d');
    if (t) {
      t.imageSmoothingEnabled = true; t.imageSmoothingQuality = 'high';
      t.drawImage(photo, 0, 0, tiny.width, tiny.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = imageAlpha;
      ctx.drawImage(tiny, x + w * 0.25, y - h * 0.1, w * 0.78, h * 1.2);
      ctx.globalAlpha = 1;
    }
    photo.close();
    const veil = ctx.createLinearGradient(x, 0, x + w, 0);
    veil.addColorStop(0, 'rgba(5,34,27,.98)'); veil.addColorStop(0.3, 'rgba(6,42,33,.93)');
    veil.addColorStop(0.55, 'rgba(8,52,42,.62)'); veil.addColorStop(0.8, 'rgba(10,58,52,.30)');
    veil.addColorStop(1, 'rgba(12,48,70,.42)');
    ctx.fillStyle = veil; ctx.fillRect(x, y, w, h);
  } else {
    const strips = ['rgba(150,214,120,.13)', 'rgba(236,206,112,.12)', 'rgba(88,170,140,.16)', 'rgba(198,232,150,.08)'];
    for (let i = 0; i < 16; i += 1) {
      const sx = x + 420 + i * 58 + (seed % 2) * 20;
      ctx.fillStyle = strips[(i + seed) % strips.length];
      ctx.beginPath();
      ctx.moveTo(sx, y); ctx.lineTo(sx + 40, y); ctx.lineTo(sx - 30, y + h); ctx.lineTo(sx - 70, y + h); ctx.closePath(); ctx.fill();
    }
  }
  // fine contour lines
  ctx.strokeStyle = 'rgba(255,255,255,.06)'; ctx.lineWidth = 1;
  for (let i = 0; i < 7; i += 1) {
    const o = i * 16;
    ctx.beginPath();
    ctx.moveTo(x - 20, y + h * 0.2 + o);
    ctx.bezierCurveTo(x + w * 0.2, y - 20 + o, x + w * 0.38, y + h + o * 0.4, x + w * 0.58, y + h * 0.4 + o * 0.5);
    ctx.stroke();
  }
  // soft light bloom behind the brand block
  const bloom = ctx.createRadialGradient(x + 90, y + h * 0.45, 4, x + 90, y + h * 0.45, h * 1.6);
  bloom.addColorStop(0, 'rgba(120,230,190,.20)'); bloom.addColorStop(1, 'rgba(120,230,190,0)');
  ctx.fillStyle = bloom; ctx.fillRect(x, y, w, h);
  // top gloss
  const gloss = ctx.createLinearGradient(0, y, 0, y + h * 0.5);
  gloss.addColorStop(0, 'rgba(255,255,255,.13)'); gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss; ctx.fillRect(x, y, w, h * 0.5);
  // satellite orbit, thin
  ctx.setLineDash([3, 6]); ctx.strokeStyle = 'rgba(170,245,225,.30)'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.ellipse(x + w * 0.5, y + h * 2.2, w * 0.36, h * 2.2 - 14, 0, Math.PI * 1.08, Math.PI * 1.92); ctx.stroke();
  ctx.setLineDash([]);
  if (seed === 1) {
    const sx = x + w * 0.5, sy = y + 14;
    ctx.fillStyle = 'rgba(210,252,240,.9)'; ctx.fillRect(sx - 3, sy - 3, 6, 6);
    ctx.fillStyle = 'rgba(130,205,255,.8)'; ctx.fillRect(sx - 14, sy - 2, 9, 4); ctx.fillRect(sx + 5, sy - 2, 9, 4);
  }
  // accent hairline
  const edge = ctx.createLinearGradient(x, 0, x + w, 0);
  edge.addColorStop(0, 'rgba(110,231,183,.0)'); edge.addColorStop(0.2, 'rgba(110,231,183,.9)');
  edge.addColorStop(0.7, 'rgba(56,189,248,.9)'); edge.addColorStop(1, 'rgba(56,189,248,0)');
  ctx.fillStyle = edge; ctx.fillRect(x, seed === 1 ? y + h - 2.5 : y, w, 2.5);
  ctx.restore();
}

/** The app's own compass mark (same two files as the app header). Returns false if unavailable. */
async function logoBadge(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  const body = await imageBitmapFrom(BRAND_BODY);
  const needle = await imageBitmapFrom(BRAND_NEEDLE);
  if (!body && !needle) return false; // never draw a substitute mark
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.32)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 3;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = WHITE; ctx.fill();
  ctx.restore();
  const inner = r - 4;
  if (body) { ctx.drawImage(body, cx - inner, cy - inner, inner * 2, inner * 2); body.close(); }
  if (needle) { ctx.drawImage(needle, cx - inner, cy - inner, inner * 2, inner * 2); needle.close(); }
  return true;
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

// The same NDVI/radar image is used by several panels (hero, timeline, zone
// classification). Download each source once per render.
const imageBlobCache = new Map<string, Promise<Blob | null>>();

function imageBitmapFrom(src: string | null | undefined) {
  if (!src) return Promise.resolve<ImageBitmap | null>(null);
  let blob = imageBlobCache.get(src);
  if (!blob) {
    blob = fetch(src)
      .then((response) => response.ok ? response.blob() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .catch(() => null);
    imageBlobCache.set(src, blob);
  }
  return blob
    .then((value) => value ? createImageBitmap(value) : null)
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

type PdfActivity = { date: string; type: string };

const DAY_MS = 86400000;

function dayValue(date: string) {
  return Date.parse(`${String(date).slice(0, 10)}T12:00:00Z`);
}

function dateX(date: string, start: string, end: string, x: number, w: number) {
  const s = dayValue(start), e = dayValue(end), d = dayValue(date);
  if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(d) || e <= s) return x + w / 2;
  return x + clamp((d - s) / (e - s), 0, 1) * w;
}

function paddedRange(values: number[], pad = 0.12, minSpan = 0.1): [number, number] {
  let lo = Math.min(...values), hi = Math.max(...values);
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = mid - minSpan / 2; hi = mid + minSpan / 2; }
  const p = (hi - lo) * pad;
  return [lo - p, hi + p];
}

// Round axis bounds so that every grid label is a "nice" number (1, 2, 2.5, 5 × 10ⁿ).
function niceBounds(lo: number, hi: number, steps: number): [number, number] {
  const raw = Math.max((hi - lo) / steps, 1e-9);
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10, 20, 25, 50]) {
    const step = m * mag;
    const a = Math.floor(lo / step + 1e-9) * step;
    if (a + step * steps >= hi - 1e-9) return [a, a + step * steps];
  }
  return [lo, hi];
}

function periodActivities(snapshot: PusulaPdfSnapshot): PdfActivity[] {
  const rows = Array.isArray(snapshot.activities) ? snapshot.activities as any[] : [];
  return rows
    .map((row) => ({
      date: String(row?.activity_date ?? row?.date ?? '').slice(0, 10),
      type: String(row?.activity_type ?? row?.type ?? row?.title ?? ''),
    }))
    .filter((row) => row.date && row.date >= snapshot.period.start && row.date <= snapshot.period.end)
    .sort((a, b) => a.date.localeCompare(b.date));
}

function activityStyle(type: string) {
  const t = type.toLocaleLowerCase('tr-TR');
  if (/sula/.test(t)) return { color: BLUE, mark: 'S', label: 'Sulama' };
  if (/gübre|gubre/.test(t)) return { color: GREEN_DARK, mark: 'G', label: 'Gübreleme' };
  if (/ilaç|ilac/.test(t)) return { color: RED, mark: 'İ', label: 'İlaçlama' };
  if (/hasat/.test(t)) return { color: ORANGE, mark: 'H', label: 'Hasat' };
  return { color: MUTED, mark: '•', label: 'İşlem' };
}

function drawActivityMarkers(
  ctx: CanvasRenderingContext2D,
  activities: PdfActivity[],
  start: string,
  end: string,
  x: number,
  w: number,
  y: number,
) {
  for (const activity of activities) {
    const style = activityStyle(activity.type);
    const px = dateX(activity.date, start, end, x, w);
    ctx.save();
    ctx.setLineDash([2, 3]);
    ctx.strokeStyle = style.color;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(px, y - 6); ctx.lineTo(px, y - 60); ctx.stroke();
    ctx.restore();
    circleIcon(ctx, px, y, 6.5, style.color, style.mark, WHITE, 8);
  }
}

function axisGrid(
  ctx: CanvasRenderingContext2D,
  gx: number, gy: number, gw: number, gh: number,
  lo: number, hi: number, steps: number,
  format: (value: number) => string,
  color = MUTED,
  side: 'left' | 'right' = 'left',
) {
  for (let k = 0; k <= steps; k += 1) {
    const yy = gy + gh * k / steps;
    ctx.strokeStyle = '#e4ebee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(gx, yy); ctx.lineTo(gx + gw, yy); ctx.stroke();
    const value = hi - (hi - lo) * k / steps;
    ctx.textAlign = side === 'left' ? 'right' : 'left';
    text(ctx, format(value), side === 'left' ? gx - 5 : gx + gw + 5, yy + 3.5, 8.5, 700, color);
    ctx.textAlign = 'left';
  }
}

function dateTicks(ctx: CanvasRenderingContext2D, start: string, end: string, gx: number, gw: number, y: number) {
  const s = dayValue(start), e = dayValue(end);
  const mid = new Date((s + e) / 2).toISOString().slice(0, 10);
  text(ctx, fmt(start, false), gx, y, 9, 700, MUTED);
  ctx.textAlign = 'center';
  if (e - s > 6 * DAY_MS) text(ctx, fmt(mid, false), gx + gw / 2, y, 9, 700, MUTED);
  ctx.textAlign = 'right';
  text(ctx, fmt(end, false), gx + gw, y, 9, 700, MUTED);
  ctx.textAlign = 'left';
}

function chart(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  points: PusulaPdfSatellitePoint[],
  opts: { start: string; end: string; activities: PdfActivity[] },
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
  const values = ready.flatMap((item) => item.points.map((p) => p[item.key] as number));
  const [lo, hi] = niceBounds(...paddedRange(values, 0.08, 0.1), 3);
  const gx = x + 36, gy = y + 8, gw = w - 44, gh = h - 34;
  axisGrid(ctx, gx, gy, gw, gh, lo, hi, 3, (v) => v.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  const py = (value: number) => gy + gh - clamp((value - lo) / (hi - lo), 0, 1) * gh;
  for (const item of ready) {
    ctx.beginPath(); ctx.strokeStyle = item.color; ctx.lineWidth = 2.6;
    item.points.forEach((point, index) => {
      const px = dateX(point.date, opts.start, opts.end, gx, gw);
      const yy = py(point[item.key] as number);
      if (!index) ctx.moveTo(px, yy); else ctx.lineTo(px, yy);
    });
    ctx.stroke();
    for (const point of item.points) {
      ctx.beginPath();
      ctx.arc(dateX(point.date, opts.start, opts.end, gx, gw), py(point[item.key] as number), 3.3, 0, Math.PI * 2);
      ctx.fillStyle = WHITE; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = item.color; ctx.stroke();
    }
  }
  drawActivityMarkers(ctx, opts.activities, opts.start, opts.end, gx, gw, gy + gh);
  dateTicks(ctx, opts.start, opts.end, gx, gw, y + h - 6);
}

// ---------------------------------------------------------------------------
// NDVI image classification.
// satellite-field-analysis paints NDVI with a fixed 5-class palette, so the
// share of each class can be read back from the image pixels exactly. This is
// a pixel count of the delivered map, not a new model estimate.
const NDVI_CLASSES = [
  { rgb: [230, 26, 20], name: 'Çok zayıf', range: '<0,20', color: '#e61a14' },
  { rgb: [245, 110, 26], name: 'Zayıf', range: '0,20–0,35', color: '#f56e1a' },
  { rgb: [242, 194, 31], name: 'Orta', range: '0,35–0,50', color: '#f2c21f' },
  { rgb: [112, 191, 61], name: 'İyi', range: '0,50–0,65', color: '#70bf3d' },
  { rgb: [13, 122, 46], name: 'Çok iyi', range: '≥0,65', color: '#0d7a2e' },
] as const;

type NdviShares = { shares: number[]; pixels: number; good: number; mid: number; weak: number };

async function ndviClassShares(src: string | null | undefined): Promise<NdviShares | null> {
  const bitmap = await imageBitmapFrom(src);
  if (!bitmap) return null;
  try {
    const scale = Math.min(1, 400 / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d', { willReadFrequently: true });
    if (!c) return null;
    c.imageSmoothingEnabled = false; // never blend two classes into a third colour
    c.drawImage(bitmap, 0, 0, w, h);
    const data = c.getImageData(0, 0, w, h).data;
    const counts = [0, 0, 0, 0, 0];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 120) continue; // outside parcel / no-data
      let best = -1, bestDist = Infinity;
      NDVI_CLASSES.forEach((cls, k) => {
        const d = (data[i] - cls.rgb[0]) ** 2 + (data[i + 1] - cls.rgb[1]) ** 2 + (data[i + 2] - cls.rgb[2]) ** 2;
        if (d < bestDist) { bestDist = d; best = k; }
      });
      if (best >= 0 && bestDist < 55 * 55) counts[best] += 1;
    }
    const total = counts.reduce((a, b) => a + b, 0);
    if (total < 25) return null;
    const shares = counts.map((n) => n / total * 100);
    return { shares, pixels: total, good: shares[3] + shares[4], mid: shares[2], weak: shares[0] + shares[1] };
  } catch {
    return null; // e.g. a CORS-tainted image; never guess a distribution
  } finally {
    bitmap.close();
  }
}

function percentText(value: number) {
  return `%${Math.round(value).toLocaleString('tr-TR')}`;
}

function shareBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, shares: number[]) {
  ctx.save();
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.clip();
  let cx = x;
  shares.forEach((share, k) => {
    const sw = w * share / 100;
    ctx.fillStyle = NDVI_CLASSES[k].color;
    ctx.fillRect(cx, y, sw + 0.5, h);
    cx += sw;
  });
  ctx.restore();
}

// ---------------------------------------------------------------------------
// Daily weather + water balance (recorded history only, never forecast).
type DailyWeather = { date: string; rain: number | null; et0: number | null; tmax: number | null; tmin: number | null };

function dailyWeather(rows: any[]): DailyWeather[] {
  const byDate = new Map<string, DailyWeather>();
  for (const row of rows) {
    const date = wd(row);
    if (!date) continue;
    byDate.set(date, {
      date,
      rain: wv(row, 'precipitation', 'rain', 'precipitationMm'),
      et0: wv(row, 'et0', 'referenceEt0'),
      tmax: wv(row, 'tempMax', 'maxTemp', 'maxTemperature'),
      tmin: wv(row, 'tempMin', 'minTemp', 'minTemperature'),
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function strokeSeries(
  ctx: CanvasRenderingContext2D,
  pts: Array<{ date: string; x: number; y: number }>,
  color: string,
  width = 2,
) {
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = 'round';
  let prev: string | null = null;
  for (const p of pts) {
    // Break the line over missing days instead of interpolating them.
    const gap = prev ? (dayValue(p.date) - dayValue(prev)) / DAY_MS > 1.5 : true;
    if (gap) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    prev = p.date;
  }
  ctx.stroke();
}

function weatherChart(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  days: DailyWeather[], start: string, end: string,
) {
  const temps = days.flatMap((d) => [d.tmax, d.tmin]).filter(valid);
  const rains = days.map((d) => d.rain).filter(valid);
  if (days.length < 3 || (!temps.length && !rains.length)) {
    rr(ctx, x, y, w, h, 9, WHITE, LINE);
    wrap(ctx, 'Günlük grafik için yeterli hava kaydı yok; yukarıdaki toplamlar yalnız kayıtlı günlerden hesaplandı.',
      x + 12, y + 30, 10, 700, MUTED, w - 24, 1.25, 3);
    return;
  }
  const gx = x + 30, gy = y + 8, gw = w - 62, gh = h - 30;
  const rainMax = niceBounds(0, Math.max(4, ...rains), 2)[1];
  const [tLo, tHiSafe] = temps.length ? niceBounds(Math.min(...temps), Math.max(...temps), 2) : [0, 10];
  axisGrid(ctx, gx, gy, gw, gh, 0, rainMax, 2, (v) => `${Math.round(v)}`, BLUE, 'left');
  // right-hand temperature labels (grid already drawn)
  for (let k = 0; k <= 2; k += 1) {
    const value = tHiSafe - (tHiSafe - tLo) * k / 2;
    text(ctx, `${Math.round(value)}°`, gx + gw + 5, gy + gh * k / 2 + 3.5, 8.5, 700, ORANGE);
  }
  const totalDays = Math.max(1, Math.round((dayValue(end) - dayValue(start)) / DAY_MS) + 1);
  const barW = Math.max(2, gw / totalDays * 0.62);
  for (const d of days) {
    if (!valid(d.rain) || d.rain <= 0) continue;
    const px = dateX(d.date, start, end, gx, gw);
    const bh = Math.max(1.5, d.rain / rainMax * gh);
    ctx.fillStyle = 'rgba(22,119,232,.55)';
    ctx.fillRect(px - barW / 2, gy + gh - bh, barW, bh);
  }
  const ty = (t: number) => gy + gh - clamp((t - tLo) / (tHiSafe - tLo), 0, 1) * gh;
  const maxPts = days.filter((d) => valid(d.tmax)).map((d) => ({ date: d.date, x: dateX(d.date, start, end, gx, gw), y: ty(d.tmax!) }));
  const minPts = days.filter((d) => valid(d.tmin)).map((d) => ({ date: d.date, x: dateX(d.date, start, end, gx, gw), y: ty(d.tmin!) }));
  strokeSeries(ctx, maxPts, ORANGE, 2);
  strokeSeries(ctx, minPts, '#2d6fb7', 1.6);
  for (const d of days) {
    const px = dateX(d.date, start, end, gx, gw);
    if (valid(d.tmax) && d.tmax >= 30) { ctx.beginPath(); ctx.arc(px, ty(d.tmax), 3, 0, Math.PI * 2); ctx.fillStyle = RED; ctx.fill(); }
    if (valid(d.tmin) && d.tmin <= 0) { ctx.beginPath(); ctx.arc(px, ty(d.tmin), 3, 0, Math.PI * 2); ctx.fillStyle = '#5ab0ff'; ctx.fill(); }
  }
  dateTicks(ctx, start, end, gx, gw, y + h - 6);
}

function waterBalanceSeries(days: DailyWeather[]) {
  let cumulative = 0;
  const series: Array<{ date: string; value: number }> = [];
  for (const d of days) {
    if (!valid(d.rain) || !valid(d.et0)) continue; // skip, never fill
    cumulative += d.rain - d.et0;
    series.push({ date: d.date, value: cumulative });
  }
  const deepest = series.reduce<{ date: string; value: number } | null>((m, p) => (!m || p.value < m.value ? p : m), null);
  const deficitDays = series.filter((p) => p.value < 0).length;
  return { series, deepest, deficitDays, end: series.at(-1)?.value ?? null };
}

function waterBalanceChart(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  series: Array<{ date: string; value: number }>,
  start: string, end: string,
  activities: PdfActivity[],
) {
  const gx = x + 38, gy = y + 10, gw = w - 48, gh = h - 36;
  const values = [0, ...series.map((p) => p.value)];
  const [lo, top] = niceBounds(Math.min(...values), Math.max(...values, 1), 4);
  axisGrid(ctx, gx, gy, gw, gh, lo, top, 4, (v) => `${Math.round(v)}`);
  const py = (v: number) => gy + gh - clamp((v - lo) / (top - lo), 0, 1) * gh;
  const zeroY = py(0);
  const pts = series.map((p) => ({ date: p.date, x: dateX(p.date, start, end, gx, gw), y: py(p.value) }));
  // area: blue above zero (surplus), red below (deficit)
  const area = () => {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, zeroY);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts.at(-1)!.x, zeroY);
    ctx.closePath();
  };
  ctx.save(); ctx.beginPath(); ctx.rect(gx, gy, gw, zeroY - gy); ctx.clip(); area(); ctx.fillStyle = 'rgba(22,119,232,.18)'; ctx.fill(); ctx.restore();
  ctx.save(); ctx.beginPath(); ctx.rect(gx, zeroY, gw, gy + gh - zeroY); ctx.clip(); area(); ctx.fillStyle = 'rgba(236,63,66,.16)'; ctx.fill(); ctx.restore();
  ctx.strokeStyle = '#90a4ae'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(gx, zeroY); ctx.lineTo(gx + gw, zeroY); ctx.stroke();
  strokeSeries(ctx, pts, INK, 2.4);
  drawActivityMarkers(ctx, activities, start, end, gx, gw, gy + gh);
  text(ctx, 'mm', x + 4, gy - 1, 8.5, 800, MUTED);
  dateTicks(ctx, start, end, gx, gw, y + h - 6);
}

// Small single-series line chart (radar backscatter etc.).
function miniLine(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  pts: Array<{ date: string; value: number }>,
  start: string, end: string, color: string,
  format: (v: number) => string,
) {
  const gx = x + 36, gy = y + 6, gw = w - 44, gh = h - 26;
  const [lo, hi] = niceBounds(...paddedRange(pts.map((p) => p.value), 0.1, 1), 2);
  axisGrid(ctx, gx, gy, gw, gh, lo, hi, 2, format);
  const mapped = pts.map((p) => ({ date: p.date, x: dateX(p.date, start, end, gx, gw), y: gy + gh - clamp((p.value - lo) / (hi - lo), 0, 1) * gh }));
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.2;
  mapped.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.stroke();
  for (const p of mapped) {
    ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = WHITE; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = color; ctx.stroke();
  }
  dateTicks(ctx, start, end, gx, gw, y + h - 4);
}

// ---------------------------------------------------------------------------
// Colour scales and small visual widgets.
function hexRgb(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function scaleColor(value: number, stops: Array<[number, string]>) {
  if (value <= stops[0][0]) return stops[0][1];
  for (let i = 1; i < stops.length; i += 1) {
    if (value <= stops[i][0]) {
      const [v0, c0] = stops[i - 1], [v1, c1] = stops[i];
      const t = (value - v0) / (v1 - v0);
      const a = hexRgb(c0), b = hexRgb(c1);
      return `rgb(${a.map((x, k) => Math.round(x + (b[k] - x) * t)).join(',')})`;
    }
  }
  return stops.at(-1)![1];
}
const TEMP_STOPS: Array<[number, string]> = [
  [-5, '#5b8fd9'], [3, '#9cc7f2'], [12, '#d6edf7'], [18, '#e6f4d4'], [24, '#fbe7a1'], [30, '#f8aa62'], [36, '#e8574b'],
];
const PH_STOPS: Array<[number, string]> = [
  [4, '#e1493d'], [5.5, '#f39a35'], [6.5, '#9ccc4a'], [7.3, '#2f9e5b'], [8.0, '#3a8fd1'], [9, '#6d4fc4'],
];
const NDMI_STOPS: Array<[number, string]> = [
  [-0.2, '#d9534a'], [0, '#f2b33d'], [0.2, '#9ccc4a'], [0.4, '#2f9e5b'], [0.6, '#1f6fd1'],
];

function gradientBar(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number,
  stops: Array<[number, string]>, value: number | null,
) {
  const lo = stops[0][0], hi = stops.at(-1)![0];
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  stops.forEach(([v, c]) => g.addColorStop((v - lo) / (hi - lo), c));
  ctx.beginPath(); ctx.roundRect(x, y, w, h, h / 2); ctx.fillStyle = g; ctx.fill();
  if (value === null) return;
  const px = x + clamp((value - lo) / (hi - lo), 0, 1) * w;
  ctx.beginPath(); ctx.arc(px, y + h / 2, h / 2 + 3, 0, Math.PI * 2);
  ctx.fillStyle = WHITE; ctx.fill(); ctx.lineWidth = 2.2; ctx.strokeStyle = INK; ctx.stroke();
}

// USDA soil texture class from clay/silt/sand percentages (deterministic).
function textureClass(clayIn: number, siltIn: number, sandIn: number) {
  const total = clayIn + siltIn + sandIn;
  if (!(total > 0)) return null;
  const C = clayIn / total * 100, Si = siltIn / total * 100, S = sandIn / total * 100;
  if (C >= 40 && Si >= 40) return 'Siltli kil';
  if (C >= 35 && S > 45) return 'Kumlu kil';
  if (C >= 40) return 'Kil';
  if (C >= 27 && S <= 20) return 'Siltli killi tın';
  if (C >= 27 && S <= 45) return 'Killi tın';
  if (C >= 20 && Si < 28 && S > 45) return 'Kumlu killi tın';
  if (Si >= 80 && C < 12) return 'Silt';
  if ((Si >= 50 && C >= 12 && C < 27) || (Si >= 50 && Si < 80 && C < 12)) return 'Siltli tın';
  if (C >= 7 && C < 27 && Si >= 28 && Si < 50 && S <= 52) return 'Tın';
  if (Si + 1.5 * C < 15) return 'Kum';
  if (Si + 2 * C < 30) return 'Tınlı kum';
  return 'Kumlu tın';
}
function textureHint(name: string) {
  if (/kil/i.test(name) && !/tın/i.test(name)) return 'Su tutması yüksek; ağır toprak, drenaj ve tava gelişine dikkat.';
  if (/killi tın/i.test(name)) return 'Su tutması iyi; ağır yağışta su birikimine dikkat.';
  if (/kum/i.test(name)) return 'Su tutması düşük; az suyla sık sulama gerekir.';
  return 'Su tutma ve havalanma dengeli bir bünye.';
}

const TEXTURE_COLORS = { clay: '#a0522d', silt: '#d2a86b', sand: '#efd9a6' };

// One square per day of the period: max temperature colour, rain, field
// operations, and the days that have a satellite map or a radar scene.
function periodCalendar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, maxH: number,
  start: string, end: string,
  days: DailyWeather[], activities: PdfActivity[], satDates: Set<string>, radarDates: Set<string>,
) {
  const s = dayValue(start), e = dayValue(end);
  const total = Math.round((e - s) / DAY_MS) + 1;
  const firstDow = (new Date(s).getUTCDay() + 6) % 7; // Monday = 0
  const weeks = Math.ceil((firstDow + total) / 7);
  const gap = 4, cellW = (w - gap * 6) / 7;
  const cellH = Math.min(46, (maxH - 18) / weeks - gap);
  const byDate = new Map(days.map((d) => [d.date, d]));
  const actByDate = new Map<string, PdfActivity[]>();
  activities.forEach((a) => actByDate.set(a.date, [...(actByDate.get(a.date) ?? []), a]));
  ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'].forEach((d, i) => {
    ctx.textAlign = 'center';
    text(ctx, d, x + i * (cellW + gap) + cellW / 2, y + 10, 8.5, 800, MUTED);
    ctx.textAlign = 'left';
  });
  for (let i = 0; i < total; i += 1) {
    const date = new Date(s + i * DAY_MS).toISOString().slice(0, 10);
    const slot = firstDow + i, col = slot % 7, row = Math.floor(slot / 7);
    const cx = x + col * (cellW + gap), cy = y + 18 + row * (cellH + gap);
    const day = byDate.get(date);
    const fill = day && valid(day.tmax) ? scaleColor(day.tmax, TEMP_STOPS) : '#eef2f3';
    rr(ctx, cx, cy, cellW, cellH, 7, fill, 'rgba(16,36,58,.08)');
    text(ctx, String(Number(date.slice(8, 10))), cx + 5, cy + 12, 9, 850, INK);
    if (day && valid(day.tmax) && cellH >= 32) {
      ctx.textAlign = 'right';
      text(ctx, `${Math.round(day.tmax)}°`, cx + cellW - 4, cy + 12, 8.5, 750, 'rgba(16,36,58,.62)');
      ctx.textAlign = 'left';
    }
    if (day && valid(day.rain) && day.rain >= 0.5) {
      // rain drop + amount
      const dx = cx + 9, dy = cy + cellH - 9;
      ctx.beginPath();
      ctx.moveTo(dx, dy - 7); ctx.quadraticCurveTo(dx + 5, dy - 1, dx, dy + 3); ctx.quadraticCurveTo(dx - 5, dy - 1, dx, dy - 7);
      ctx.fillStyle = BLUE; ctx.fill();
      text(ctx, numTr(day.rain, day.rain < 10 ? 1 : 0), dx + 6, dy + 3, 8.5, 850, '#0f4fa8');
    }
    let mx = cx + cellW - 8;
    const my = cy + cellH - 9;
    for (const act of actByDate.get(date) ?? []) {
      const st = activityStyle(act.type);
      circleIcon(ctx, mx, my, 6, st.color, st.mark, WHITE, 7.5); mx -= 14;
    }
    if (radarDates.has(date)) {
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = '#5146c9'; ctx.fillRect(-4, -4, 8, 8); ctx.restore(); mx -= 13;
    }
    if (satDates.has(date)) {
      ctx.beginPath(); ctx.arc(mx, my, 4.5, 0, Math.PI * 2); ctx.fillStyle = GREEN; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = WHITE; ctx.stroke();
    }
  }
  return y + 18 + weeks * (cellH + gap);
}

function evenlyPick<T>(items: T[], count: number) {
  if (items.length <= count) return items;
  const out: T[] = [];
  for (let i = 0; i < count; i += 1) out.push(items[Math.round(i * (items.length - 1) / (count - 1))]);
  return [...new Set(out)];
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
    const plainDetail = /production|pyfao|aquacrop|wapor|pcse|dssat|sentez/i.test(detail)
      ? 'Sulama modeli kısmi veriyle çalıştı; toprak su açığı 2. bölümde.'
      : detail;
    const style = riskLevel ? statusColor(riskLevel) : insight
      ? {accent:ORANGE,soft:ORANGE_SOFT}
      : {accent:MUTED,soft:GRAY_SOFT};
    return { label, detail: plainDetail, action, status, statusAccent: style.accent, statusSoft: style.soft };
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
function drawQrMatrix(ctx: CanvasRenderingContext2D, target: string, x: number, y: number, size: number) {
  const matrix = encodeQr(target);
  rr(ctx, x, y, size, size, 6, WHITE, '#d5dde1');
  if (!matrix) { text(ctx, 'QR', x + size / 2 - 9, y + size / 2 + 5, 13, 900, MUTED); return; }
  // 4-module quiet zone (QR spec) and pure black modules for phone cameras.
  const quiet = 4;
  const cell = (size - 2) / (matrix.length + quiet * 2);
  const ox = x + 1 + quiet * cell, oy = y + 1 + quiet * cell;
  ctx.fillStyle = '#000000';
  matrix.forEach((row, my) => row.forEach((dark, mx) => {
    if (dark) ctx.fillRect(ox + mx * cell, oy + my * cell, cell + 0.2, cell + 0.2);
  }));
}

function drawQr(
  ctx: CanvasRenderingContext2D,
  target: string,
  x: number,
  y: number,
  platform: 'android' | 'ios',
  hint: string,
) {
  rr(ctx, x, y, 176, 103, 12, WHITE, '#cfd9dd');
  circleIcon(ctx, x + 22, y + 24, 13, platform === 'android' ? '#34a853' : '#111111', platform === 'android' ? 'A' : 'i', WHITE, 11);
  fittedText(ctx, platform === 'android' ? 'Android' : 'iPhone', x + 10, y + 62, 64, 12, 900, INK);
  fittedText(ctx, hint, x + 10, y + 80, 64, 8.6, 750, MUTED);
  drawQrMatrix(ctx, target, x + 79, y + 4, 95);
}

function footerSocial(ctx: CanvasRenderingContext2D, x: number, y: number, symbol: string, fill: string, label: string, value: string) {
  circleIcon(ctx, x + 17, y + 15, 14, fill, symbol, WHITE, 11);
  text(ctx, label, x + 38, y + 9, 9.5, 800, '#a9e6cd');
  text(ctx, value, x + 38, y + 26, 11, 850, WHITE);
}

export async function renderPusulaPdfCanvas(snapshot: PusulaPdfSnapshot) {
  imageBlobCache.clear();
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
  const dailyRows=dailyWeather(weather);
  const activities=periodActivities(snapshot);
  const pStart=snapshot.period.start, pEnd=snapshot.period.end;
  const imagePoints=sat.filter((p)=>p.ndviImage);
  const latestImagePoint=imagePoints.at(-1);
  const latestShares=await ndviClassShares(latestImagePoint?.ndviImage);
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
  // Brand header band.
  const bandPhoto=[...sat].reverse().find((p)=>p.trueColorImage)?.trueColorImage
    ?? [...sat].reverse().find((p)=>p.ndviImage)?.ndviImage ?? null;
  await brandBand(ctx, 12, 12, 1216, 94, 1, bandPhoto);
  const headLogo = await logoBadge(ctx, 62, 59, 36);
  const headX = headLogo ? 110 : 34;
  text(ctx, 'TarlaPusula', headX, 58, 30, 900, WHITE);
  text(ctx, 'TARLANIN AKLI, YANINDA.', headX + 2, 81, 10.5, 800, '#a9e6cd');
  const divider = (dx: number) => {
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(dx, 30); ctx.lineTo(dx, 88); ctx.stroke();
  };
  divider(350);
  fittedText(ctx, 'Dönemsel Tarla Analizi', 372, 50, 280, 20, 900, WHITE);
  text(ctx, 'Daha verimli, daha bilinçli, daha güçlü tarım için.', 372, 74, 10.5, 650, '#c8eadb');
  // metadata on a glass card
  rr(ctx, 674, 22, 539, 74, 12, 'rgba(255,255,255,.12)', 'rgba(255,255,255,.22)');
  const headerMeta = [
    ['RAPOR TARİHİ', fmt(snapshot.period.end)],
    ['TARLA ADI', snapshot.field.name],
    ['ÜRÜN', snapshot.field.crop ?? 'Kayıt yok'],
    ['TARLA BÜYÜKLÜĞÜ', snapshot.field.areaDecare == null ? '—' : `${snapshot.field.areaDecare.toLocaleString('tr-TR')} da`],
  ];
  let hx = 690;
  headerMeta.forEach(([label, value], index) => {
    if (index) {
      ctx.strokeStyle = 'rgba(255,255,255,.20)';
      ctx.beginPath(); ctx.moveTo(hx - 12, 32); ctx.lineTo(hx - 12, 86); ctx.stroke();
    }
    text(ctx, label, hx, 46, 8.3, 850, '#a9e6cd');
    wrap(ctx, value, hx, 68, 11, 850, WHITE, 115, 1.12, 2);
    hx += index === 0 ? 138 : 130;
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

  // Field name / crop / area already live in the header strip; the image only
  // carries what the header does not: location and the scene date.
  const heroChip=`${location} · Görüntü: ${latest?.date?fmt(latest.date,false):'—'}`;
  font(ctx,9.5,800);
  const chipW=Math.min(leftW-48,ctx.measureText(heroChip).width+26);
  rr(ctx,leftX+20,top+346,chipW,26,13,'rgba(5,20,22,.78)','');
  fittedText(ctx,heroChip,leftX+33,top+363,chipW-24,9.5,800,WHITE);

  const statY = top + 399;
  const lastNdmi = [...sat].filter((p) => valid(p.ndmi)).at(-1);
  const ndmiValue = lastNdmi?.ndmi ?? null;
  // NDVI class distribution of the latest map: read from the map's own pixels.
  rr(ctx,leftX+8,statY,leftW-16,104,12,'#f3f8f5',LINE);
  const fallbackShares=(()=>{
    const p=[...sat].reverse().find((row)=>valid(row.highPercent)&&valid(row.mediumPercent)&&valid(row.lowPercent));
    if(!p)return null;
    const scale=(p.highPercent!+p.mediumPercent!+p.lowPercent!)<=1.5?100:1;
    const hi=p.highPercent!*scale,mid=p.mediumPercent!*scale,low=p.lowPercent!*scale;
    return {shares:[0,low,mid,hi,0],good:hi,mid,weak:low,date:p.date};
  })();
  const zone=latestShares
    ? {...latestShares,date:latestImagePoint?.date??null}
    : fallbackShares;
  if(zone){
    fittedText(ctx,`TARLA ALANININ NDVI DAĞILIMI · ${fmt(zone.date,false)}`,leftX+20,statY+22,leftW-40,9,850,GREEN_DARK);
    shareBar(ctx,leftX+20,statY+32,leftW-40,18,zone.shares);
    const parts=[
      ['İyi / çok iyi',zone.good,NDVI_CLASSES[4].color],
      ['Orta',zone.mid,'#c99a00'],
      ['Zayıf',zone.weak,NDVI_CLASSES[0].color],
    ] as const;
    parts.forEach(([label,value,color],i)=>{
      const x=leftX+20+i*128;
      ctx.beginPath();ctx.arc(x+5,statY+70,5,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
      text(ctx,label,x+15,statY+74,10,750,MUTED);
      font(ctx,10,750);
      const labelW=ctx.measureText(label).width;
      text(ctx,percentText(value),x+20+labelW,statY+74.5,13,900,color);
    });
    text(ctx,latestShares?'NDVI haritasındaki parsel piksellerinin sınıf payı (Sentinel-2)':'Kayıtlı bölge yüzdeleri (Sentinel-2)',
      leftX+20,statY+94,8.6,700,MUTED);
  }else{
    fittedText(ctx,'TARLA ALANININ NDVI DAĞILIMI',leftX+20,statY+24,leftW-40,9,850,GREEN_DARK);
    wrap(ctx,'Bu dönemde sınıflandırılabilir NDVI haritası yok. Harita geldiğinde iyi / orta / zayıf alan payı burada gösterilir.',
      leftX+20,statY+50,11,700,INK,leftW-40,1.3,3);
  }

  // Replaces the second copy of the index chart: the same parcel, same colour
  // scale, across the period. Each tile is a real dated NDVI map.
  rr(ctx, leftX, 660, leftW, 244, 15, WHITE, LINE);
  text(ctx, 'Dönem İçinde Tarlanın Değişimi', leftX + 16, 691, 17, 900, INK);
  const stripPoints = evenlyPick(imagePoints, 4);
  const stripShares = await Promise.all(stripPoints.map((p) => ndviClassShares(p.ndviImage)));
  const firstShare = stripShares.find(Boolean), lastShare = [...stripShares].reverse().find(Boolean);
  const stripSubtitle = stripPoints.length < 2
    ? `${imagePoints.length} NDVI haritası · değişim için en az iki tarih gerekir`
    : firstShare && lastShare && firstShare !== lastShare
      ? `İyi / çok iyi alan payı: ${percentText(firstShare.good)} → ${percentText(lastShare.good)} · ${imagePoints.length} harita`
      : `${imagePoints.length} NDVI haritası · aynı renk ölçeği`;
  fittedText(ctx, stripSubtitle, leftX + 16, 712, leftW - 32, 10, 750, MUTED);
  if (stripPoints.length) {
    const gap = 8, tileW = (leftW - 28 - gap * 3) / 4;
    for (let i = 0; i < stripPoints.length; i += 1) {
      const point = stripPoints[i], share = stripShares[i];
      const tx = leftX + 14 + i * (tileW + gap);
      await drawImage(ctx, point.ndviImage, tx, 722, tileW, 118, { cover: false, radius: 9, placeholder: 'Yok' });
      fittedText(ctx, fmt(point.date, false), tx + 2, 857, tileW - 4, 10, 850, INK);
      if (share) {
        const tone = share.good >= 50 ? NDVI_CLASSES[4].color : share.weak >= 40 ? NDVI_CLASSES[0].color : '#c99a00';
        fittedText(ctx, `İyi ${percentText(share.good)}`, tx + 2, 874, tileW - 4, 10, 850, tone);
      } else if (valid(point.ndvi)) {
        fittedText(ctx, `NDVI ${numericIndexText(point.ndvi)}`, tx + 2, 874, tileW - 4, 10, 850, GREEN_DARK);
      }
    }
    if (stripPoints.length === 1) {
      wrap(ctx, 'Bu dönemde tek NDVI haritası var; karşılaştırma bir sonraki görüntüyle oluşur.',
        leftX + 120, 760, 10.5, 700, MUTED, leftW - 140, 1.3, 4);
    }
    // colour scale legend
    const legendW = (leftW - 28) / NDVI_CLASSES.length;
    NDVI_CLASSES.forEach((cls, k) => {
      const lx = leftX + 14 + k * legendW;
      rr(ctx, lx, 883, 12, 10, 3, cls.color, '');
      fittedText(ctx, cls.range, lx + 16, 892, legendW - 20, 8.5, 750, MUTED);
    });
  } else {
    rr(ctx, leftX + 14, 731, leftW - 28, 145, 10, '#f3f8fa', LINE);
    wrap(ctx, 'Seçilen tarihler için kaydedilmiş NDVI haritası yok. Harita oluştukça tarlanın dönem içi değişimi burada yan yana gösterilir.',
      leftX + 28, 779, 11.5, 750, INK, leftW - 56, 1.28, 3);
  }

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
    // A visual timeline of the period instead of four fixed record-keeping tips.
    rr(ctx,leftX,1154,leftW,436,15,'#fbfcf8',LINE);
    text(ctx,'Dönem Takvimi',leftX+18,1190,18,900,INK);
    fittedText(ctx,'Her kare bir gün · renk: o günün en yüksek sıcaklığı',leftX+18,1212,leftW-36,10,750,MUTED);
    const satDates=new Set(imagePoints.map((p)=>p.date));
    const radarDates=new Set([
      ...(snapshot.radar?.points??[]).map((p)=>p.date),
      ...(snapshot.radar?.images??[]).map((p)=>p.date),
    ]);
    periodCalendar(ctx,leftX+16,1224,leftW-32,288,pStart,pEnd,dailyRows,activities,satDates,radarDates);
    // legend
    text(ctx,'Sıcaklık',leftX+18,1534,9,800,MUTED);
    gradientBar(ctx,leftX+70,1527,170,9,TEMP_STOPS.filter(([v])=>v>=0&&v<=36),null);
    ['0°','18°','36°'].forEach((label,i)=>{
      ctx.textAlign=i===0?'left':i===1?'center':'right';
      text(ctx,label,leftX+70+i*85,1550,8.5,750,MUTED);
    });
    ctx.textAlign='left';
    let lgx=leftX+260;
    ctx.beginPath();ctx.moveTo(lgx,1525);ctx.quadraticCurveTo(lgx+5,1531,lgx,1535);ctx.quadraticCurveTo(lgx-5,1531,lgx,1525);
    ctx.fillStyle=BLUE;ctx.fill();
    text(ctx,'Yağış mm',lgx+9,1534,9,750,MUTED);
    lgx=leftX+18;
    const markLegend:Array<[string,(x:number,y:number)=>void]>=[
      ['Sulama',(mx,my)=>circleIcon(ctx,mx,my,6,BLUE,'S',WHITE,7.5)],
      ['Gübre',(mx,my)=>circleIcon(ctx,mx,my,6,GREEN_DARK,'G',WHITE,7.5)],
      ['Uydu haritası',(mx,my)=>{ctx.beginPath();ctx.arc(mx,my,4.5,0,Math.PI*2);ctx.fillStyle=GREEN;ctx.fill();}],
      ['Radar',(mx,my)=>{ctx.save();ctx.translate(mx,my);ctx.rotate(Math.PI/4);ctx.fillStyle='#5146c9';ctx.fillRect(-4,-4,8,8);ctx.restore();}],
    ];
    markLegend.forEach(([label,draw])=>{
      draw(lgx+6,1570);
      text(ctx,label,lgx+16,1573.5,9,750,MUTED);
      font(ctx,9,750);lgx+=ctx.measureText(label).width+34;
    });
  }


  // MIDDLE COLUMN
  rr(ctx, midX, top, midW, 384, 15, '#f8fcf9', LINE);
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
  chart(ctx, midX + 14, top + 166, midW - 28, 136, sat, { start: pStart, end: pEnd, activities });
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

  const irrSynth=layerPayload(latestLayer(snapshot,'irrigation-synthesis'));
  const deficitMm=metricNumber(irrSynth,'currentDeficitMm');
  const thresholdMm=metricNumber(irrSynth,'stressThresholdMm');
  const currentKc=metricNumber(irrSynth,'currentKc');
  const stageLabel=String(irrSynth?.metrics?.stageLabel??'').trim();
  const decision=String(irrSynth?.metrics?.decision??'').toLowerCase();
  const decisionLabel=decision==='wait'?'Şimdilik bekle':decision==='irrigate'||decision==='irrigate_now'?'Sulama zamanı':decision==='soon'?'Yakında sula':'';
  const hasIrrigationEvidence=ndmiValue!==null||need.mm!==null||deficitMm!==null;
  rr(ctx,midX,512,midW,204,15,hasIrrigationEvidence?'#f7faff':'#f4f9ff',LINE);
  sectionHeader(ctx,midX+10,520,2,
    hasIrrigationEvidence?'Su ve Sulama Analizi':'Sulama Kararının Sınırları',BLUE,'●');
  if(hasIrrigationEvidence){
    const waterCards=[
      {title:'NDMI (bitki nem)',main:numericIndexText(ndmiValue),sub:'Toprak nem sensörü değil',accent:BLUE},
      need.mm===null&&deficitMm!==null
        ? {title:'Toprak Su Açığı',main:numTr(deficitMm)+' mm',
           sub:[thresholdMm!==null?`Stres eşiği ${numTr(thresholdMm,0)} mm`:'',decisionLabel].filter(Boolean).join(' · ')||'Sulama modeli',
           accent:thresholdMm!==null&&deficitMm>=thresholdMm*0.7?RED:thresholdMm!==null&&deficitMm>=thresholdMm*0.4?ORANGE:GREEN}
        : {title:'Sulama İhtiyacı',main:need.mm===null?'—':numTr(need.mm)+' mm',sub:need.mm===null?'Model kanıtı eksik':'Kayıtlı model kararı',accent:BLUE},
      !valid(ndmiCmp.pct)&&currentKc!==null
        ? {title:'Ürün Katsayısı (Kc)',main:numTr(currentKc,2),sub:stageLabel||'Fenoloji evresi',accent:GREEN}
        : {title:'Nem Eğilimi',main:valid(ndmiCmp.pct)?(ndmiCmp.pct < -5?'Azalıyor':ndmiCmp.pct>5?'Artıyor':'Dengeli'):'—',
           sub:valid(ndmiCmp.pct)?'Dönem NDMI kıyası':'İki ölçüm gerekli',accent:GREEN},
    ];
    waterCards.forEach((card,index)=>{
      const x=midX+14+index*124;
      rr(ctx,x,566,116,132,10,index===0?BLUE_SOFT:index===1?'#f3f8ff':GREEN_SOFT,LINE);
      ctx.textAlign='center';
      fittedText(ctx,card.title,x+58,589,104,8.5,750,MUTED);
      fittedText(ctx,card.main,x+58,628,101,14,900,
        index===0&&ndmiValue!==null?scaleColor(ndmiValue,NDMI_STOPS):card.accent);
      ctx.textAlign='left';
      if(index===1&&card.title==='Toprak Su Açığı'&&deficitMm!==null&&thresholdMm!==null&&thresholdMm>0){
        // deficit vs stress threshold
        rr(ctx,x+12,641,92,7,3.5,'#e6ecef','');
        rr(ctx,x+12,641,Math.max(7,92*clamp(deficitMm/thresholdMm,0,1)),7,3.5,card.accent,'');
        text(ctx,'0',x+12,660,7.8,700,MUTED);
        ctx.textAlign='right';text(ctx,'eşik',x+104,660,7.8,700,MUTED);ctx.textAlign='left';
        wrap(ctx,card.sub,x+9,680,9,750,MUTED,98,1.2,2);
      }else if(index===0&&ndmiValue!==null){
        gradientBar(ctx,x+12,641,92,7,NDMI_STOPS,ndmiValue);
        text(ctx,'kuru',x+12,660,7.8,700,MUTED);
        ctx.textAlign='right';text(ctx,'nemli',x+104,660,7.8,700,MUTED);ctx.textAlign='left';
        wrap(ctx,card.sub,x+9,680,9,750,MUTED,98,1.2,2);
      }else{
        wrap(ctx,card.sub,x+9,664,9,750,MUTED,98,1.2,3);
      }
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
      : 'SoilGrids · sonradan alınan model referansı',midX+18,780,235,9.5,900,GREEN_DARK);
    text(ctx,'pH',midX+18,803,10,800,INK);
    ctx.textAlign='right';
    text(ctx,soilGrids.ph===null?'—':soilGrids.ph.toLocaleString('tr-TR',{maximumFractionDigits:1}),
      midX+248,803,11.5,900,soilGrids.ph===null?MUTED:scaleColor(soilGrids.ph,PH_STOPS));
    ctx.textAlign='left';
    gradientBar(ctx,midX+18,810,230,9,PH_STOPS,soilGrids.ph);
    text(ctx,'Asidik',midX+18,832,8.3,700,MUTED);
    ctx.textAlign='center';text(ctx,'Nötr',midX+18+230*(7-4)/5,832,8.3,700,MUTED);
    ctx.textAlign='right';text(ctx,'Bazik',midX+248,832,8.3,700,MUTED);
    text(ctx,soilGrids.carbon===null?'—':`${soilGrids.carbon.toLocaleString('tr-TR',{maximumFractionDigits:1})} g/kg`,
      midX+248,854,10.5,900,INK);
    ctx.textAlign='left';
    text(ctx,'Organik karbon',midX+18,854,10,800,INK);
    text(ctx,'Kil / silt / kum',midX+18,876,10,800,INK);
    const tex=[[soilGrids.clay,TEXTURE_COLORS.clay,WHITE],[soilGrids.silt,TEXTURE_COLORS.silt,INK],[soilGrids.sand,TEXTURE_COLORS.sand,INK]] as const;
    if(tex.every(([v])=>valid(v))){
      const sum=tex.reduce((a,[v])=>a+(v as number),0);
      let bx=midX+18;
      ctx.save();ctx.beginPath();ctx.roundRect(midX+18,883,230,16,8);ctx.clip();
      tex.forEach(([v,color,ink])=>{
        const bw=230*(v as number)/sum;
        ctx.fillStyle=color;ctx.fillRect(bx,883,bw+0.5,16);
        if(bw>34){ctx.textAlign='center';text(ctx,`%${Math.round(v as number)}`,bx+bw/2,895,8.8,850,ink);ctx.textAlign='left';}
        bx+=bw;
      });
      ctx.restore();
    }else{
      text(ctx,'—',midX+130,876,10,850,MUTED);
    }
    fittedText(ctx,'Model tahmini · laboratuvar değildir; gübre dozu çıkarılmaz.',midX+18,920,232,8.4,700,MUTED);
  } else {
    text(ctx, 'Toprak model ölçümü bekleniyor', midX + 18, 809, 10, 850, MUTED);
    wrap(ctx, 'Uygun veri gelmeden besin miktarı ve pH tahmini yapılmaz.',
      midX + 18, 841, 9.5, 650, MUTED, 232, 1.25, 3);
  }
  const texture=soilGrids.available&&valid(soilGrids.clay)&&valid(soilGrids.silt)&&valid(soilGrids.sand)
    ? textureClass(soilGrids.clay,soilGrids.silt,soilGrids.sand) : null;
  if(texture){
    rr(ctx, midX + 260, 784, 112, 130, 9, '#f7ece2', '#ead2bd');
    text(ctx, 'Bünye sınıfı', midX + 271, 804, 9.5, 800, MUTED);
    wrap(ctx, texture, midX + 271, 830, 15, 900, '#8a3f1d', 92, 1.1, 2);
    wrap(ctx, textureHint(texture), midX + 271, texture.length>11?874:856, 8.8, 650, INK, 92, 1.22, 4);
  }else{
    rr(ctx, midX + 260, 784, 112, 130, 9, ORANGE_SOFT, '#f4dfba');
    text(ctx, 'Toprak Kararı', midX + 272, 806, 10, 900, INK);
    wrap(ctx, soilGrids.available
      ? 'SoilGrids yalnız bölgesel referanstır. Parsel gübreleme planı için laboratuvar analizi ekle.'
      : 'Doğrulanmış ölçüm olmadan besin dozu önerilmez.',
      midX + 272, 831, 9.5, 650, MUTED, 90, 1.25, 7);
  }

  rr(ctx,midX,946,midW,250,15,'#f5faff',LINE);
  sectionHeader(ctx,midX+10,954,4,'Dönemin Hava ve İklimi',BLUE,'●');
  fittedText(ctx,`${fmt(pStart,false)} – ${fmt(pEnd,false)} · ${climate.observedDays}/${climate.days} gün`,
    midX+17,1000,150,10,750,MUTED);
  // chart legend
  const wxLegend:[string,string,'bar'|'line'][]=[['Yağış','rgba(22,119,232,.55)','bar'],['Maks.',ORANGE,'line'],['Min.','#2d6fb7','line']];
  let wlx=midX+190;
  wxLegend.forEach(([label,color,kind])=>{
    if(kind==='bar'){ctx.fillStyle=color;ctx.fillRect(wlx,991,8,11);}
    else{ctx.strokeStyle=color;ctx.lineWidth=2.4;ctx.beginPath();ctx.moveTo(wlx-2,997);ctx.lineTo(wlx+12,997);ctx.stroke();}
    text(ctx,label,wlx+16,1000,9,750,MUTED);
    font(ctx,9,750);wlx+=ctx.measureText(label).width+32;
  });
  const frostDays=dailyRows.length===climate.days&&dailyRows.every((d)=>valid(d.tmin))
    ? dailyRows.filter((d)=>d.tmin!<=0).length : null;
  const wxTiles=[
    ['Toplam yağış',climate.totalRain===null?'Eksik':numTr(climate.totalRain)+' mm',BLUE,BLUE_SOFT],
    ['Referans ET₀',climate.totalEt0===null?'Eksik':numTr(climate.totalEt0)+' mm',TEAL,GREEN_SOFT],
    ['30°C+ / donlu gün',`${climate.hotDays??'—'} / ${frostDays??'—'}`,ORANGE,ORANGE_SOFT],
  ] as const;
  wxTiles.forEach(([label,value,accent,soft],i)=>{
    const x=midX+13+i*124;
    rr(ctx,x,1008,116,40,9,soft,LINE);
    fittedText(ctx,label,x+8,1023,100,8.5,750,MUTED);
    fittedText(ctx,value,x+8,1041,100,13.5,900,accent);
  });
  weatherChart(ctx,midX+8,1054,midW-16,112,dailyRows,pStart,pEnd);
  const weatherSource=String((snapshot.weather as any)?.source??'Kayıtlı hava ölçümleri').trim();
  fittedText(ctx,`Kaynak: ${weatherSource} · kayıtlı gözlem, tahmin değil · kırmızı nokta: 30°C+ gün`,
    midX+17,1184,midW-34,8.8,700,MUTED);

  rr(ctx, midX, 1206, midW, 384, 15, '#fcfaff', LINE);
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
    hasPeriodRiskEvidence?'Risk ve Öneri Analizi':'Su Dengesi: Yağış – ET₀',
    hasPeriodRiskEvidence?RED:BLUE,hasPeriodRiskEvidence?'!':'≈');
  if(hasPeriodRiskEvidence){
    // Rows without evidence are listed in one line instead of full cards.
    const shownRisks=riskRows.filter((row)=>row.status!=='Veri eksik');
    const missingRisks=riskRows.filter((row)=>row.status==='Veri eksik');
    shownRisks.forEach((row,index)=>{
      const yy=top+64+index*78;
      rr(ctx,rightX+12,yy-12,rightW-24,74,10,index%2===0?WHITE:'#f1f5f9',LINE);
      ctx.beginPath();ctx.roundRect(rightX+12,yy-12,5,74,[10,0,0,10]);ctx.fillStyle=row.statusAccent;ctx.fill();
      circleIcon(ctx,rightX+34,yy+15,12,row.statusSoft,'●',row.statusAccent,8);
      fittedText(ctx,row.label,rightX+56,yy+18,180,12,900,INK);
      const pillW=95;
      rr(ctx,rightX+rightW-pillW-13,yy-3,pillW,26,12,row.statusSoft,row.statusSoft);
      ctx.textAlign='center';
      fittedText(ctx,row.status,rightX+rightW-pillW/2-13,yy+14,pillW-8,9,850,row.statusAccent);
      ctx.textAlign='left';
      wrap(ctx,englishFree(row.detail),rightX+24,yy+39,10,650,MUTED,rightW-45,1.17,2);
    });
    let ry=top+64+shownRisks.length*78;
    if(missingRisks.length){
      fittedText(ctx,`Kanıt yok: ${missingRisks.map((r)=>r.label.replace(/ Riski$/,'')).join(' · ')}`,
        rightX+16,ry,rightW-32,9.5,750,MUTED);
      ry+=14;
    }
    const wbR=waterBalanceSeries(dailyRows);
    const chartH=top+466-(ry+30);
    if(wbR.series.length>=5&&wbR.end!==null&&chartH>=110){
      text(ctx,'Su dengesi: yağış – ET₀',rightX+16,ry+18,11.5,900,BLUE);
      ctx.textAlign='right';
      text(ctx,`Dönem sonu ${wbR.end>0?'+':''}${numTr(wbR.end,0)} mm`,rightX+rightW-16,ry+18,10.5,900,wbR.end<0?RED:BLUE);
      ctx.textAlign='left';
      rr(ctx,rightX+12,ry+26,rightW-24,chartH,10,WHITE,LINE);
      waterBalanceChart(ctx,rightX+14,ry+30,rightW-28,chartH-8,wbR.series,pStart,pEnd,
        activities.filter((a)=>activityStyle(a.type).label==='Sulama'));
    }
  }else{
    // Recorded rain minus reference ET0, accumulated day by day. Days missing
    // either value are skipped (never filled), and irrigation water is not
    // added because its amount is not recorded reliably.
    const wb=waterBalanceSeries(dailyRows);
    fittedText(ctx,'Biriken yağış eksi referans buharlaşma (ET₀), günlük kayıtlardan',
      rightX+20,top+57,rightW-40,10,750,MUTED);
    if(wb.series.length>=5&&wb.end!==null){
      rr(ctx,rightX+12,top+68,rightW-24,262,10,WHITE,LINE);
      waterBalanceChart(ctx,rightX+14,top+74,rightW-28,250,wb.series,pStart,pEnd,
        activities.filter((a)=>activityStyle(a.type).label==='Sulama'));
      const deficit=wb.deepest&&wb.deepest.value<0?wb.deepest:null;
      const wbCards=[
        ['Dönem sonu',`${wb.end>0?'+':''}${numTr(wb.end,0)} mm`,wb.end<0?'su açığı':'yağış fazlası',wb.end<0?RED:BLUE,wb.end<0?RED_SOFT:BLUE_SOFT],
        ['En derin açık',deficit?`${numTr(deficit.value,0)} mm`:'Açık yok',deficit?fmt(deficit.date,false):'dönem boyunca',ORANGE,ORANGE_SOFT],
        ['Açıkta geçen gün',`${wb.deficitDays} / ${wb.series.length}`,'gün',PURPLE,PURPLE_SOFT],
      ] as const;
      wbCards.forEach(([label,value,sub,accent,soft],i)=>{
        const x=rightX+14+i*124;
        rr(ctx,x,top+342,116,80,10,soft,LINE);
        fittedText(ctx,label,x+9,top+362,100,9,750,MUTED);
        fittedText(ctx,value,x+9,top+390,100,16,900,accent);
        fittedText(ctx,sub,x+9,top+410,100,9,700,MUTED);
      });
      wrap(ctx,'Sulama suyu bu hesaba dahil değildir; S işaretleri kayıtlı sulama tarihleridir. ET₀ referans değerdir, ürünün gerçek tüketimi Kc ile değişir.',
        rightX+18,top+441,9.2,700,MUTED,rightW-36,1.2,2);
    }else{
      rr(ctx,rightX+15,top+70,rightW-30,120,10,WHITE,LINE);
      wrap(ctx,'Su dengesi için dönemde en az 5 günlük yağış ve ET₀ kaydı gerekir. Eksik günler tahminle doldurulmaz.',
        rightX+28,top+98,11,750,INK,rightW-56,1.3,3);
    }
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
    if(stageLabel){
      font(ctx,10.5,850);
      const chip=`Ürün evresi: ${stageLabel}`;
      const cw=Math.min(rightW-56,ctx.measureText(chip).width+24);
      rr(ctx,rightX+25,766,cw,26,13,ORANGE_SOFT,'#f6d6b4');
      fittedText(ctx,chip,rightX+37,783,cw-22,10.5,850,'#b45309');
    }else{
      fittedText(ctx,'Eksik tahmini bir değere dönüştürmedik.',
        rightX+27,784,rightW-56,10.3,850,ORANGE);
    }
  }

  // Sentinel-1 radar was collected by the worker but never printed. It sees
  // through cloud, so it complements the optical maps instead of repeating
  // the photo diagnosis already shown in section 5.
  const radarPts=(snapshot.radar?.points??[])
    .filter((p)=>p.date>=pStart&&p.date<=pEnd)
    .sort((a,b)=>a.date.localeCompare(b.date));
  const radarKey:'vv'|'vh'=radarPts.filter((p)=>valid(p.vv)).length>=radarPts.filter((p)=>valid(p.vh)).length?'vv':'vh';
  const radarSeries=radarPts.filter((p)=>valid(p[radarKey])).map((p)=>({date:p.date,value:p[radarKey] as number}));
  const radarImgs=[...(snapshot.radar?.images??[])].sort((a,b)=>a.date.localeCompare(b.date)).slice(-2);
  const hasRadar=radarImgs.length>0||radarSeries.length>0;
  if(hasRadar){
    const RADAR='#5146c9';
    rr(ctx,rightX,830,rightW,330,15,'#f7f6ff',LINE);
    sectionHeader(ctx,rightX+10,838,8,'Radar Görünümü (Sentinel-1)',RADAR,'◉');
    fittedText(ctx,'Bulutlu günlerde de ölçer · yüzey nemi ve bitki yapısına duyarlı',
      rightX+20,878,rightW-40,9.8,750,MUTED);
    if(radarImgs.length){
      const gap=10,imgW=radarImgs.length===2?(rightW-24-gap)/2:rightW-24;
      for(let i=0;i<radarImgs.length;i+=1){
        const img=radarImgs[i];
        const ix=rightX+12+i*(imgW+gap);
        await drawImage(ctx,img.imageUrl,ix,888,imgW,124,{cover:false,radius:9,placeholder:'Radar görüntüsü açılamadı'});
        const chip=`${radarImgs.length===2&&i===0?'Önceki':'Son'} · ${fmt(img.date,false)}`;
        font(ctx,9,850);
        const cw=ctx.measureText(chip).width+16;
        rr(ctx,ix+6,894,cw,20,10,'rgba(16,20,48,.78)','');
        text(ctx,chip,ix+14,908,9,850,WHITE);
      }
    }
    if(radarSeries.length>=2){
      text(ctx,`${radarKey.toUpperCase()} geri saçılımı (dB)`,rightX+18,1030,9.5,850,RADAR);
      const last=radarSeries.at(-1)!,prev=radarSeries.at(-2)!;
      const delta=last.value-prev.value;
      ctx.textAlign='right';
      text(ctx,`Son: ${numTr(last.value,1)} dB (${delta>=0?'+':''}${numTr(delta,1)})`,rightX+rightW-16,1030,9.5,850,INK);
      ctx.textAlign='left';
      miniLine(ctx,rightX+8,1036,rightW-16,78,radarSeries,pStart,pEnd,RADAR,(v)=>numTr(v,1));
    }else{
      wrap(ctx,radarSeries.length
        ? `Dönemde tek radar ölçümü var: ${radarKey.toUpperCase()} ${numTr(radarSeries[0].value,1)} dB (${fmt(radarSeries[0].date,false)}). Eğilim için ikinci ölçüm gerekir.`
        : 'Dönem için sayısal radar ölçümü arşivlenmedi; yalnız görüntüler gösteriliyor.',
        rightX+18,1046,10.5,700,INK,rightW-36,1.3,3);
    }
    const orbits=new Set(radarPts.map((p)=>`${p.orbitDirection??''}${p.relativeOrbit??''}`));
    wrap(ctx,'Geri saçılım toprak yüzeyi ıslandıkça genelde artar; pürüzlülük ve bitki örtüsü de etkiler. Tek başına sulama veya hastalık kanıtı değildir.'
      +(orbits.size>1?' Ölçümler farklı yörüngelerden; küçük farkları yorumlama.':''),
      rightX+18,1124,8.8,700,MUTED,rightW-36,1.18,3);
  }else{
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
  }

  rr(ctx, rightX, 1170, rightW, 250, 15, '#f7fbf8', LINE);
  sectionHeader(ctx,rightX+10,1178,9,
    isHistoricalReport?'Bu Raporun Veri Kaynakları':"Pusula'nın Kısa Aksiyonları",GREEN,'✓');
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
  if(isHistoricalReport){
    // What actually fed this report, at a glance (replaces three fixed sentences).
    const numericDateCount=new Set(sat.filter((p)=>VEGETATION_INDICES.some((v)=>valid(p[v.key]))).map((p)=>p.date)).size;
    const coverage:Array<[string,string,boolean,string]>=[
      ['Uydu haritası',`${imagePoints.length} tarih`,imagePoints.length>0,GREEN],
      ['Sayısal indeks',`${numericDateCount} tarih`,numericDateCount>0,TEAL],
      ['Hava kaydı',`${climate.observedDays}/${climate.days} gün`,climate.observedDays>0,BLUE],
      ['Radar',`${radarSeries.length} ölçüm · ${radarImgs.length} görüntü`,hasRadar,'#5146c9'],
      ['Toprak',soilRows.some((r)=>r.value!==null)?'Laboratuvar':soilGrids.available?'SoilGrids modeli':'Yok',
        soilRows.some((r)=>r.value!==null)||soilGrids.available,'#a74627'],
      ['Tarla işlemi',`${activities.length} kayıt`,activities.length>0,ORANGE],
    ];
    coverage.forEach(([label,value,ok,accent],i)=>{
      const col=i%2,row=Math.floor(i/2);
      const x=rightX+14+col*188,y=1222+row*60;
      rr(ctx,x,y,180,52,10,ok?WHITE:'#f1f3f4',ok?LINE:'#e3e7e9');
      ctx.beginPath();ctx.roundRect(x,y,5,52,[10,0,0,10]);ctx.fillStyle=ok?accent:'#c5ced3';ctx.fill();
      circleIcon(ctx,x+26,y+26,11,ok?accent:'#c5ced3',ok?'✓':'–',WHITE,11);
      fittedText(ctx,label,x+44,y+22,128,10.5,850,ok?INK:MUTED);
      fittedText(ctx,value,x+44,y+40,128,9.5,750,ok?accent:MUTED);
    });
  }else{
    actions.forEach(([titleValue, value, accent, soft], index) => {
      const x = rightX + 14 + index * 124;
      rr(ctx, x, 1224, 116, 176, 9, soft, soft);
      text(ctx, titleValue, x + 10, 1247, 9.5, 900, accent);
      wrap(ctx, value, x + 10, 1275, 9.2, 650, INK, 96, 1.28, 7);
    });
  }

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
  await brandBand(ctx, 12, 1604, 1216, 138, 2,
    [...sat].reverse().find((p)=>p.ndviImage)?.ndviImage ?? bandPhoto, 0.85);
  const footLogo = await logoBadge(ctx, 66, 1660, 32);
  const footX = footLogo ? 108 : 34;
  text(ctx, 'TarlaPusula', footX, 1660, 25, 900, WHITE);
  text(ctx, 'TARLANIN AKLI, YANINDA.', footX + 2, 1681, 9.5, 800, '#a9e6cd');
  wrap(ctx, 'Uydu · Hava · Toprak · Saha verisiyle hazırlandı.', 32, 1716, 9.5, 700, '#c8eadb', 240, 1.2, 1);
  rr(ctx, 277, 1617, 541, 111, 12, 'rgba(255,255,255,.10)', 'rgba(255,255,255,.22)');
  rr(ctx, 835, 1617, 377, 111, 12, 'rgba(255,255,255,.95)', '');
  footerSocial(ctx, 286, 1634, '◎', '#e1306c', 'Instagram', '@tarlapusula');
  footerSocial(ctx, 465, 1634, 'f', '#1877f2', 'Facebook', 'tarlapusula');
  footerSocial(ctx, 632, 1634, '✉', '#15936a', 'E-posta', 'tarlapusula@gmail.com');
  ctx.strokeStyle = 'rgba(255,255,255,.18)';
  ctx.beginPath(); ctx.moveTo(292, 1682); ctx.lineTo(803, 1682); ctx.stroke();
  text(ctx, 'Tarlanı her hafta takip et', 292, 1706, 13, 900, WHITE);
  text(ctx, 'Uygulamayı indir, PusulaPDF raporların otomatik hazırlansın.', 292, 1722, 9.5, 700, '#c8eadb');
  // Store links come from env; until they exist, the QR opens the web app.
  drawQr(ctx, ANDROID_URL, 845, 1621, 'android', ANDROID_URL===APP_WEB_URL?'Web uygulaması':'Google Play');
  drawQr(ctx, IOS_URL, 1027, 1621, 'ios', 'App Store');

  imageBlobCache.clear();
  return canvas;
}

export async function generatePusulaPdf(snapshot: PusulaPdfSnapshot) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  // Stored report links expire; re-sign them so old reports keep their images.
  const fresh = await refreshPusulaPdfImageUrls(snapshot).catch(() => snapshot);
  const canvas = await renderPusulaPdfCanvas(fresh);
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
