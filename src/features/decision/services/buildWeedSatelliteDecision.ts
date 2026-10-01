import type { WeedSatelliteScreeningSignal } from '../../weed/services/weedSatelliteIntelligence.service';
import type { HomeDecisionEvent } from '../types/homeDecision';

function trDate(value: string | null) {
  if (!value) return '';
  const parsed = new Date(`${value}T12:00:00`);
  if (!Number.isFinite(parsed.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(parsed);
}

export function buildWeedSatelliteDecision(
  fieldIdInput: string | number | null | undefined,
  signal: WeedSatelliteScreeningSignal | null | undefined,
): HomeDecisionEvent | null {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId || !signal) return null;
  if (signal.status !== 'watch' && signal.status !== 'persistent-watch') return null;

  const area = signal.strongestArea || signal.candidateAreas[0]?.area || 'tarla geneli';
  const persistent = signal.persistence === 'persistent';
  const expanding = signal.spread === 'expanding';
  const multiple = signal.candidateAreaCount > 1;

  const title = expanding
    ? `Yabancı Ot Uydu Şüphesi Yayılıyor · ${area}`
    : persistent
      ? `Kalıcı Yabancı Ot Uydu Şüphesi · ${area}`
      : multiple
        ? `${signal.candidateAreaCount} Bölgede Yabancı Ot Uydu Şüphesi`
        : `Yabancı Ot Uydu Şüphesi · ${area}`;

  const sceneLabel = trDate(signal.sceneDate);
  const detail = [
    `${area} bölümünde ürünün fenolojik evresine göre sıra dışı güçlü ve yerel yeşillenme deseni görüldü.`,
    persistent ? 'Aynı bölge önceki farklı uydu taramasında da benzer sinyal verdi.' : '',
    expanding ? 'Şüpheli bölge sayısı önceki taramaya göre arttı.' : '',
    'Bu bir yabancı ot tür teşhisi değildir; alanı sahada kontrol edip fotoğrafla doğrula.',
  ].filter(Boolean).join(' ');

  const confidence = signal.confidencePercent >= 72
    ? 'medium' as const
    : 'preliminary' as const;

  const priority = expanding ? 101 : persistent ? 97 : 88;

  return {
    signal: {
      status: 'ready',
      observedAt: signal.sceneDate,
      maxAgeHours: 30 * 24,
    },
    id: `weed-satellite:${fieldId}:${signal.sceneDate ?? 'latest'}:${area}`,
    group: 'weed-satellite',
    source: 'satellite',
    sourceModel: `weed-satellite-screening:${signal.method}`,
    priority,
    severity: expanding || persistent ? 'warning' : 'info',
    target: 'map_vegetation',
    // Ürün kararı: uydu yabancı ot şüphesi görev veya Bugün kartı üretmez.
    // Yalnızca Bildirimler'e düşer; hedef yine bitki/NDVI haritasıdır.
    channels: ['notification'],
    kind: 'check',
    label: 'YABANCI OT',
    title,
    detail,
    evidence: [
      ...signal.evidence,
      sceneLabel ? `Uydu tarihi: ${sceneLabel}.` : '',
      `Uydu yabancı ot tarama güveni: %${signal.confidencePercent}.`,
      'Sentinel-2 yabancı ot türünü doğrudan teşhis etmez; bu çıktı saha doğrulaması için aday alan üretir.',
    ].filter(Boolean).slice(0, 10),
    confidence,
    notification: {
      iconKey: 'leaf',
      iconTone: 'gold',
      dotTone: expanding || persistent ? 'warning' : 'info',
    },
  };
}
