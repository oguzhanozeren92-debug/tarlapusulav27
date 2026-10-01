import type { ClimateAnomalyMemory } from './climateAnomalyMemory.service';

export type ClimateAnomalyPusulaNarrative = {
  status: 'ready' | 'partial' | 'needs_data';
  headline: string;
  summary: string;
  evidence: string[];
  actionContext: string | null;
  persistenceKey:
    | 'warm_dry'
    | 'dry'
    | 'warm'
    | 'wet'
    | 'near_normal'
    | 'mixed'
    | 'unknown';
  changesRiskScore: false;
};

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function countLabel(count: number) {
  return Math.max(1, Math.round(count));
}

function latestEvidence(memory: ClimateAnomalyMemory) {
  const latest = memory.latest;
  if (!latest) return [] as string[];

  return [
    latest.temperatureAnomalyC != null
      ? `Son dönem sıcaklık sapması ${latest.temperatureAnomalyC >= 0 ? '+' : ''}${latest.temperatureAnomalyC.toFixed(1)} °C.`
      : '',
    latest.precipitationDeficitPct != null
      ? `Yağış açığı göstergesi %${Math.round(latest.precipitationDeficitPct)}.`
      : '',
    latest.waterBalanceAnomalyMm != null
      ? `Su dengesi sapması ${latest.waterBalanceAnomalyMm >= 0 ? '+' : ''}${latest.waterBalanceAnomalyMm.toFixed(0)} mm.`
      : '',
    latest.soilMoisture7To28Percentile != null
      ? `7–28 cm toprak nemi yüzdeliği ${Math.round(latest.soilMoisture7To28Percentile)}.`
      : '',
  ].filter(Boolean);
}

/**
 * 12.6 — Sezon anomalisi hafızasını Pusula'nın okuyacağı kısa ve deterministik
 * bir anlatıma çevirir. Bu katman yeni risk skoru üretmez; yalnızca süreklilik,
 * yön ve geçmiş karşılaştırma bağlamı sağlar.
 */
export function buildClimateAnomalyPusulaNarrative(
  memory: ClimateAnomalyMemory | null | undefined,
): ClimateAnomalyPusulaNarrative {
  if (!memory?.latest) {
    return {
      status: 'needs_data',
      headline: 'Sezon iklim hafızası henüz oluşmadı',
      summary: '',
      evidence: [],
      actionContext: null,
      persistenceKey: 'unknown',
      changesRiskScore: false,
    };
  }

  const p = memory.persistence;
  const latest = memory.latest;
  const evidence = [
    ...latestEvidence(memory),
    ...(Array.isArray(memory.evidence) ? memory.evidence : []),
  ]
    .map(clean)
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)
    .slice(0, 6);

  const dryCount = Math.max(p.consecutiveDrySnapshots, p.drySnapshots);
  const warmCount = Math.max(p.consecutiveWarmSnapshots, p.warmSnapshots);

  if (p.persistentDry && p.persistentWarm) {
    const together = Math.max(
      1,
      Math.min(
        p.consecutiveDrySnapshots || dryCount,
        p.consecutiveWarmSnapshots || warmCount,
      ),
    );

    return {
      status: memory.status === 'ready' ? 'ready' : 'partial',
      headline: 'Sezon sıcak ve kuru yönde kalıcı sapma gösteriyor',
      summary: `Bu tarla son ${countLabel(together)} iklim karşılaştırmasında normalden daha sıcak ve daha kuru bir desen gösteriyor. Bu süreklilik kısa vadeli tahminin yerine geçmez; Pusula bunu sezon bağlamı olarak kullanır.`,
      evidence,
      actionContext:
        'Su durumu, kök bölgesi nemi ve güncel hava tahminini birlikte kontrol et; sezon hafızasını tek başına sulama kararı olarak kullanma.',
      persistenceKey: 'warm_dry',
      changesRiskScore: false,
    };
  }

  if (p.persistentDry) {
    return {
      status: memory.status === 'ready' ? 'ready' : 'partial',
      headline: 'Kurak sapma sezon hafızasında kalıcı',
      summary: `Kurak sapma son ${countLabel(dryCount)} iklim karşılaştırmasında tekrar ediyor. Pusula bunu tek günlük yağıştan ayrı bir sezon eğilimi olarak değerlendirir.`,
      evidence,
      actionContext:
        'Kök bölgesi nemi, yağış kaydı ve sulama kararını birlikte değerlendir; hafıza tek başına sulama emri değildir.',
      persistenceKey: 'dry',
      changesRiskScore: false,
    };
  }

  if (p.persistentWarm) {
    return {
      status: memory.status === 'ready' ? 'ready' : 'partial',
      headline: 'Sıcak sapma sezon hafızasında kalıcı',
      summary: `Sıcak sapma son ${countLabel(warmCount)} iklim karşılaştırmasında tekrar ediyor. Pusula bunu anlık sıcaklıktan ayrı bir sezon eğilimi olarak değerlendirir.`,
      evidence,
      actionContext:
        'Güncel maksimum sıcaklık, bitki evresi ve su durumunu birlikte kontrol et; sezon hafızası kısa vadeli tahmin değildir.',
      persistenceKey: 'warm',
      changesRiskScore: false,
    };
  }

  if (p.wetSnapshots >= 3 || memory.trend === 'wetting') {
    return {
      status: memory.status === 'ready' ? 'ready' : 'partial',
      headline: 'Sezon daha ıslak yönde ilerliyor',
      summary: `Son iklim karşılaştırmalarında daha ıslak yönde bir desen oluşuyor${p.wetSnapshots >= 3 ? `; yakın geçmişte ${p.wetSnapshots} kayıt ıslak sapma gösterdi` : ''}.`,
      evidence,
      actionContext:
        'Yağış sonrası drenaj ve yüzey suyu sinyallerini güncel radar/saha gözlemiyle doğrula.',
      persistenceKey: 'wet',
      changesRiskScore: false,
    };
  }

  if (latest.seasonState === 'near_normal' && memory.trend === 'stable') {
    return {
      status: memory.status === 'ready' ? 'ready' : 'partial',
      headline: 'Sezon karşılaştırması normale yakın',
      summary: 'Son iklim karşılaştırması belirgin kalıcı sıcak, kuru veya ıslak sapma göstermiyor.',
      evidence,
      actionContext: null,
      persistenceKey: 'near_normal',
      changesRiskScore: false,
    };
  }

  const trendText =
    memory.trend === 'drying'
      ? 'Son iki karşılaştırmada kuruma yönü güçleniyor.'
      : memory.trend === 'warming'
        ? 'Son iki karşılaştırmada sıcak sapma artıyor.'
        : memory.trend === 'cooling'
          ? 'Son iki karşılaştırmada serinleme yönü var.'
          : memory.trend === 'wetting'
            ? 'Son iki karşılaştırmada daha ıslak yöne gidiş var.'
            : memory.trend === 'mixed'
              ? 'Son iki karşılaştırmada karma bir iklim yönü var.'
              : 'Henüz kalıcı bir sezon yönü oluşmadı.';

  return {
    status: memory.status === 'ready' ? 'ready' : 'partial',
    headline: 'Sezon iklim hafızası izleniyor',
    summary: `${clean(memory.summary)} ${trendText}`.trim(),
    evidence,
    actionContext: null,
    persistenceKey: memory.trend === 'mixed' ? 'mixed' : 'unknown',
    changesRiskScore: false,
  };
}
