import type { PhenologyStage } from '../../phenology/types/phenology';
import { resolveCropModeProfile } from '../../crop-mode/services/cropMode.service';
import type { CropModeKey } from '../../crop-mode/types/cropMode';
import type { RiskClimateSignalKey } from '../types/riskClimateIntelligence';

export type CropPhenologyRiskSensitivity = {
  cropModeKey: CropModeKey;
  cropName: string | null;
  phenologyStage: PhenologyStage | null;
  phenologyStageLabel: string | null;
  factor: number;
  applied: boolean;
  reason: string;
};

type SensitivityRule = {
  signal: RiskClimateSignalKey;
  crops: CropModeKey[];
  stages: PhenologyStage[];
  factor: number;
  reason: string;
};

const RULES: SensitivityRule[] = [
  // Don: aktif doku/çiçek dönemi öne çıkar; dormanside alarm baskılanır.
  { signal: 'frost', crops: ['almond'], stages: ['flowering'], factor: 1.5, reason: 'Badem çiçeklenme döneminde düşük sıcaklığa daha hassastır.' },
  { signal: 'frost', crops: ['almond'], stages: ['bud_swell', 'bud_break'], factor: 1.35, reason: 'Bademde tomurcuk uyanması ve sürme döneminde don hassasiyeti artar.' },
  { signal: 'frost', crops: ['almond'], stages: ['fruit_set'], factor: 1.25, reason: 'Bademde meyve tutumu döneminde düşük sıcaklık etkisi önemlidir.' },
  { signal: 'frost', crops: ['almond'], stages: ['dormancy'], factor: 0.65, reason: 'Badem dormansi döneminde aktif doku dönemine göre daha düşük hassasiyet uygulanır.' },

  { signal: 'frost', crops: ['grape'], stages: ['bud_swell', 'bud_break'], factor: 1.35, reason: 'Bağda göz uyanması ve sürme döneminde don hassasiyeti artar.' },
  { signal: 'frost', crops: ['grape'], stages: ['flowering'], factor: 1.4, reason: 'Bağda çiçeklenme döneminde düşük sıcaklık riski daha kritik yorumlanır.' },
  { signal: 'frost', crops: ['grape'], stages: ['fruit_set'], factor: 1.2, reason: 'Bağda meyve tutumu döneminde düşük sıcaklık etkisi daha önemli kabul edilir.' },
  { signal: 'frost', crops: ['grape'], stages: ['dormancy'], factor: 0.7, reason: 'Bağ dormansi döneminde aktif gelişim dönemlerine göre daha düşük hassasiyet uygulanır.' },

  { signal: 'frost', crops: ['hazelnut'], stages: ['flowering'], factor: 1.35, reason: 'Fındıkta çiçeklenme döneminde düşük sıcaklık sinyali daha yüksek önceliklidir.' },
  { signal: 'frost', crops: ['hazelnut'], stages: ['bud_swell', 'bud_break'], factor: 1.25, reason: 'Fındıkta tomurcuk gelişimi döneminde don hassasiyeti artar.' },
  { signal: 'frost', crops: ['hazelnut'], stages: ['dormancy'], factor: 0.75, reason: 'Fındık dormansi döneminde aktif fenolojiye göre daha düşük hassasiyet uygulanır.' },

  { signal: 'frost', crops: ['olive'], stages: ['flowering'], factor: 1.25, reason: 'Zeytinde çiçeklenme döneminde düşük sıcaklık daha dikkatli yorumlanır.' },
  { signal: 'frost', crops: ['wheat', 'barley'], stages: ['reproductive'], factor: 1.25, reason: 'Tahıllarda üreme döneminde düşük sıcaklık sinyali daha yüksek önceliklidir.' },
  { signal: 'frost', crops: ['wheat', 'barley'], stages: ['establishment'], factor: 1.15, reason: 'Tahıllarda çıkış/tesis döneminde düşük sıcaklık gelişimi etkileyebilir.' },

  // Sıcaklık stresi: özellikle üreme/ürün bağlama ve tane-dolum benzeri dönemler.
  { signal: 'heat', crops: ['maize'], stages: ['reproductive'], factor: 1.4, reason: 'Mısırda üreme döneminde yüksek sıcaklık sinyali daha kritik değerlendirilir.' },
  { signal: 'heat', crops: ['maize'], stages: ['maturation'], factor: 1.15, reason: 'Mısır olgunlaşma döneminde aşırı sıcaklık kalite ve su ihtiyacı açısından önemlidir.' },
  { signal: 'heat', crops: ['cotton'], stages: ['reproductive'], factor: 1.25, reason: 'Pamukta üreme döneminde yüksek sıcaklık sinyali daha yüksek önceliklidir.' },
  { signal: 'heat', crops: ['grape'], stages: ['fruit_growth', 'veraison'], factor: 1.25, reason: 'Bağda meyve gelişimi ve ben düşme döneminde sıcaklık stresi daha önemli yorumlanır.' },
  { signal: 'heat', crops: ['olive'], stages: ['flowering', 'fruit_set', 'fruit_growth'], factor: 1.15, reason: 'Zeytinde çiçeklenme ve meyve gelişiminde sıcaklık stresi daha dikkatli değerlendirilir.' },
  { signal: 'heat', crops: ['wheat', 'barley'], stages: ['reproductive'], factor: 1.2, reason: 'Tahıllarda üreme döneminde yüksek sıcaklık sinyali daha kritik olabilir.' },

  // Su açığı / kuraklık.
  { signal: 'drought', crops: ['maize'], stages: ['reproductive'], factor: 1.4, reason: 'Mısırda üreme döneminde su açığı sinyali daha yüksek önem taşır.' },
  { signal: 'drought', crops: ['wheat', 'barley'], stages: ['reproductive'], factor: 1.25, reason: 'Tahıllarda üreme döneminde kuraklık sinyali daha kritik değerlendirilir.' },
  { signal: 'drought', crops: ['sunflower'], stages: ['reproductive'], factor: 1.2, reason: 'Ayçiçeğinde üreme döneminde su açığı sinyali daha yüksek önceliklidir.' },
  { signal: 'drought', crops: ['grape', 'almond', 'olive', 'hazelnut'], stages: ['flowering', 'fruit_set', 'fruit_growth', 'veraison'], factor: 1.2, reason: 'Çok yıllık üründe çiçek/meyve gelişim döneminde su açığı daha yüksek önceliklidir.' },

  // Fazla su / drenaj.
  { signal: 'excess_water', crops: ['wheat', 'barley'], stages: ['establishment'], factor: 1.2, reason: 'Tahıllarda tesis döneminde fazla su ve drenaj sorunu daha kritik olabilir.' },
  { signal: 'excess_water', crops: ['grape', 'almond', 'hazelnut'], stages: ['flowering', 'fruit_set', 'fruit_growth'], factor: 1.15, reason: 'Çiçek ve meyve döneminde uzun süreli ıslaklık/dranaj sorunu daha dikkatli izlenir.' },

  // Hastalık için uygun hava: teşhis değil; çevresel risk önem katsayısı.
  { signal: 'disease_weather_window', crops: ['grape'], stages: ['bud_break', 'flowering', 'fruit_set', 'fruit_growth'], factor: 1.3, reason: 'Bağda aktif sürgün, çiçek ve meyve döneminde hastalık için uygun hava sinyali daha yüksek önceliklidir.' },
  { signal: 'disease_weather_window', crops: ['wheat', 'barley'], stages: ['vegetative', 'reproductive'], factor: 1.2, reason: 'Tahıllarda aktif yaprak ve üreme döneminde hastalık için uygun hava sinyali daha önemlidir.' },
  { signal: 'disease_weather_window', crops: ['hazelnut'], stages: ['bud_break', 'flowering', 'fruit_set', 'fruit_growth'], factor: 1.2, reason: 'Fındıkta aktif gelişim ve meyve döneminde hastalık için uygun hava sinyali daha yüksek önceliklidir.' },
  { signal: 'disease_weather_window', crops: ['almond'], stages: ['flowering', 'fruit_set'], factor: 1.15, reason: 'Bademde çiçeklenme ve meyve tutumunda hastalık için uygun hava sinyali daha dikkatli yorumlanır.' },
];

function normalizeStage(value: unknown): PhenologyStage | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;

  const known: PhenologyStage[] = [
    'unknown', 'pre_sowing', 'establishment', 'vegetative', 'reproductive',
    'maturation', 'harvest_window', 'post_harvest', 'dormancy', 'bud_swell',
    'bud_break', 'flowering', 'fruit_set', 'fruit_growth', 'veraison', 'leaf_fall',
  ];

  return known.includes(raw as PhenologyStage) ? raw as PhenologyStage : null;
}

function bestRule(
  signal: RiskClimateSignalKey,
  cropModeKey: CropModeKey,
  stage: PhenologyStage | null,
) {
  if (!stage) return null;
  const matches = RULES.filter(
    (rule) => rule.signal === signal && rule.crops.includes(cropModeKey) && rule.stages.includes(stage),
  );
  if (!matches.length) return null;
  return matches.sort((a, b) => Math.abs(b.factor - 1) - Math.abs(a.factor - 1))[0];
}

export function resolveCropPhenologyRiskSensitivity(input: {
  cropName?: unknown;
  signal: RiskClimateSignalKey;
  phenologyStage?: unknown;
  phenologyStageLabel?: unknown;
}): CropPhenologyRiskSensitivity {
  const cropName = String(input.cropName ?? '').trim() || null;
  const { profile } = resolveCropModeProfile(cropName);
  const stage = normalizeStage(input.phenologyStage);
  const stageLabel = String(input.phenologyStageLabel ?? '').trim() || null;

  if (profile.key === 'generic') {
    return {
      cropModeKey: 'generic',
      cropName,
      phenologyStage: stage,
      phenologyStageLabel: stageLabel,
      factor: 1,
      applied: false,
      reason: 'Ürün profili tanımlı olmadığı için ürüne özel hassasiyet katsayısı uygulanmadı.',
    };
  }

  const rule = bestRule(input.signal, profile.key, stage);
  if (!rule) {
    return {
      cropModeKey: profile.key,
      cropName,
      phenologyStage: stage,
      phenologyStageLabel: stageLabel,
      factor: 1,
      applied: false,
      reason: stage
        ? 'Bu ürün ve fenoloji evresi için ek hassasiyet katsayısı tanımlı değil; ham iklim sinyali korunuyor.'
        : 'Fenoloji evresi doğrulanmadığı için ek hassasiyet katsayısı uygulanmadı.',
    };
  }

  return {
    cropModeKey: profile.key,
    cropName,
    phenologyStage: stage,
    phenologyStageLabel: stageLabel,
    factor: rule.factor,
    applied: rule.factor !== 1,
    reason: rule.reason,
  };
}
