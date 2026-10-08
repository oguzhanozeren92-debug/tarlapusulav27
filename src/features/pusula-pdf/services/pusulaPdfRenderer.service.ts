import { jsPDF } from 'jspdf';
import type { PusulaPdfFieldPhoto, PusulaPdfSatellitePoint, PusulaPdfSnapshot } from '../types';
import type { PusulaInsight } from './pusulaPdfInsights.service';
import { buildPusulaPdfGuidance } from './pusulaPdfInsights.service';

const W = 1240;
const H = 1754;
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
const num = (value: unknown, digits = 2) => valid(value) ? value.toFixed(digits) : '—';

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('PDF çizim alanı oluşturulamadı.');
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

function logo(ctx: CanvasRenderingContext2D, x: number, y: number, compact = false) {
  const r = compact ? 24 : 30;
  const g = ctx.createLinearGradient(x - r, y - r, x + r, y + r);
  g.addColorStop(0, '#35c760');
  g.addColorStop(1, '#06763d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.roundRect(x - r, y - r, r * 2, r * 2, compact ? 13 : 17);
  ctx.fill();

  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = WHITE;
  ctx.lineWidth = compact ? 2.5 : 3;
  ctx.beginPath();
  ctx.moveTo(-5, 13);
  ctx.quadraticCurveTo(-6, -8, 12, -17);
  ctx.stroke();
  ctx.fillStyle = '#dcffe4';
  ctx.beginPath();
  ctx.ellipse(-8, -6, 10, 5, -0.65, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(8, -1, 11, 5.5, 0.55, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  text(ctx, 'TarlaPusula', x + r + 12, y - 1, compact ? 24 : 31, 900, INK);
  text(ctx, 'TARLANIN AKLI, YANINDA.', x + r + 14, y + (compact ? 20 : 24), compact ? 9 : 11, 800, MUTED);
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

function weatherRows(snapshot: PusulaPdfSnapshot) {
  const w: any = snapshot.weather;
  const candidates = [w?.forecast, w?.daily, w?.history];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length) return candidate;
  }
  if (Array.isArray(w?.providers)) {
    return w.providers.flatMap((provider: any) => provider?.forecast ?? provider?.daily ?? provider?.history ?? []);
  }
  return [];
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
    const n = Number(metrics?.[key]);
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

function shortStatus(value: string, fallback = 'Takip') {
  const normalized = String(value ?? '').toLocaleLowerCase('tr-TR');
  if (/yüksek|kritik|severe|high/.test(normalized)) return 'Yüksek';
  if (/orta|medium|moderate|attention|partial/.test(normalized)) return 'Orta';
  if (/düşük|dusuk|low|normal|ready|healthy|good|aligned/.test(normalized)) return 'Düşük';
  return value ? String(value).slice(0, 16) : fallback;
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
  const usable = points.filter((point) => valid(point.ndvi));
  if (usable.length < 2) {
    wrap(ctx, 'NDVI trend grafiği için en az iki tarihli ölçüm gerekli.', x + 16, y + 55, 12, 650, MUTED, w - 32, 1.25, 3);
    return;
  }

  const gx = x + 38;
  const gy = y + 42;
  const gw = w - 54;
  const gh = h - 66;

  ctx.strokeStyle = '#e8edef';
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const yy = gy + (i * gh) / 3;
    ctx.beginPath();
    ctx.moveTo(gx, yy);
    ctx.lineTo(gx + gw, yy);
    ctx.stroke();
  }

  ctx.strokeStyle = GREEN;
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  usable.forEach((point, index) => {
    const px = gx + (index / (usable.length - 1)) * gw;
    const py = gy + gh - clamp(point.ndvi as number, 0, 1) * gh;
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();

  usable.forEach((point, index) => {
    const px = gx + (index / (usable.length - 1)) * gw;
    const py = gy + gh - clamp(point.ndvi as number, 0, 1) * gh;
    ctx.fillStyle = GREEN;
    ctx.beginPath();
    ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const latest = usable.at(-1)!;
  const px = gx + gw;
  const py = gy + gh - clamp(latest.ndvi as number, 0, 1) * gh;
  rr(ctx, px - 50, py - 34, 50, 26, 8, GREEN, GREEN);
  ctx.textAlign = 'center';
  text(ctx, num(latest.ndvi), px - 25, py - 16, 11, 900, WHITE);
  ctx.textAlign = 'left';

  const labels = [usable[0], usable[Math.floor((usable.length - 1) / 2)], latest];
  labels.forEach((point, index) => {
    const labelX = index === 0 ? gx : index === 2 ? gx + gw : gx + gw / 2;
    ctx.textAlign = index === 0 ? 'left' : index === 2 ? 'right' : 'center';
    text(ctx, fmt(point.date, false), labelX, y + h - 8, 9.5, 650, MUTED);
  });
  ctx.textAlign = 'left';
}

function donut(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  value: number | null,
  accent: string,
  suffix = '',
) {
  ctx.strokeStyle = '#e4eaed';
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  if (value !== null) {
    const pct = clamp(value, 0, 100) / 100;
    ctx.strokeStyle = accent;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * pct);
    ctx.stroke();
    ctx.lineCap = 'butt';
  }

  ctx.textAlign = 'center';
  text(ctx, value === null ? '—' : `${Math.round(value)}${suffix}`, x, y + 9, 23, 900, INK);
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

function fieldHealthScore(snapshot: PusulaPdfSnapshot) {
  const candidates = [
    latestLayer(snapshot, 'field-health-score'),
    latestLayer(snapshot, 'plant-health-synthesis'),
    latestLayer(snapshot, 'satellite-fusion'),
  ].map(layerPayload).filter(Boolean);

  for (const candidate of candidates) {
    const value = metricNumber(candidate, 'healthScore', 'fieldHealthScore', 'score');
    if (value !== null) return clamp(value, 0, 100);
  }
  return null;
}

function phenologyLabel(snapshot: PusulaPdfSnapshot, guidance: ReturnType<typeof buildPusulaPdfGuidance>) {
  const pcse = layerPayload(latestLayer(snapshot, 'phenology-pcse-wofost'));
  const fromLayer = detailText(pcse, 'stageLabel', 'phenologyStage', 'stage');
  if (fromLayer) return fromLayer;
  const insight = guidance.insights.find((item) => item.id === 'pcse-wofost-phenology-evidence');
  const fromEvidence = evidenceValue(insight, ['Evre', 'Fenoloji']);
  return fromEvidence || 'Takipte';
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
  const kgHa = Number(metrics.currentYieldKgHa ?? metrics.forecastCentralKgHa);
  const yieldKgDa = Number.isFinite(kgHa) ? kgHa / 10 : null;
  const quality = String(details.qualityGrade ?? metrics.qualityScore ?? '').trim();
  const expected = String(details.expectedHarvestDate ?? details.harvestTiming?.centralDate ?? '').trim();
  return {
    yieldKgDa,
    quality: quality || 'Ölçüm bekleniyor',
    harvest: expected ? fmt(expected, false) : 'Takipte',
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

function riskItems(snapshot: PusulaPdfSnapshot, guidance: ReturnType<typeof buildPusulaPdfGuidance>) {
  const find = (id: string) => guidance.insights.find((item) => item.id === id);
  const drought = find('water-scarcity-plan-evidence') ?? find('irrigation-synthesis-evidence');
  const disease = find('plant-health-synthesis-evidence');
  const frost = find('frost-pocket-evidence');
  const disaster = find('disaster-recovery-evidence');
  const multi = find('multi-stress-synthesis-evidence');

  const rows = [
    {
      label: 'Kuraklık Stresi',
      detail: drought?.meaning ?? 'Su baskısı için yeterli kanıt yok.',
      status: shortStatus(evidenceValue(drought, ['Risk seviyesi', 'Durum']) || drought?.confidence || ''),
      accent: ORANGE,
    },
    {
      label: 'Hastalık Riski',
      detail: disease?.meaning ?? 'Belirti temelli risk sinyali yok.',
      status: shortStatus(evidenceValue(disease, ['Risk seviyesi']) || disease?.confidence || ''),
      accent: GREEN,
    },
    {
      label: 'Zararlı Riski',
      detail: multi?.meaning ?? 'Zararlı saha gözlemiyle doğrulanmalı.',
      status: shortStatus(multi?.confidence || '', 'Takip'),
      accent: ORANGE,
    },
    {
      label: 'Don Riski',
      detail: frost?.meaning ?? disaster?.meaning ?? 'Güncel don riski kanıtı yok.',
      status: shortStatus(evidenceValue(frost, ['Risk', 'Durum']) || frost?.confidence || ''),
      accent: BLUE,
    },
    {
      label: 'Su Baskını Riski',
      detail: disaster?.meaning ?? 'Aşırı yağış sonrası olay sinyali yok.',
      status: shortStatus(evidenceValue(disaster, ['Olay', 'Durum']) || disaster?.confidence || ''),
      accent: TEAL,
    },
  ];

  return rows.map((row) => {
    const style = statusColor(row.status);
    return { ...row, statusAccent: style.accent, statusSoft: style.soft };
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
      const n = Number(latest?.[key]);
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

function summaryCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  titleValue: string,
  value: string,
  sub: string,
  accent: string,
  soft: string,
  symbol: string,
) {
  rr(ctx, x, y, w, 104, 12, soft, soft);
  circleIcon(ctx, x + w / 2, y + 28, 15, accent, symbol, WHITE, 12);
  ctx.textAlign = 'center';
  text(ctx, titleValue, x + w / 2, y + 54, 10, 750, MUTED);
  text(ctx, value, x + w / 2, y + 78, 17, 900, accent);
  text(ctx, sub, x + w / 2, y + 96, 9, 700, INK);
  ctx.textAlign = 'left';
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
  const sat = [...snapshot.satellite.points].sort((a, b) => a.date.localeCompare(b.date));
  const latest = sat.at(-1);
  const weather = weatherRows(snapshot).sort((a, b) => wd(a).localeCompare(wd(b)));
  const photos = [...(snapshot.fieldPhotos ?? [])].sort((a, b) => b.capturedAt.localeCompare(a.capturedAt));
  const latestPhoto = photos[0];
  const secondPhoto = photos[1];
  const diagnosis = photoDiagnosis(latestPhoto);
  const health = fieldHealthScore(snapshot);
  const ndviCmp = periodCompare(sat, 'ndvi');
  const ndmiCmp = periodCompare(sat, 'ndmi');
  const need = irrigationNeed(snapshot, guidance);
  const yieldInfo = yieldSummary(snapshot);
  const riskRows = riskItems(snapshot, guidance);
  const soilRows = latestSoilValues(snapshot);
  const stage = phenologyLabel(snapshot, guidance);
  const location = [snapshot.field.city, snapshot.field.district].filter(Boolean).join(' / ') || 'Konum kaydı yok';

  // Header
  rr(ctx, 12, 12, 1216, 94, 15, WHITE, LINE);
  logo(ctx, 50, 59);
  text(ctx, 'Tarım Analiz Raporu', 372, 48, 19, 900, INK);
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
  text(ctx, 'Tarla Sağlık ve Karar Özeti', leftX + 16, top + 38, 26, 900, INK);
  wrap(ctx, 'Uydu verileri, hava durumu, toprak analizi ve Pusula karar motorlarıyla hazırlanmış premium tarla özeti.', leftX + 16, top + 67, 11.5, 600, MUTED, leftW - 32, 1.28, 3);
  await drawLayeredHero(ctx, latest?.trueColorImage, latest?.ndviImage, leftX + 8, top + 112, leftW - 16, 318);

  const gradient = ctx.createLinearGradient(leftX + 8, top + 300, leftX + 8, top + 430);
  gradient.addColorStop(0, 'rgba(0,0,0,0)');
  gradient.addColorStop(1, 'rgba(0,0,0,.72)');
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(leftX + 8, top + 112, leftW - 16, 318, 15);
  ctx.clip();
  ctx.fillStyle = gradient;
  ctx.fillRect(leftX + 8, top + 112, leftW - 16, 318);
  ctx.restore();

  rr(ctx, leftX + 22, top + 332, 196, 85, 11, 'rgba(5,20,22,.78)', 'rgba(255,255,255,.18)');
  circleIcon(ctx, leftX + 43, top + 353, 11, ORANGE, '●', WHITE, 7);
  text(ctx, snapshot.field.name, leftX + 62, top + 358, 15, 900, WHITE);
  text(ctx, snapshot.field.areaDecare == null ? 'Alan —' : `${snapshot.field.areaDecare.toLocaleString('tr-TR')} da`, leftX + 39, top + 383, 11, 750, WHITE);
  text(ctx, snapshot.field.crop ?? 'Ürün kaydı yok', leftX + 39, top + 402, 11, 750, WHITE);
  text(ctx, location, leftX + 39, top + 421, 10, 700, '#dbe7e7');

  const statY = top + 442;
  const statGap = 7;
  const statW = (leftW - 16 - statGap * 3) / 4;
  const ndmiPercent = valid(latest?.ndmi) ? clamp((latest.ndmi as number) * 100, 0, 100) : null;
  summaryCard(ctx, leftX + 8, statY, statW, 'Tarla Sağlığı', health === null ? '—' : `${Math.round(health)}`, health === null ? 'Skor bekleniyor' : health >= 70 ? 'İyi' : health >= 45 ? 'Takip' : 'Dikkat', GREEN, GREEN_SOFT, '✓');
  summaryCard(ctx, leftX + 8 + (statW + statGap), statY, statW, 'Ana Risk', riskRows[0]?.status ?? 'Takip', riskRows[0]?.label.replace(' Stresi', '') ?? 'Risk', RED, RED_SOFT, '!');
  summaryCard(ctx, leftX + 8 + (statW + statGap) * 2, statY, statW, 'Su Durumu', ndmiPercent === null ? '—' : `%${Math.round(ndmiPercent)}`, ndmiPercent === null ? 'Veri yok' : ndmiPercent >= 45 ? 'Yeterli' : 'Kontrol', BLUE, BLUE_SOFT, '●');
  summaryCard(ctx, leftX + 8 + (statW + statGap) * 3, statY, statW, 'Gelişim Evresi', stage.length > 13 ? stage.slice(0, 12) : stage, snapshot.field.crop ?? 'Ürün', GREEN, GREEN_SOFT, '↑');

  rr(ctx, leftX, 660, leftW, 244, 15, WHITE, LINE);
  text(ctx, 'Tarlanın Bugünkü Görünümü', leftX + 16, 692, 17, 900, INK);
  await drawImage(ctx, latest?.ndviImage, leftX + 16, 710, 182, 150, { radius: 9, placeholder: 'NDVI görüntüsü yok' });
  await drawImage(ctx, latestPhoto?.signedUrl ?? latest?.trueColorImage, leftX + 212, 710, 182, 150, { radius: 9, placeholder: 'Saha fotoğrafı yok' });
  text(ctx, 'NDVI Görüntüsü', leftX + 16, 878, 10, 850, INK);
  text(ctx, latest ? fmt(latest.date, false) : '—', leftX + 16, 894, 9, 650, MUTED);
  text(ctx, latestPhoto ? 'Saha Fotoğrafı' : 'Gerçek Renk', leftX + 212, 878, 10, 850, INK);
  text(ctx, latestPhoto ? fmt(latestPhoto.capturedAt, false) : latest ? fmt(latest.date, false) : '—', leftX + 212, 894, 9, 650, MUTED);

  rr(ctx, leftX, 914, leftW, 230, 15, PURPLE_SOFT, '#e4d6fb');
  circleIcon(ctx, leftX + 34, 945, 18, PURPLE, '✦', WHITE, 14);
  text(ctx, "Pusula'nın Yorumu", leftX + 62, 951, 18, 900, PURPLE);
  wrap(ctx, guidance.weeklySummary, leftX + 20, 985, 12.5, 650, INK, leftW - 40, 1.38, 7);
  const action = guidance.next7Days[0] ?? 'Yeni veri geldikçe tarlanın durumunu tekrar değerlendir.';
  rr(ctx, leftX + 18, 1080, leftW - 36, 48, 9, WHITE, '#e6dcf7');
  text(ctx, '7 GÜN', leftX + 30, 1102, 8.5, 900, PURPLE);
  wrap(ctx, action, leftX + 76, 1098, 10, 750, INK, leftW - 112, 1.15, 2);

  await drawImage(ctx, secondPhoto?.signedUrl ?? latestPhoto?.signedUrl ?? latest?.trueColorImage, leftX, 1154, leftW, 436, { radius: 15, placeholder: 'Saha görseli bekleniyor', overlay: 'rgba(1,25,20,.28)' });
  wrap(ctx, 'Veriye dayalı kararlarla daha güçlü yarınlar.', leftX + 22, 1487, 21, 800, WHITE, leftW - 44, 1.18, 3);
  text(ctx, 'TarlaPusula', leftX + 22, 1562, 13, 850, WHITE);

  // MIDDLE COLUMN
  rr(ctx, midX, top, midW, 384, 15, WHITE, LINE);
  sectionHeader(ctx, midX + 10, top + 8, 1, 'Bitki Sağlığı ve Gelişim Analizi', GREEN, '↑');
  const chipY = top + 54;
  ['NDVI', 'NDRE', 'GNDVI', 'SAVI'].forEach((label, index) => {
    const active = index === 0;
    rr(ctx, midX + 18 + index * 71, chipY, 64, 25, 12, active ? GREEN : WHITE, active ? GREEN : LINE);
    ctx.textAlign = 'center';
    text(ctx, label, midX + 50 + index * 71, chipY + 17, 9, 850, active ? WHITE : MUTED);
    ctx.textAlign = 'left';
  });
  chart(ctx, midX + 10, top + 84, 235, 174, sat);
  await drawImage(ctx, latest?.ndviImage, midX + 255, top + 105, 116, 142, { radius: 8, placeholder: 'NDVI yok' });
  text(ctx, 'NDVI Haritası', midX + 257, top + 265, 9.5, 850, INK);
  text(ctx, latest ? fmt(latest.date, false) : '—', midX + 257, top + 280, 8.5, 650, MUTED);

  const miniY = top + 294;
  const miniW = 86;
  const miniGap = 7;
  const growth = valid(ndviCmp.pct) ? (ndviCmp.pct >= 3 ? 'Artışta' : ndviCmp.pct <= -3 ? 'Geriliyor' : 'Dengeli') : 'Takip';
  const stress = guidance.insights.find((item) => item.id === 'multi-stress-synthesis-evidence');
  const stressStatus = stress ? shortStatus(stress.confidence, 'Takip') : 'Düşük';
  [
    ['Bitki Yoğunluğu', valid(latest?.ndvi) && (latest?.ndvi as number) >= 0.55 ? 'İyi' : 'Takip', GREEN_SOFT, GREEN],
    ['Gelişim Trendi', growth, GREEN_SOFT, GREEN],
    ['Stres Seviyesi', stressStatus, ORANGE_SOFT, ORANGE],
    ['Vigor', valid(latest?.ndvi) && (latest?.ndvi as number) >= 0.5 ? 'Sağlıklı' : 'Takip', GREEN_SOFT, GREEN],
  ].forEach(([label, value, soft, accent], index) => {
    rr(ctx, midX + 18 + index * (miniW + miniGap), miniY, miniW, 75, 9, soft, soft);
    ctx.textAlign = 'center';
    text(ctx, label, midX + 18 + index * (miniW + miniGap) + miniW / 2, miniY + 31, 8.5, 750, MUTED);
    text(ctx, value, midX + 18 + index * (miniW + miniGap) + miniW / 2, miniY + 55, 12, 900, accent);
    ctx.textAlign = 'left';
  });

  rr(ctx, midX, 512, midW, 204, 15, WHITE, LINE);
  sectionHeader(ctx, midX + 10, 520, 2, 'Su ve Sulama Analizi', BLUE, '●');
  const waterCards = [
    { title: 'Toprak Nem Seviyesi', value: ndmiPercent, main: ndmiPercent === null ? '—' : `%${Math.round(ndmiPercent)}`, sub: ndmiPercent === null ? 'Veri yok' : ndmiPercent >= 45 ? 'Yeterli' : 'Kontrol', accent: BLUE },
    { title: 'Sulama İhtiyacı', value: need.mm === null ? null : clamp(need.mm * 2, 0, 100), main: need.text, sub: 'Karar motoru', accent: BLUE },
    { title: 'Su Dengesi', value: valid(ndmiCmp.pct) ? clamp(50 + ndmiCmp.pct, 0, 100) : null, main: valid(ndmiCmp.pct) && ndmiCmp.pct < -5 ? 'Azalıyor' : 'Dengede', sub: valid(ndmiCmp.pct) ? `${ndmiCmp.pct >= 0 ? '+' : ''}%${ndmiCmp.pct.toFixed(0)}` : 'Trend bekleniyor', accent: GREEN },
  ];
  waterCards.forEach((card, index) => {
    const x = midX + 14 + index * 124;
    rr(ctx, x, 566, 116, 132, 10, index === 0 ? BLUE_SOFT : index === 1 ? '#f3f8ff' : GREEN_SOFT, LINE);
    ctx.textAlign = 'center';
    text(ctx, card.title, x + 58, 589, 8.5, 750, MUTED);
    if (index === 0) donut(ctx, x + 58, 635, 34, card.value, card.accent);
    else text(ctx, card.main, x + 58, 645, index === 1 ? 14 : 17, 900, card.accent);
    text(ctx, card.sub, x + 58, 682, 9, 850, index === 1 ? INK : card.accent);
    ctx.textAlign = 'left';
  });

  rr(ctx, midX, 726, midW, 210, 15, WHITE, LINE);
  sectionHeader(ctx, midX + 10, 734, 3, 'Toprak ve Besin Analizi', '#a74627', '●');
  if (soilRows.length) {
    soilRows.forEach((row, index) => {
      const yy = 785 + index * 31;
      text(ctx, row.label, midX + 18, yy, 9.5, 750, INK);
      progressBar(ctx, midX + 105, yy - 10, 110, row.value, row.accent);
      text(ctx, row.text, midX + 226, yy, 9, 850, row.value === null ? MUTED : row.accent);
    });
  } else {
    text(ctx, 'Laboratuvar analizi bekleniyor', midX + 18, 808, 11, 850, MUTED);
    wrap(ctx, 'Toprak/Besin motoru bağlıdır; ölçüm olmadan N-P-K değeri uydurulmaz.', midX + 18, 834, 10.5, 650, MUTED, 230, 1.3, 4);
  }
  rr(ctx, midX + 260, 784, 112, 130, 9, ORANGE_SOFT, '#f4dfba');
  text(ctx, 'Toprak Özeti', midX + 272, 806, 10, 900, INK);
  const soilInsight = guidance.insights.find((item) => item.id === 'soil-intelligence-evidence' || item.id === 'nutrition-decision-guard-evidence');
  wrap(ctx, soilInsight?.meaning ?? 'Toprak kararı gerçek analiz veya doğrulanmış kaynak geldiğinde güçlenir.', midX + 272, 831, 9.5, 650, MUTED, 88, 1.25, 6);

  rr(ctx, midX, 946, midW, 250, 15, WHITE, LINE);
  sectionHeader(ctx, midX + 10, 954, 4, 'Hava ve İklim Analizi', BLUE, '☀');
  const weather5 = weather.slice(0, 5);
  if (weather5.length) {
    weather5.forEach((row, index) => {
      const x = midX + 13 + index * 74;
      rr(ctx, x, 998, 66, 100, 9, index === 0 ? '#f8fbff' : WHITE, LINE);
      ctx.textAlign = 'center';
      text(ctx, index === 0 ? 'Bugün' : fmt(wd(row), false), x + 33, 1017, 8.5, 750, MUTED);
      const temp = wv(row, 'tempMax', 'maxTemp', 'temperature', 'temp', 'tempAvg', 'avgTemp');
      const rain = wv(row, 'precipitation', 'rain', 'precipitationMm');
      text(ctx, rain !== null && rain > 2 ? '☂' : '☀', x + 33, 1054, 19, 900, rain !== null && rain > 2 ? BLUE : ORANGE);
      text(ctx, temp === null ? '—' : `${Math.round(temp)}°`, x + 33, 1082, 17, 900, INK);
      ctx.textAlign = 'left';
    });
  } else {
    wrap(ctx, 'Hava tahmini bu rapor için hazır değil.', midX + 18, 1016, 11, 650, MUTED, midW - 36, 1.25, 2);
  }
  const temps = weather.map((row) => wv(row, 'tempMax', 'maxTemp', 'temperature', 'temp', 'tempAvg', 'avgTemp')).filter(valid);
  const rainTotal = weather.map((row) => wv(row, 'precipitation', 'rain', 'precipitationMm')).filter(valid).reduce((sum, value) => sum + value, 0);
  const weatherBadges = [
    ['Sıcaklık Trendi', temps.length >= 2 && temps.at(-1)! > temps[0] + 2 ? 'Artıyor' : 'Dengeli', ORANGE, ORANGE_SOFT],
    ['Yağış Olasılığı', rainTotal > 10 ? 'Yüksek' : rainTotal > 2 ? 'Orta' : 'Düşük', BLUE, BLUE_SOFT],
    ['Rüzgâr', 'Takip', GREEN, GREEN_SOFT],
  ];
  weatherBadges.forEach(([label, value, accent, soft], index) => {
    const x = midX + 14 + index * 122;
    rr(ctx, x, 1110, 114, 66, 9, soft, soft);
    ctx.textAlign = 'center';
    text(ctx, label, x + 57, 1132, 8, 800, MUTED);
    text(ctx, value, x + 57, 1157, 11, 900, accent);
    ctx.textAlign = 'left';
  });

  rr(ctx, midX, 1206, midW, 384, 15, WHITE, LINE);
  sectionHeader(ctx, midX + 10, 1214, 5, 'Saha Gözlemleri', PURPLE, '▣');
  await drawImage(ctx, latestPhoto?.signedUrl, midX + 16, 1260, 174, 195, { radius: 9, placeholder: 'Saha fotoğrafı yok' });
  await drawImage(ctx, secondPhoto?.signedUrl ?? latest?.trueColorImage, midX + 200, 1260, 174, 195, { radius: 9, placeholder: 'İkinci görsel yok' });
  text(ctx, latestPhoto ? 'Son Saha Fotoğrafı' : 'Fotoğraf Bekleniyor', midX + 16, 1475, 9.5, 850, INK);
  text(ctx, latestPhoto ? fmt(latestPhoto.capturedAt, false) : '—', midX + 16, 1491, 8.5, 650, MUTED);
  text(ctx, secondPhoto ? 'Önceki Saha Fotoğrafı' : 'Genel Görünüm', midX + 200, 1475, 9.5, 850, INK);
  text(ctx, secondPhoto ? fmt(secondPhoto.capturedAt, false) : latest ? fmt(latest.date, false) : '—', midX + 200, 1491, 8.5, 650, MUTED);
  const observationInsight = guidance.insights.find((item) => item.id === 'field-observation-follow-up-evidence');
  rr(ctx, midX + 16, 1510, 358, 62, 9, diagnosis.severity ? RED_SOFT : PURPLE_SOFT, diagnosis.severity ? '#ffd9dc' : '#eadfff');
  wrap(ctx, diagnosis.headline || observationInsight?.title || 'Saha gözlemleri rapora bağlandı.', midX + 28, 1534, 10, 850, diagnosis.severity ? RED : PURPLE, 334, 1.18, 2);
  wrap(ctx, diagnosis.summary || latestPhoto?.notes || observationInsight?.meaning || 'Yeni saha fotoğrafı geldikçe aynı noktadan değişim karşılaştırılır.', midX + 28, 1557, 9, 650, MUTED, 334, 1.2, 2);

  // RIGHT COLUMN
  rr(ctx, rightX, top, rightW, 476, 15, WHITE, LINE);
  sectionHeader(ctx, rightX + 10, top + 8, 6, 'Risk ve Öneri Analizi', RED, '!');
  riskRows.forEach((row, index) => {
    const yy = top + 65 + index * 78;
    circleIcon(ctx, rightX + 34, yy + 18, 15, row.accent === GREEN ? '#eaf8ed' : row.accent === BLUE ? '#edf5ff' : row.accent === TEAL ? '#ebf9f7' : '#fff0e9', '●', row.accent, 8);
    text(ctx, row.label, rightX + 58, yy + 11, 11.5, 850, INK);
    wrap(ctx, row.detail, rightX + 58, yy + 33, 8.7, 600, MUTED, 235, 1.2, 2);
    progressBar(ctx, rightX + 283, yy + 4, 70, row.status === 'Yüksek' ? 92 : row.status === 'Orta' ? 58 : row.status === 'Düşük' ? 24 : 42, row.statusAccent);
    rr(ctx, rightX + 305, yy + 25, 62, 23, 11, row.statusSoft, row.statusSoft);
    ctx.textAlign = 'center';
    text(ctx, row.status, rightX + 336, yy + 41, 8.7, 900, row.statusAccent);
    ctx.textAlign = 'left';
  });

  rr(ctx, rightX, 604, rightW, 216, 15, WHITE, LINE);
  sectionHeader(ctx, rightX + 10, 612, 7, 'Verim, Hasat ve Kalite', ORANGE, '↑');
  const yieldCards = [
    ['Tahmini Verim', yieldInfo.yieldKgDa === null ? '—' : `${Math.round(yieldInfo.yieldKgDa)}`, yieldInfo.yieldKgDa === null ? 'kg/da bekleniyor' : 'kg/da', ORANGE],
    ['Kalite Skoru', yieldInfo.quality.length <= 6 ? yieldInfo.quality : 'Takip', yieldInfo.quality.length <= 6 ? 'Kalite' : yieldInfo.quality.slice(0, 20), GREEN],
    ['Hasat Zamanı', yieldInfo.harvest, 'Tahmini', PURPLE],
  ];
  yieldCards.forEach(([titleValue, value, sub, accent], index) => {
    const x = rightX + 14 + index * 124;
    rr(ctx, x, 655, 116, 145, 10, GRAY_SOFT, LINE);
    ctx.textAlign = 'center';
    text(ctx, titleValue, x + 58, 680, 8.5, 800, MUTED);
    text(ctx, value, x + 58, 726, index === 2 ? 16 : 25, 900, accent);
    text(ctx, sub, x + 58, 754, 9.5, 850, INK);
    if (index === 0 && valid(ndviCmp.pct)) text(ctx, `${ndviCmp.pct >= 0 ? '↑' : '↓'} %${Math.abs(ndviCmp.pct).toFixed(0)} bitki trendi`, x + 58, 782, 8.5, 750, ndviCmp.pct >= 0 ? GREEN : RED);
    ctx.textAlign = 'left';
  });

  rr(ctx, rightX, 830, rightW, 330, 15, WHITE, LINE);
  sectionHeader(ctx, rightX + 10, 838, 8, 'Kritik Gözlem', PURPLE, '!');
  await drawImage(ctx, latestPhoto?.signedUrl ?? latest?.trueColorImage, rightX + 16, 884, 205, 225, { radius: 10, placeholder: 'Kritik gözlem fotoğrafı yok' });
  rr(ctx, rightX + 231, 884, 149, 225, 10, diagnosis.headline ? RED_SOFT : PURPLE_SOFT, diagnosis.headline ? '#ffd8db' : '#e9dcff');
  wrap(ctx, diagnosis.headline || observationInsight?.title || 'Kritik saha gözlemi yok', rightX + 244, 912, 11, 900, diagnosis.headline ? RED : PURPLE, 123, 1.2, 4);
  wrap(ctx, diagnosis.summary || latestPhoto?.notes || observationInsight?.meaning || 'Saha fotoğrafı eklendiğinde Pusula burada kısa gözlem özetini gösterir.', rightX + 244, 982, 9.5, 600, MUTED, 123, 1.28, 8);

  rr(ctx, rightX, 1170, rightW, 250, 15, WHITE, LINE);
  sectionHeader(ctx, rightX + 10, 1178, 9, "Pusula'nın Kısa Aksiyonları", GREEN, '✓');
  const actions = [
    ['Bugün', guidance.next7Days[0] ?? 'Tarlanın güncel durumunu kontrol et.', GREEN, GREEN_SOFT],
    ['Önümüzdeki 7 Gün', guidance.next7Days[1] ?? 'Uydu ve hava trendini takip et.', BLUE, BLUE_SOFT],
    ['İzle ve Planla', guidance.next7Days[2] ?? guidance.dataQualityNote, PURPLE, PURPLE_SOFT],
  ];
  actions.forEach(([titleValue, value, accent, soft], index) => {
    const x = rightX + 14 + index * 124;
    rr(ctx, x, 1224, 116, 176, 9, soft, soft);
    text(ctx, titleValue, x + 10, 1247, 9.5, 900, accent);
    wrap(ctx, value, x + 10, 1275, 9.2, 650, INK, 96, 1.28, 7);
  });

  await drawImage(ctx, latest?.trueColorImage ?? latestPhoto?.signedUrl, rightX, 1430, rightW, 160, { radius: 15, placeholder: 'Tarla görseli', overlay: 'rgba(4,32,25,.28)' });
  logo(ctx, rightX + 34, 1510, true);
  wrap(ctx, 'Tarlanı verilerle izle, kararını güvenle ver.', rightX + 150, 1502, 15, 800, WHITE, 220, 1.2, 3);

  // Premium footer — social + QR
  rr(ctx, 12, 1604, 1216, 138, 15, WHITE, LINE);
  logo(ctx, 52, 1660, true);
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

  doc.addImage(canvas.toDataURL('image/jpeg', 0.97), 'JPEG', 0, 0, 210, 297, undefined, 'FAST');
  doc.setProperties({
    title: `PUSULAPDF - ${snapshot.field.name}`,
    author: 'TarlaPusula',
    creator: 'TarlaPusula PUSULAPDF',
    subject: 'Tek sayfalık premium tarla sağlık ve karar raporu',
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
