import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  CircleDot,
  ClipboardPlus,
  Database,
  Droplets,
  ExternalLink,
  FileText,
  FlaskConical,
  Gauge,
  LandPlot,
  Leaf,
  MapPin,
  PencilLine,
  RefreshCw,
  ShieldCheck,
  Sprout,
  Tractor,
  Upload,
  Waves,
  X,
} from 'lucide-react';

import type {
  HomeSystemNotification,
  HomeTodayDecision,
} from '../../decision/types/homeDecision';
import type { PhenologyResult } from '../../phenology/types/phenology';
import FieldGrowthObservations from '../../field-detail/components/FieldGrowthObservations';
import { FieldGrowthStatusView } from '../../field-detail/components/FieldGrowthStatus';
import FieldIrrigationMethod from '../../field-detail/components/FieldIrrigationMethod';
import FieldWaterMeasurements from '../../irrigation/components/FieldWaterMeasurements';
import IrrigationResultPanel from '../../irrigation/components/IrrigationResultPanel';
import OrchardChillPanel from '../../orchard-chill/components/OrchardChillPanel';
import type { FieldSeason } from '../../../types';
import { supabase } from '../../../supabaseClient';
import {
  fetchSoilGridsProfile,
  type SoilGridsProfile,
} from '../../../services/soilGridsService';
import {
  loadFieldScientificSignals,
  refreshFieldScientificSignals,
  type FieldScientificSignals,
  type ScientificMetric,
  type ScientificRefreshStep,
} from '../../../services/fieldScientificSignals.service';
import { buildFieldBiophysicsInsight } from '../../../services/fieldBiophysicsInsight.service';
import type { HybrisFieldEvent } from '../../../services/hybrisFieldEvents.service';
import { fieldEventCandidateKey } from '../../field-events/services/fieldEventCandidateFeedback.service';
import {
  fetchFieldCropSuitability,
  type CropSuitabilityResponse,
} from '../../../services/fieldCropSuitability.service';
import {
  analyzeSoilReport,
  findNearbySoilLabs,
  getSoilAnalysisFileUrl,
  listSoilAnalyses,
  type SoilAnalysisRecord,
  type SoilLabResult,
} from '../../../lib/soilAnalysisService';
import { addPoints } from '../../../gamification/useGamificationStore';
import {
  loadFieldCompletionContext,
  saveFieldCanopyCoverPercent,
  saveFieldCanopyHeightM,
  saveFieldIrrigationStatus,
} from '../../fields/services/fieldCompletion.service';
import { syncBiophysicalTrendTaskBestEffort } from '../../tasks/services/fieldTasks.service';
import { notifyFieldOperationImpact } from '../../field-operations/services/fieldOperation.service';
import {
  readLatestWeedSatelliteScreening,
  type WeedSatelliteScreeningSignal,
} from '../../weed/services/weedSatelliteIntelligence.service';
import { useFieldYieldHarvestQuality } from '../../yield-quality/hooks/useFieldYieldHarvestQuality';
import { useFieldWorkabilityContext } from '../../field-workability/hooks/useFieldWorkabilityContext';
import WaterScarcityPlanPanel from '../../water-scarcity/components/WaterScarcityPlanPanel';
import MicroclimateSensorPanel from '../../microclimate/components/MicroclimateSensorPanel';

import './FieldStatusCenter.css';

export type FieldStatusTabKey =
  | 'summary'
  | 'plant'
  | 'crop'
  | 'soil'
  | 'irrigation'
  | 'risk'
  | 'data'
  | 'input';

type Props = {
  open: boolean;
  field: any | null;
  notifications?: HomeSystemNotification[];
  decisions?: HomeTodayDecision[];
  irrigation?: any;
  phenology?: PhenologyResult | null;
  onClose: () => void;
  initialTab?: FieldStatusTabKey;
  initialActionTarget?: string | null;
  onOpenTarget?: (
    target: HomeTodayDecision['target'],
    context?: { observationPointId?: string | null; source?: string | null },
  ) => void;
  onOpenIrrigationRecord?: () => void;
  onFieldPatch?: (patch: Record<string, unknown>) => void;
  recordsRefreshNonce?: number;
  fieldEventCandidate?: HybrisFieldEvent | null;
  onOpenFieldEvent?: () => void;
};

const EMPTY_SIGNALS: FieldScientificSignals = {
  biophysics: { latest: null, history: [], historyCount: 0 },
  rscm: null,
  dataConfidence: null,
};

class PlantTabErrorBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('[TarlaPusula] Bitki sekmesi render hatası:', error);
  }

  componentDidUpdate(prevProps: { children: ReactNode; resetKey: string }) {
    if (this.state.failed && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <div className="tp-field-status-empty error" role="alert">
          Bitki verilerinden biri görüntülenemedi. Tarla kaydı korunuyor; sekmeyi kapatıp yeniden açabilir veya veriyi yenileyebilirsin.
        </div>
      );
    }
    return this.props.children;
  }
}

const TABS: Array<{ key: FieldStatusTabKey; label: string }> = [
  { key: 'summary', label: 'Özet' },
  { key: 'plant', label: 'Bitki' },
  { key: 'crop', label: 'Ürün' },
  { key: 'soil', label: 'Toprak' },
  { key: 'irrigation', label: 'Sulama' },
  { key: 'risk', label: 'Risk' },
  { key: 'data', label: 'Veri' },
  { key: 'input', label: 'Veri Girişi' },
];

const SOIL_SAMPLE_STEPS = [
  {
    no: '1',
    title: 'Tarlayı temsil edecek noktaları seç',
    detail: 'Tarla homojense zikzak ilerleyerek yaklaşık 8–15 farklı noktadan alt numune al. Yol kenarı, gübre yığını, su biriken çukur ve sıra dışı alanları genel numuneye karıştırma.',
  },
  {
    no: '2',
    title: 'Yüzeyi temizle, doğru derinlikten al',
    detail: 'Yaprak, sap ve taşı uzaklaştır. Rutin tarla bitkisi analizlerinde çoğu zaman 0–20/30 cm katman kullanılır; laboratuvar farklı derinlik istiyorsa onun talebini esas al.',
  },
  {
    no: '3',
    title: 'Alt numuneleri temiz kapta karıştır',
    detail: 'Aynı derinlikteki alt numuneleri temiz plastik kovada iyice karıştır. Çok ıslak toprağı kapalı poşette uzun süre bekletme.',
  },
  {
    no: '4',
    title: 'Temsili numuneyi etiketleyip gönder',
    detail: 'Karışımdan laboratuvarın istediği miktarı ayır. Rutin analizlerde yaklaşık 500 g–1 kg çoğu zaman yeterlidir; kesin miktarı laboratuvardan doğrula.',
  },
];

const TRUE_RISK_TERMS = /\b(risk|don|dolu|sel|taşkın|fırtına|hastalık|zararlı|stres|kurak|aşırı sıcak|aşırı yağış|su birik|göllen|yangın)\b/i;

const RSCM_SUPPORTED = [
  'buğday',
  'bugday',
  'wheat',
  'mısır',
  'misir',
  'maize',
  'corn',
  'çeltik',
  'celtik',
  'pirinç',
  'pirinc',
  'rice',
];

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricValue(metric: ScientificMetric | undefined) {
  return finite(metric?.value ?? metric?.mean);
}

function formatMetric(key: string, metric: ScientificMetric | undefined) {
  const value = metricValue(metric);
  if (value === null) return '—';
  if (key === 'fCOVER' || key === 'fAPAR') return `%${Math.round(value * 100)}`;
  if (key === 'LAI') return value.toFixed(2);
  if (key === 'Albedo') return value.toFixed(3);
  return value.toFixed(2);
}

function trDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function qualityLabel(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'high') return 'Yüksek';
  if (normalized === 'medium') return 'Orta';
  if (normalized === 'low') return 'Düşük';
  return 'Bekleniyor';
}

function confidenceLabel(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'high') return 'Yüksek';
  if (normalized === 'medium') return 'Orta';
  if (normalized === 'low') return 'Düşük';
  if (normalized === 'insufficient') return 'Eksik veri';
  return 'Bekleniyor';
}

function kgHaToKgDa(value: unknown) {
  const parsed = finite(value);
  return parsed === null ? null : parsed / 10;
}

function formatKg(value: unknown) {
  const parsed = finite(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed).toLocaleString('tr-TR')} kg`;
}

function formatKgDa(value: unknown) {
  const parsed = finite(value);
  if (parsed === null) return '—';
  return `${Math.round(parsed).toLocaleString('tr-TR')} kg/da`;
}

function yieldTrendLabel(value: unknown) {
  const trend = String(value ?? '').toLowerCase();
  if (trend === 'rising') return '↑ Artış eğilimi';
  if (trend === 'falling') return '↓ Düşüş eğilimi';
  if (trend === 'stable') return '→ Dengeli';
  return 'Geçmiş veri sınırlı';
}

function shortYieldTrendLabel(value: unknown) {
  const trend = String(value ?? '').toLowerCase();
  if (trend === 'rising') return '↑ artış';
  if (trend === 'falling') return '↓ düşüş';
  if (trend === 'stable') return '→ dengeli';
  return '';
}


function fieldEventSummaryTitle(event: HybrisFieldEvent) {
  if (event.type === 'sowing') return 'Ekim / dikim yapılmış olabilir';
  if (event.type === 'harvest') return 'Hasat yapılmış olabilir';
  return 'Toprak işleme yapılmış olabilir';
}

function fieldEventSummaryDetail(event: HybrisFieldEvent) {
  const when = trDate(event.signalDate);
  if (event.type === 'sowing') {
    return `${when} civarında ekim dönemine benzeyen bir tarla değişikliği algılandı.`;
  }
  if (event.type === 'harvest') {
    return `${when} civarında hasat dönemine benzeyen bir tarla değişikliği algılandı.`;
  }
  return `${when} civarında sürüm veya benzeri toprak işlemeye benzeyen bir değişiklik algılandı.`;
}


const SCIENTIFIC_AUTO_REFRESH_COOLDOWN_MS = 10 * 60 * 1000;

function autoRefreshStorageKey(fieldId: string) {
  return `tp:scientific-auto-refresh:${fieldId}`;
}

function autoRefreshRecentlyAttempted(fieldId: string) {
  if (typeof window === 'undefined') return false;
  const raw = window.sessionStorage.getItem(autoRefreshStorageKey(fieldId));
  const timestamp = Number(raw ?? 0);
  return Number.isFinite(timestamp) && timestamp > 0 && Date.now() - timestamp < SCIENTIFIC_AUTO_REFRESH_COOLDOWN_MS;
}

function markAutoRefreshAttempt(fieldId: string) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(autoRefreshStorageKey(fieldId), String(Date.now()));
}

function suitabilityDiagnostic(response: CropSuitabilityResponse | null, loading: boolean, error: string) {
  if (loading) return 'Hesaplanıyor';
  if (error) return error;
  if (!response) return 'Henüz hesaplanmadı';
  if (response.status === 'unsupported_crop') return 'Bu ürün henüz desteklenmiyor';
  const score = finite(response.screening?.score);
  if (score === null) return 'Veri tamamlanıyor';
  const limiting = response.screening?.limitingFactor?.label;
  return `${Math.round(score)}/100${limiting ? ` · sınır: ${limiting}` : ''}`;
}

function suitabilityLabel(response: CropSuitabilityResponse | null) {
  const score = finite(response?.screening?.score);
  if (score === null) {
    return response?.status === 'unsupported_crop'
      ? 'Bu ürün henüz desteklenmiyor'
      : 'Hazırlanıyor';
  }
  return `${Math.round(score)}/100 · ${response?.screening?.label ?? 'Uygunluk'}`;
}

function riskTone(item: { severity?: string; source?: string; title?: string }) {
  if (item.severity === 'danger') return 'danger';
  if (item.severity === 'warning') return 'warning';
  if (item.source === 'risk-radar') return 'warning';
  return 'info';
}

function shortRiskLabel(source: string | undefined) {
  if (source === 'risk-radar') return 'Risk radarı';
  if (source === 'weather') return 'Hava';
  if (source === 'satellite') return 'Uydu';
  if (source === 'irrigation') return 'Sulama';
  if (source === 'nutrition') return 'Besleme';
  if (source === 'phenology') return 'Gelişim';
  return 'Tarla';
}

function normalizedCrop(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
}

function isRscmSupportedCrop(crop: unknown) {
  const value = normalizedCrop(crop);
  return RSCM_SUPPORTED.some((candidate) => value.includes(candidate));
}

function translateMissingInput(code: string) {
  const map: Record<string, string> = {
    stored_field_geometry: 'Parsel sınırı kayıtlı değil.',
    eligible_sentinel2_scene: 'Son dönemde uygun, düşük bulutlu Sentinel-2 görüntüsü bulunamadı.',
    field_location: 'Tarla koordinatı eksik.',
    planting_date: 'Ekim / dikim tarihi eksik.',
    supported_crop_wheat_maize_rice: 'RSCM şu an buğday, mısır ve çeltik/pirinçte çalışıyor.',
    minimum_4_weather_supported_quality_sl2p_lai_observations:
      'En az 4 kaliteli gerçek SL2P LAI tarihi gerekiyor.',
    scientific_service_warming_up: 'Uydu bitki ölçüm servisi güncelleniyor. Sizden işlem gerekmiyor.',
  };
  return map[code] ?? code.replaceAll('_', ' ');
}

function friendlyScientificText(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (/render model gateway|endpointi bulunamadı|deploy et|gateway http 404|not found/i.test(text)) {
    return 'Uydu bitki ölçüm servisi güncelleniyor. Sizden işlem gerekmiyor.';
  }
  return text;
}

function stepReason(step: ScientificRefreshStep | undefined) {
  if (!step) return null;
  if (step.error) return friendlyScientificText(step.error);
  if (step.missingInputs?.length) {
    return step.missingInputs.map(translateMissingInput).join(' ');
  }
  if (step.note) return friendlyScientificText(step.note);
  return null;
}

function irrigationConfidence(value: unknown) {
  const normalized = String(value ?? '').toLowerCase();
  if (normalized === 'high') return 'Yüksek';
  if (normalized === 'medium') return 'Orta';
  if (normalized === 'low') return 'Düşük';
  return '—';
}

function irrigationMissingLabel(value: unknown) {
  const key = String(value ?? '');
  const map: Record<string, string> = {
    canopy_cover: 'Bitki örtüsü / taç gelişimi',
    canopy_height: 'Bitki / ağaç yüksekliği',
    irrigation_method: 'Sulama yöntemi',
    soil_profile: 'Toprak su profili',
    soil_water_measurement: 'Gerçek toprak nem ölçümü',
    current_surface_water_measurement: '0–15 cm gerçek toprak nem ölçümü',
    current_root_zone_water_measurement: 'Kök bölgesi gerçek toprak nem ölçümü',
    current_root_zone_depletion: 'Kök bölgesi su durumu',
    last_irrigation: 'Son sulama kaydı',
    crop_water_reference_profile: 'Üzüm tipi (Sofralık / Şaraplık)',
    current_surface_depletion_measurement: '0–15 cm gerçek toprak nem ölçümü',
    phenology: 'Gelişim evresi',
  };
  return map[key] ?? key.replaceAll('_', ' ');
}

const USER_ACTIONABLE_IRRIGATION_MISSING = new Set([
  'canopy_cover',
  'canopy_height',
  'irrigation_method',
  'soil_water_measurement',
  'current_surface_water_measurement',
  'current_root_zone_water_measurement',
  'current_root_zone_depletion',
  'last_irrigation',
  'crop_water_reference_profile',
  'current_surface_depletion_measurement',
  'phenology',
]);

function dataRequirementLabel(value: unknown) {
  const key = String(value ?? '');
  const map: Record<string, string> = {
    sentinel2_biophysics: 'Sentinel-2 biyofizik gözlemi',
    daily_weather: 'Günlük hava verisi',
    field_management: 'Ürün + ekim/dikim tarihi',
    soil_profile: 'Toprak profili',
    crop_model_evidence: 'Model kanıtı',
    terrain_context: 'Arazi yüksekliği',
    stored_field_geometry: 'Parsel sınırı',
    eligible_sentinel2_scene: 'Uygun Sentinel-2 görüntüsü',
    field_location: 'Tarla konumu',
    planting_date: 'Ekim / dikim tarihi',
    supported_crop_wheat_maize_rice: 'RSCM desteklenen ürün',
    minimum_4_weather_supported_quality_sl2p_lai_observations: 'En az 4 kaliteli SL2P LAI tarihi',
    irrigation_method: 'Sulama yöntemi',
    soil_water_measurement: 'Gerçek toprak nem ölçümü',
    current_surface_water_measurement: '0–15 cm gerçek toprak nem ölçümü',
    current_root_zone_water_measurement: 'Kök bölgesi gerçek toprak nem ölçümü',
    current_root_zone_depletion: 'Kök bölgesi su durumu',
    last_irrigation: 'Son sulama kaydı',
    crop_water_reference_profile: 'Üzüm tipi (Sofralık / Şaraplık)',
    current_surface_depletion_measurement: '0–15 cm gerçek toprak nem ölçümü',
    phenology: 'Gelişim evresi',
    canopy_cover: 'Bitki örtüsü / taç gelişimi',
    canopy_height: 'Bitki / ağaç yüksekliği',
    scientific_service_warming_up: 'Bilimsel uydu servisi hazırlanıyor',
  };
  return map[key] ?? key.replaceAll('_', ' ');
}

function isSystemWaitingRequirement(value: unknown) {
  const key = String(value ?? '');
  return [
    'sentinel2_biophysics',
    'daily_weather',
    'eligible_sentinel2_scene',
    'supported_crop_wheat_maize_rice',
    'minimum_4_weather_supported_quality_sl2p_lai_observations',
    'crop_model_evidence',
    'terrain_context',
    'scientific_service_warming_up',
  ].includes(key);
}

function soilTopsoilValue(profile: SoilGridsProfile | null, key: 'ph' | 'organicCarbon' | 'clay' | 'sand' | 'silt') {
  return profile?.properties?.[key]?.topsoil0To30 ?? null;
}

function textureClass(profile: SoilGridsProfile | null) {
  const clay = finite(profile?.texture?.clayPercent);
  const sand = finite(profile?.texture?.sandPercent);
  const silt = finite(profile?.texture?.siltPercent);
  if (clay === null || sand === null || silt === null) return 'Tahmin hazırlanıyor';
  if (clay >= 40) return 'Killi';
  if (sand >= 70) return 'Kumlu';
  if (silt >= 50) return 'Siltli';
  if (clay >= 27 && sand <= 52) return 'Killi tın';
  if (sand >= 43) return 'Kumlu tın';
  return 'Tınlı';
}

function satelliteWeedAreaLabel(decision: HomeTodayDecision | HomeSystemNotification | null) {
  if (!decision) return '';
  const metadata = (decision.task?.metadata ?? {}) as Record<string, unknown>;
  const direct = String(metadata.direction ?? '').trim();
  if (direct && direct !== 'tarla-geneli') return direct;

  const importantArea = metadata.importantArea;
  if (importantArea && typeof importantArea === 'object') {
    const area = String((importantArea as Record<string, unknown>).area ?? '').trim();
    if (area && area !== 'Tarla geneli' && area !== 'tarla-geneli') return area;
  }

  return '';
}

function weedSummaryLabel(
  decision: HomeTodayDecision | null,
  satelliteDecision: HomeTodayDecision | HomeSystemNotification | null,
  screening: WeedSatelliteScreeningSignal | null,
) {
  if (!decision) {
    const screeningArea = screening?.strongestArea || satelliteWeedAreaLabel(satelliteDecision);

    if (screening?.status === 'persistent-watch') {
      if (screening.spread === 'expanding') {
        return screeningArea
          ? `Şüpheli alan yayılıyor · ${screeningArea}`
          : 'Uydu şüphesi yayılıyor';
      }

      if (screening.candidateAreaCount > 1) {
        return `${screening.candidateAreaCount} bölgede kalıcı uydu şüphesi`;
      }

      return screeningArea
        ? `Kalıcı uydu şüphesi · ${screeningArea}`
        : 'Kalıcı uydu şüphesi';
    }

    if (screening?.status === 'watch') {
      if (screening.candidateAreaCount > 1) {
        return `${screening.candidateAreaCount} bölgede uydu şüphesi`;
      }

      return screeningArea
        ? `Uydu şüphesi · ${screeningArea}`
        : 'Uydu şüphesi · saha kontrolü';
    }

    if (screening?.status === 'screened-clear') {
      return 'Uydu tarandı · şüphe görülmedi';
    }

    if (screening?.status === 'unavailable') {
      return 'Uydu verisi yetersiz';
    }

    if (satelliteDecision) {
      const area = satelliteWeedAreaLabel(satelliteDecision);
      return area ? `Uydu şüphesi · ${area}` : 'Uydu şüphesi · saha kontrolü';
    }

    return 'Uydu verisi yetersiz';
  }

  const metadata = (decision.task?.metadata ?? {}) as Record<string, unknown>;
  const changeStatus = String(metadata.weedChangeStatus ?? '');
  const cover = finite(metadata.weedCoverPercent);
  const delta = finite(metadata.weedCoverDeltaPercent);
  const activeHotspots = finite(metadata.activeWeedHotspotCount);
  const increasingHotspots = finite(metadata.increasingWeedHotspotCount);
  const presence = String(metadata.weedPresence ?? '');
  const satelliteSupport = Boolean(
    satelliteDecision ||
    screening?.status === 'watch' ||
    screening?.status === 'persistent-watch',
  );

  if (increasingHotspots !== null && increasingHotspots > 1) {
    return `${Math.round(increasingHotspots)} odakta artış`;
  }

  if (changeStatus === 'increasing') {
    return delta !== null
      ? `Artıyor · +${Math.abs(delta).toFixed(1).replace('.', ',')} puan`
      : 'Kaplama artıyor';
  }

  if (changeStatus === 'decreasing') {
    return delta !== null
      ? `Azalıyor · ${Math.abs(delta).toFixed(1).replace('.', ',')} puan`
      : 'Kaplama azalıyor';
  }

  if (presence === 'not_visible') return 'Son saha kontrolünde görülmedi';

  if (presence === 'possible') {
    return satelliteSupport ? 'Uydu + saha şüphesi · doğrula' : 'Şüpheli · saha kontrolü';
  }

  if (presence === 'visible') {
    if (activeHotspots !== null && activeHotspots > 1) {
      return cover !== null
        ? `${Math.round(activeHotspots)} odakta · %${Math.round(cover)} kaplama`
        : `${Math.round(activeHotspots)} odakta görülüyor`;
    }

    if (satelliteSupport) {
      return cover !== null
        ? `Uydu + saha · %${Math.round(cover)} kaplama`
        : 'Uydu + saha doğrulaması';
    }

    return cover !== null
      ? `Görüldü · %${Math.round(cover)} kaplama`
      : 'Yabancı ot görüldü';
  }

  return decision.title || 'Yabancı ot saha değerlendirmesi';
}

export default function FieldStatusCenter({
  open,
  field,
  notifications = [],
  decisions = [],
  irrigation,
  phenology = null,
  onClose,
  initialTab = 'summary',
  initialActionTarget = null,
  onOpenTarget,
  onOpenIrrigationRecord,
  onFieldPatch,
  recordsRefreshNonce = 0,
  fieldEventCandidate = null,
  onOpenFieldEvent,
}: Props) {
  const [tab, setTab] = useState<FieldStatusTabKey>('summary');
  const [signals, setSignals] = useState<FieldScientificSignals>(EMPTY_SIGNALS);
  const [signalsLoading, setSignalsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [, setScientificMessage] = useState('');
  const [refreshSteps, setRefreshSteps] = useState<ScientificRefreshStep[]>([]);
  const [cropSuitability, setCropSuitability] = useState<CropSuitabilityResponse | null>(null);
  const [cropLoading, setCropLoading] = useState(false);
  const [cropError, setCropError] = useState('');
  const [soilProfile, setSoilProfile] = useState<SoilGridsProfile | null>(null);
  const [soilLoading, setSoilLoading] = useState(false);
  const [soilError, setSoilError] = useState('');
  const [seasons, setSeasons] = useState<FieldSeason[]>([]);
  const [seasonsLoading, setSeasonsLoading] = useState(false);
  const [fieldObservationOpen, setFieldObservationOpen] = useState(false);
  const [workabilityOpen, setWorkabilityOpen] = useState(false);
  const [soilGuideOpen, setSoilGuideOpen] = useState(false);
  const [labsOpen, setLabsOpen] = useState(false);
  const [labsLoading, setLabsLoading] = useState(false);
  const [labsMessage, setLabsMessage] = useState('');
  const [labs, setLabs] = useState<SoilLabResult[]>([]);
  const [soilAnalyses, setSoilAnalyses] = useState<SoilAnalysisRecord[]>([]);
  const [soilAnalysesLoading, setSoilAnalysesLoading] = useState(false);
  const [soilUploadLoading, setSoilUploadLoading] = useState(false);
  const [soilUploadMessage, setSoilUploadMessage] = useState('');
  const [recentActivities, setRecentActivities] = useState<Array<{ id: string; title: string; type: string; date: string | null; cost: number | null }>>([]);
  const [perennialYields, setPerennialYields] = useState<Array<{ id: string; year: number; yieldKg: number | null; harvestDate: string | null }>>([]);
  const [fieldSections, setFieldSections] = useState<Array<{ id: string; name: string; crop: string; area: number | null }>>([]);
  const [recordEditor, setRecordEditor] = useState<'profile' | 'season' | 'section' | 'activity' | null>(null);
  const [recordDraft, setRecordDraft] = useState<Record<string, string | boolean>>({});
  const [recordSaving, setRecordSaving] = useState(false);
  const [recordMessage, setRecordMessage] = useState('');
  const [irrigationProfile, setIrrigationProfile] = useState({
    status: '',
    cropSubtype: '',
    canopyCover: '',
    canopyHeight: '',
  });
  const [irrigationProfileLoading, setIrrigationProfileLoading] = useState(false);
  const [irrigationProfileSaving, setIrrigationProfileSaving] = useState(false);
  const [irrigationProfileMessage, setIrrigationProfileMessage] = useState('');
  const autoRefreshAttempted = useRef(new Set<string>());
  const consumedInitialActionRef = useRef('');
  const [weedSatelliteScreening, setWeedSatelliteScreening] =
    useState<WeedSatelliteScreeningSignal | null>(null);

  const fieldId = String(field?.id ?? '').trim();
  const workability = useFieldWorkabilityContext({
    fieldId: open && !field?.demo ? fieldId : null,
  });
  const yieldHarvest = useFieldYieldHarvestQuality(open ? field : null);
  const yieldHarvestSnapshot = yieldHarvest.snapshot?.snapshot ?? null;
  const currentYieldKgDa = kgHaToKgDa(yieldHarvestSnapshot?.observed.yieldKgHa);
  const averageYieldKgDa = kgHaToKgDa(yieldHarvestSnapshot?.history.averageYieldKgHa);

  const yieldHarvestOverview = useMemo(() => {
    if (yieldHarvest.loading && !yieldHarvestSnapshot) {
      return {
        title: 'Verim kaydı kontrol ediliyor…',
        detail: 'En fazla birkaç saniye · kayıt yoksa açıkça gösterilecek',
      };
    }

    if (!yieldHarvestSnapshot) {
      return {
        title: 'Verim kaydı henüz yok',
        detail: yieldHarvest.error
          ? 'Kayıt geldiğinde otomatik yeniden hesaplanır'
          : 'Hasat / verim girdikçe otomatik dolacak',
      };
    }

    const actualDate = yieldHarvestSnapshot.harvest.actualDate;
    const expectedDate = yieldHarvestSnapshot.harvest.expectedDate;
    const days = finite(yieldHarvestSnapshot.harvest.daysToExpectedHarvest);
    const trend = shortYieldTrendLabel(yieldHarvestSnapshot.history.trend);

    if (currentYieldKgDa !== null) {
      return {
        title: `Verim ${formatKgDa(currentYieldKgDa)}`,
        detail: averageYieldKgDa !== null
          ? `Geçmiş ort. ${formatKgDa(averageYieldKgDa)}${trend ? ` · ${trend}` : ''}`
          : actualDate
            ? `Hasat ${trDate(actualDate)}`
            : 'Gerçek verim kaydı',
      };
    }

    if (actualDate) {
      return {
        title: `Hasat ${trDate(actualDate)}`,
        detail: averageYieldKgDa !== null
          ? `Geçmiş ort. ${formatKgDa(averageYieldKgDa)}${trend ? ` · ${trend}` : ''}`
          : 'Güncel verim miktarı henüz girilmedi',
      };
    }

    if (yieldHarvestSnapshot.status === 'harvest_window') {
      return {
        title: days !== null && days > 0 ? `Hasada yaklaşık ${Math.round(days)} gün` : 'Hasat penceresi',
        detail: expectedDate
          ? `Beklenen tarih ${trDate(expectedDate)}`
          : averageYieldKgDa !== null
            ? `Geçmiş ort. ${formatKgDa(averageYieldKgDa)}`
            : 'Olgunluk sahada doğrulanmalı',
      };
    }

    if (days !== null && days >= 0) {
      return {
        title: `Hasada yaklaşık ${Math.round(days)} gün`,
        detail: averageYieldKgDa !== null
          ? `Geçmiş ort. ${formatKgDa(averageYieldKgDa)}${trend ? ` · ${trend}` : ''}`
          : expectedDate
            ? `Beklenen tarih ${trDate(expectedDate)}`
            : 'Fenoloji takibi sürüyor',
      };
    }

    if (averageYieldKgDa !== null) {
      return {
        title: `Geçmiş ort. ${formatKgDa(averageYieldKgDa)}`,
        detail: `${yieldTrendLabel(yieldHarvestSnapshot.history.trend)} · Güncel verim kaydı yok`,
      };
    }

    return {
      title: 'Verim kaydı henüz yok',
      detail: 'Hasat / verim girdikçe otomatik dolacak',
    };
  }, [
    averageYieldKgDa,
    currentYieldKgDa,
    yieldHarvest.error,
    yieldHarvest.loading,
    yieldHarvestSnapshot,
  ]);

  useEffect(() => {
    if (!fieldId) {
      setWeedSatelliteScreening(null);
      return undefined;
    }

    const refresh = () => {
      setWeedSatelliteScreening(readLatestWeedSatelliteScreening(fieldId));
    };

    refresh();

    if (typeof window === 'undefined') return undefined;

    const handleUpdate = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      const changedFieldId = String(detail?.fieldId ?? '').trim();
      if (changedFieldId && changedFieldId !== fieldId) return;
      refresh();
    };

    window.addEventListener(
      'tp:weed-satellite-screening-updated',
      handleUpdate as EventListener,
    );

    return () => {
      window.removeEventListener(
        'tp:weed-satellite-screening-updated',
        handleUpdate as EventListener,
      );
    };
  }, [fieldId, open]);
  const weedDecision = useMemo(
    () =>
      decisions.find(
        (item) =>
          String(item.source ?? '') === 'weed-intelligence' ||
          String(item.group ?? '') === 'weed-intelligence',
      ) ?? null,
    [decisions],
  );

  const satelliteWeedScreeningDecision = useMemo<HomeTodayDecision | HomeSystemNotification | null>(() => {
    const fromToday = decisions.find(
      (item) =>
        String(item.source ?? '') === 'satellite' &&
        String(item.group ?? '') === 'weed-satellite' &&
        String(item.target ?? '') === 'map_vegetation',
    );
    if (fromToday) return fromToday;

    return notifications.find(
      (item) =>
        String(item.source ?? '') === 'satellite' &&
        String(item.target ?? '') === 'map_vegetation' &&
        String(item.title ?? '').toLocaleLowerCase('tr-TR').includes('yabancı ot'),
    ) ?? null;
  }, [decisions, notifications]);

  const weedSummary = field?.demo
    ? 'Örnek tarlada yeterli veri yok'
    : weedSummaryLabel(weedDecision, satelliteWeedScreeningDecision, weedSatelliteScreening);

  const openWeedSummary = useCallback(() => {
    const activeDecision = weedDecision ?? satelliteWeedScreeningDecision;
    const metadata = (activeDecision?.task?.metadata ?? {}) as Record<string, unknown>;
    const observationPointId = String(metadata.observationPointId ?? '').trim() || null;
    const direction =
      String(metadata.direction ?? '').trim() ||
      weedSatelliteScreening?.strongestArea ||
      satelliteWeedAreaLabel(satelliteWeedScreeningDecision) ||
      null;
    const areaGeometry = metadata.areaGeometry ?? null;
    const importantArea = metadata.importantArea && typeof metadata.importantArea === 'object'
      ? metadata.importantArea as Record<string, unknown>
      : null;
    const target = activeDecision?.target ?? 'map_vegetation';
    const source = weedDecision ? 'weed-intelligence' : 'weed-satellite';

    onOpenTarget?.(target, {
      observationPointId,
      source,
    });

    const geometry = areaGeometry ?? importantArea?.geometry ?? null;
    const area = direction ?? (String(importantArea?.area ?? '').trim() || null);

    if (typeof window === 'undefined' || (!area && !geometry)) return;

    window.setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent('tp:home-map-show-pusula-area', {
          detail: {
            fieldId,
            layer: 'vegetation',
            openPhoto: false,
            importantArea: {
              area,
              geometry,
            },
            observationPointId,
            source,
          },
        }),
      );
    }, 180);
  }, [
    fieldId,
    onOpenTarget,
    satelliteWeedScreeningDecision,
    weedDecision,
    weedSatelliteScreening,
  ]);

  const fieldName = String(field?.name ?? 'Tarlan').trim() || 'Tarlan';
  const cropName = String(field?.crop ?? '').trim();
  const cropCycle = String(field?.cropCycle ?? field?.crop_cycle ?? 'annual') === 'perennial'
    ? 'perennial'
    : 'annual';
  const rscmSupported = isRscmSupportedCrop(cropName);
  const stageLabel = String(phenology?.stageLabel ?? '').trim();
  const phenologyUsable = Boolean(
    phenology?.dataStatus === 'usable' &&
      phenology.stage &&
      phenology.stage !== 'unknown',
  );

  const latitude = finite(field?.parcelCentroidLat ?? field?.parcel_centroid_lat ?? field?.latitude);
  const longitude = finite(field?.parcelCentroidLng ?? field?.parcel_centroid_lng ?? field?.longitude);

  const loadScientific = useCallback(async () => {
    if (!fieldId || field?.demo) {
      setSignals(EMPTY_SIGNALS);
      return EMPTY_SIGNALS;
    }
    setSignalsLoading(true);
    try {
      const result = await loadFieldScientificSignals(fieldId);
      setSignals(result);
      return result;
    } catch (error) {
      setScientificMessage(
        error instanceof Error ? error.message : 'Bilimsel tarla verileri okunamadı.',
      );
      return EMPTY_SIGNALS;
    } finally {
      setSignalsLoading(false);
    }
  }, [fieldId, field?.demo]);

  const loadSuitability = useCallback(async () => {
    if (!fieldId || field?.demo) {
      setCropSuitability(null);
      return;
    }
    setCropLoading(true);
    setCropError('');
    try {
      setCropSuitability(await fetchFieldCropSuitability(fieldId, cropName || null));
    } catch (error) {
      setCropError(error instanceof Error ? error.message : 'Ürün uygunluğu alınamadı.');
    } finally {
      setCropLoading(false);
    }
  }, [fieldId, field?.demo, cropName]);

  const loadSoil = useCallback(async (forceRefresh = false) => {
    if (!fieldId || field?.demo) {
      setSoilProfile(null);
      return;
    }
    if (latitude === null || longitude === null) {
      setSoilProfile(null);
      setSoilError('Tahmini toprak profili için tarla koordinatı gerekli.');
      return;
    }
    setSoilLoading(true);
    setSoilError('');
    try {
      setSoilProfile(await fetchSoilGridsProfile(latitude, longitude, { forceRefresh }));
    } catch (error) {
      setSoilError(error instanceof Error ? error.message : 'Tahmini toprak profili alınamadı.');
    } finally {
      setSoilLoading(false);
    }
  }, [fieldId, field?.demo, latitude, longitude]);

  const loadSeasons = useCallback(async () => {
    if (!fieldId || field?.demo) {
      setSeasons([]);
      return;
    }
    setSeasonsLoading(true);
    try {
      const { data, error } = await supabase
        .from('field_seasons')
        .select('id, field_id, year, crop, variety_name, planting_date, harvest_date, notes')
        .eq('field_id', fieldId)
        .order('year', { ascending: false });
      if (error) throw error;
      setSeasons((data ?? []).map((item: any) => ({
        id: String(item.id),
        fieldId: String(item.field_id),
        year: Number(item.year),
        crop: item.crop ?? (cropName || 'Ürün belirtilmedi'),
        varietyName: item.variety_name ?? null,
        plantingDate: item.planting_date ?? null,
        harvestDate: item.harvest_date ?? null,
        notes: item.notes ?? null,
      })));
    } catch {
      setSeasons([]);
    } finally {
      setSeasonsLoading(false);
    }
  }, [fieldId, field?.demo, cropName]);

  const loadSoilAnalyses = useCallback(async () => {
    if (!fieldId || field?.demo) {
      setSoilAnalyses([]);
      return;
    }
    setSoilAnalysesLoading(true);
    try {
      setSoilAnalyses(await listSoilAnalyses(fieldId));
    } catch {
      setSoilAnalyses([]);
    } finally {
      setSoilAnalysesLoading(false);
    }
  }, [fieldId, field?.demo]);

  const loadRecentActivities = useCallback(async () => {
    if (!fieldId || field?.demo) {
      setRecentActivities([]);
      return;
    }
    try {
      const { data, error } = await supabase
        .from('activities')
        .select('id, activity_type, title, activity_date, cost')
        .eq('field_id', fieldId)
        .order('activity_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(6);
      if (error) throw error;
      setRecentActivities((data ?? []).map((item: any) => ({
        id: String(item.id),
        title: String(item.title ?? item.activity_type ?? 'Tarla işlemi'),
        type: String(item.activity_type ?? 'İşlem'),
        date: item.activity_date ?? null,
        cost: finite(item.cost),
      })));
    } catch {
      setRecentActivities([]);
    }
  }, [fieldId, field?.demo]);

  const loadProductionExtras = useCallback(async () => {
    if (!fieldId || field?.demo) {
      setPerennialYields([]);
      setFieldSections([]);
      return;
    }
    try {
      const [yieldResult, sectionResult] = await Promise.all([
        supabase
          .from('perennial_yields')
          .select('id, year, yield_kg, harvest_date')
          .eq('field_id', fieldId)
          .is('field_section_id', null)
          .order('year', { ascending: false }),
        supabase
          .from('field_sections')
          .select('id, name, crop, area_decare')
          .eq('field_id', fieldId)
          .order('created_at', { ascending: true }),
      ]);
      if (yieldResult.error) throw yieldResult.error;
      if (sectionResult.error) throw sectionResult.error;
      setPerennialYields((yieldResult.data ?? []).map((item: any) => ({
        id: String(item.id),
        year: Number(item.year),
        yieldKg: finite(item.yield_kg),
        harvestDate: item.harvest_date ?? null,
      })));
      setFieldSections((sectionResult.data ?? []).map((item: any) => ({
        id: String(item.id),
        name: String(item.name ?? 'İsimsiz bölüm'),
        crop: String(item.crop ?? 'Ürün belirtilmedi'),
        area: finite(item.area_decare),
      })));
    } catch {
      setPerennialYields([]);
      setFieldSections([]);
    }
  }, [fieldId, field?.demo]);

  const loadIrrigationProfile = useCallback(async () => {
    if (!fieldId || field?.demo) return;
    setIrrigationProfileLoading(true);
    setIrrigationProfileMessage('');
    try {
      const [completion, fieldResult] = await Promise.all([
        loadFieldCompletionContext(fieldId),
        supabase
          .from('fields')
          .select('crop_subtype')
          .eq('id', fieldId)
          .maybeSingle(),
      ]);
      if (fieldResult.error) throw fieldResult.error;
      const status = completion?.irrigationStatus === 'irrigated'
        ? 'sulu'
        : completion?.irrigationStatus === 'rainfed'
          ? 'susuz'
          : completion?.irrigationStatus === 'partial'
            ? 'kısmi'
            : '';
      const rawSubtype = String(fieldResult.data?.crop_subtype ?? '').toLocaleLowerCase('tr-TR');
      const cropSubtype = ['table', 'sofralık', 'sofralik'].includes(rawSubtype)
        ? 'table'
        : ['wine', 'şaraplık', 'saraplik'].includes(rawSubtype)
          ? 'wine'
          : '';
      setIrrigationProfile({
        status,
        cropSubtype,
        canopyCover: completion?.canopyCoverPercent == null ? '' : String(completion.canopyCoverPercent),
        canopyHeight: completion?.canopyHeightM == null ? '' : String(completion.canopyHeightM),
      });
    } catch (error) {
      setIrrigationProfileMessage(error instanceof Error ? error.message : 'Sulama profili okunamadı.');
    } finally {
      setIrrigationProfileLoading(false);
    }
  }, [fieldId, field?.demo]);

  const saveIrrigationProfile = useCallback(async () => {
    if (!fieldId || field?.demo || irrigationProfileSaving) return;
    setIrrigationProfileSaving(true);
    setIrrigationProfileMessage('');
    try {
      if (irrigationProfile.status) {
        await saveFieldIrrigationStatus({
          fieldId,
          irrigationStatus: irrigationProfile.status as 'sulu' | 'susuz' | 'kısmi',
        });
      }

      const canopyCoverText = String(irrigationProfile.canopyCover ?? '').replace(',', '.').trim();
      if (canopyCoverText) {
        const canopyCover = Number(canopyCoverText);
        if (!Number.isFinite(canopyCover) || canopyCover < 0 || canopyCover > 100) {
          throw new Error('Taç / bitki örtüsü 0 ile 100 arasında olmalı.');
        }
        await saveFieldCanopyCoverPercent({ fieldId, canopyCoverPercent: canopyCover });
      }

      const canopyHeightText = String(irrigationProfile.canopyHeight ?? '').replace(',', '.').trim();
      if (canopyHeightText) {
        const canopyHeight = Number(canopyHeightText);
        if (!Number.isFinite(canopyHeight) || canopyHeight <= 0 || canopyHeight > 30) {
          throw new Error('Bitki / ağaç yüksekliği 0 ile 30 metre arasında olmalı.');
        }
        await saveFieldCanopyHeightM({ fieldId, canopyHeightM: canopyHeight });
      }

      if (normalizedCrop(cropName).includes('üzüm') || normalizedCrop(cropName).includes('uzum') || normalizedCrop(cropName).includes('grape')) {
        if (!irrigationProfile.cropSubtype) {
          throw new Error('Üzüm için Sofralık veya Şaraplık seçimini yap.');
        }
        const { error } = await supabase
          .from('fields')
          .update({
            crop_subtype: irrigationProfile.cropSubtype,
            updated_at: new Date().toISOString(),
          })
          .eq('id', fieldId);
        if (error) throw error;
      }

      setIrrigationProfileMessage('Sulama profili kaydedildi. Su dengesi yeniden hesaplanıyor.');
      onFieldPatch?.({
        irrigationStatus: irrigationProfile.status === 'sulu'
          ? 'irrigated'
          : irrigationProfile.status === 'susuz'
            ? 'rainfed'
            : irrigationProfile.status === 'kısmi'
              ? 'partial'
              : field?.irrigationStatus ?? null,
        cropSubtype: irrigationProfile.cropSubtype || null,
        canopyCoverPercent: canopyCoverText ? Number(canopyCoverText) : null,
        canopyHeightM: canopyHeightText ? Number(canopyHeightText) : null,
      });
      if (typeof irrigation?.refresh === 'function') irrigation.refresh();
    } catch (error) {
      setIrrigationProfileMessage(error instanceof Error ? error.message : 'Sulama profili kaydedilemedi.');
    } finally {
      setIrrigationProfileSaving(false);
    }
  }, [fieldId, field?.demo, field?.irrigationStatus, cropName, irrigationProfile, irrigationProfileSaving, irrigation, onFieldPatch]);

  const openRecordEditor = useCallback((kind: 'profile' | 'season' | 'section' | 'activity') => {
    setRecordMessage('');
    const today = new Date().toISOString().slice(0, 10);
    if (kind === 'profile') {
      setRecordDraft({
        cropCycle,
        plantingYear: String(field?.plantingYear ?? field?.planting_year ?? ''),
        bearing: Boolean(field?.bearing ?? true),
      });
    } else if (kind === 'season') {
      setRecordDraft({
        year: String(new Date().getFullYear()),
        crop: cropName,
        plantingDate: '',
        harvestDate: '',
        yieldKg: '',
        notes: '',
      });
    } else if (kind === 'section') {
      setRecordDraft({ name: '', crop: cropName, area: '' });
    } else {
      setRecordDraft({ activityType: 'Saha Kontrolü', date: today, cost: '', notes: '' });
    }
    setRecordEditor(kind);
  }, [cropCycle, cropName, field?.plantingYear, field?.planting_year, field?.bearing]);

  const updateRecordDraft = useCallback((key: string, value: string | boolean) => {
    setRecordDraft((current) => ({ ...current, [key]: value }));
  }, []);

  const saveInlineRecord = useCallback(async () => {
    if (!recordEditor || !fieldId || field?.demo || recordSaving) return;
    setRecordSaving(true);
    setRecordMessage('');
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!user) throw new Error('Oturum bulunamadı.');

      if (recordEditor === 'profile') {
        const nextCycle = recordDraft.cropCycle === 'perennial' ? 'perennial' : 'annual';
        const plantingYearText = String(recordDraft.plantingYear ?? '').trim();
        const plantingYear = plantingYearText ? Number(plantingYearText) : null;
        if (nextCycle === 'perennial' && (plantingYear === null || !Number.isInteger(plantingYear) || plantingYear < 1900 || plantingYear > new Date().getFullYear())) {
          throw new Error('Çok yıllık ürün için geçerli dikim yılını gir.');
        }
        const bearing = nextCycle === 'perennial' ? Boolean(recordDraft.bearing) : null;
        const { error } = await supabase
          .from('fields')
          .update({ crop_cycle: nextCycle, planting_year: nextCycle === 'perennial' ? plantingYear : null, bearing, updated_at: new Date().toISOString() })
          .eq('id', fieldId)
          .eq('user_id', user.id);
        if (error) throw error;
        onFieldPatch?.({ cropCycle: nextCycle, crop_cycle: nextCycle, plantingYear: nextCycle === 'perennial' ? plantingYear : null, planting_year: nextCycle === 'perennial' ? plantingYear : null, bearing });
      }

      if (recordEditor === 'season') {
        const year = Number(String(recordDraft.year ?? '').trim());
        if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Geçerli bir üretim yılı gir.');
        const notes = String(recordDraft.notes ?? '').trim() || null;
        const harvestDate = String(recordDraft.harvestDate ?? '').trim() || null;
        if (cropCycle === 'perennial') {
          const yieldText = String(recordDraft.yieldKg ?? '').replace(',', '.').trim();
          const yieldKg = yieldText ? Number(yieldText) : null;
          if (yieldKg !== null && (!Number.isFinite(yieldKg) || yieldKg < 0)) throw new Error('Verim miktarı geçerli değil.');
          const { data: existing, error: existingError } = await supabase
            .from('perennial_yields')
            .select('id')
            .eq('field_id', fieldId)
            .eq('user_id', user.id)
            .eq('year', year)
            .is('field_section_id', null)
            .maybeSingle();
          if (existingError) throw existingError;
          if (existing?.id) {
            const { error } = await supabase.from('perennial_yields').update({ yield_kg: yieldKg, harvest_date: harvestDate, notes, updated_at: new Date().toISOString() }).eq('id', existing.id).eq('user_id', user.id);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('perennial_yields').insert({ field_id: fieldId, user_id: user.id, field_section_id: null, year, yield_kg: yieldKg, harvest_date: harvestDate, notes });
            if (error) throw error;
          }
        } else {
          const crop = String(recordDraft.crop ?? '').trim();
          if (!crop) throw new Error('Sezonda yetiştirilen ürünü yaz.');
          const yieldText = String(recordDraft.yieldKg ?? '').replace(',', '.').trim();
          const yieldKg = yieldText ? Number(yieldText) : null;
          if (yieldKg !== null && (!Number.isFinite(yieldKg) || yieldKg < 0)) throw new Error('Verim miktarı geçerli değil.');
          if (yieldKg !== null && yieldKg > 0 && !harvestDate) {
            throw new Error('Gerçek verim kaydı için hasat tarihini de gir.');
          }

          const { error } = await supabase.from('field_seasons').insert({
            field_id: fieldId,
            user_id: user.id,
            year,
            crop,
            planting_date: String(recordDraft.plantingDate ?? '').trim() || null,
            harvest_date: harvestDate,
            notes,
          });
          if (error) throw error;

          if (yieldKg !== null && yieldKg > 0 && harvestDate) {
            const { error: harvestError } = await supabase.from('activities').insert({
              user_id: user.id,
              field_id: fieldId,
              field_section_id: null,
              activity_type: 'Hasat',
              title: 'Hasat',
              activity_date: harvestDate,
              quantity: yieldKg,
              unit: 'kg',
              notes,
            });
            if (harvestError) throw harvestError;

            notifyFieldOperationImpact({
              fieldId,
              type: 'Hasat',
              mutation: 'saved',
              source: 'field-status-yield-harvest-entry',
              operation: {
                fieldId,
                type: 'Hasat',
                date: harvestDate,
                quantity: yieldKg,
                unit: 'kg',
                notes,
              },
            });
          }
        }
      }

      if (recordEditor === 'section') {
        const name = String(recordDraft.name ?? '').trim();
        const crop = String(recordDraft.crop ?? '').trim();
        const areaText = String(recordDraft.area ?? '').replace(',', '.').trim();
        const area = areaText ? Number(areaText) : null;
        if (!name || !crop) throw new Error('Bölüm adı ve ürün bilgisini doldur.');
        if (area !== null && (!Number.isFinite(area) || area <= 0)) throw new Error('Bölüm alanı geçerli değil.');
        const usedArea = fieldSections.reduce((sum, item) => sum + (item.area ?? 0), 0);
        const fieldArea = finite(field?.area) ?? 0;
        if (area !== null && fieldArea > 0 && usedArea + area > fieldArea + 0.0001) throw new Error(`Bölümlerin toplam alanı ${fieldArea.toLocaleString('tr-TR')} da değerini geçemez.`);
        const { error } = await supabase.from('field_sections').insert({ field_id: fieldId, user_id: user.id, name, crop, area_decare: area });
        if (error) throw error;
      }

      if (recordEditor === 'activity') {
        const activityType = String(recordDraft.activityType ?? '').trim() || 'Saha Kontrolü';
        const activityDate = String(recordDraft.date ?? '').trim() || new Date().toISOString().slice(0, 10);
        const costText = String(recordDraft.cost ?? '').replace(',', '.').trim();
        const cost = costText ? Number(costText) : null;
        if (cost !== null && (!Number.isFinite(cost) || cost < 0)) throw new Error('Masraf tutarı geçerli değil.');
        const notes = String(recordDraft.notes ?? '').trim() || null;
        const { error } = await supabase.from('activities').insert({
          user_id: user.id,
          field_id: fieldId,
          field_section_id: null,
          activity_type: activityType,
          title: activityType,
          activity_date: activityDate,
          cost,
          notes,
        });
        if (error) throw error;

        notifyFieldOperationImpact({
          fieldId,
          type: activityType,
          mutation: 'saved',
          source: 'field-status-inline-record',
          operation: {
            fieldId,
            type: activityType,
            date: activityDate,
            cost,
            notes,
          },
        });
      }

      await Promise.all([
        loadSeasons(),
        loadRecentActivities(),
        loadProductionExtras(),
        yieldHarvest.refresh({ forcePhenologyRefresh: false }),
      ]);
      setRecordEditor(null);
      setRecordMessage('Verim / hasat kaydı kaydedildi. Tarla Durumu güncellendi.');
    } catch (error) {
      setRecordMessage(error instanceof Error ? error.message : 'Kayıt kaydedilemedi.');
    } finally {
      setRecordSaving(false);
    }
  }, [recordEditor, recordDraft, recordSaving, fieldId, field?.demo, field?.area, cropCycle, fieldSections, loadSeasons, loadRecentActivities, loadProductionExtras, onFieldPatch, yieldHarvest]);

  const handleFindLabs = useCallback(async () => {
    if (!field || field?.demo || labsLoading) return;
    setLabsOpen(true);
    setLabsLoading(true);
    setLabsMessage('Yakındaki laboratuvarlar aranıyor…');
    try {
      const results = await findNearbySoilLabs({
        latitude,
        longitude,
        city: String(field?.city ?? ''),
        district: String(field?.district ?? ''),
      });
      setLabs(results);
      setLabsMessage(
        results.length
          ? `${results.length} laboratuvar / analiz noktası bulundu. Gitmeden önce toprak analizi yaptıklarını telefonla doğrula.`
          : 'Bu tarla çevresinde sonuç bulunamadı. Tarla konumunu kontrol edip tekrar deneyebilirsin.',
      );
    } catch (error) {
      setLabs([]);
      setLabsMessage(error instanceof Error ? error.message : 'Yakındaki laboratuvarlar getirilemedi.');
    } finally {
      setLabsLoading(false);
    }
  }, [field, latitude, longitude, labsLoading]);

  const handleSoilUpload = useCallback(async (file: File | null) => {
    if (!file || !fieldId || !field || field?.demo || soilUploadLoading) return;
    setSoilUploadLoading(true);
    setSoilUploadMessage('Rapor yükleniyor ve Toprak Analizi AI tarafından yorumlanıyor…');
    try {
      const record = await analyzeSoilReport({
        file,
        field: {
          id: fieldId,
          name: fieldName,
          crop: cropName,
          area: finite(field?.area),
          ada: field?.ada ?? null,
          parsel: field?.parsel ?? null,
          city: String(field?.city ?? ''),
          district: String(field?.district ?? ''),
          village: String(field?.village ?? ''),
        },
      });
      setSoilAnalyses((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      let rewardText = '';
      try {
        const reward = await addPoints('ADD_SOIL_ANALYSIS', {
          dedupeKey: `soil-analysis:${String(record.id)}`,
          metadata: { source: 'soil_analysis', analysisId: String(record.id), fieldId, fieldName },
          toastTitle: 'Toprak analizi ödülü',
        });
        if (reward.awarded && reward.awardedPoints > 0) rewardText = ` +${reward.awardedPoints} Pusula Puanı.`;
      } catch {
        // Analiz kaydı başarılıysa puan hatası kullanıcı verisini bozmaz.
      }
      setSoilUploadMessage(`Toprak analizi kaydedildi ve yorumlandı.${rewardText}`);
    } catch (error) {
      setSoilUploadMessage(error instanceof Error ? error.message : 'Toprak analizi yüklenemedi.');
    } finally {
      setSoilUploadLoading(false);
    }
  }, [fieldId, field, fieldName, cropName, soilUploadLoading]);

  const openSoilAnalysisFile = useCallback(async (record: SoilAnalysisRecord) => {
    const path = record.pdf_path || record.report_path;
    if (!path) return;
    try {
      const url = await getSoilAnalysisFileUrl(path);
      if (url && typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setSoilUploadMessage(error instanceof Error ? error.message : 'Analiz dosyası açılamadı.');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setTab(initialTab);
    setSignals(EMPTY_SIGNALS);
    setCropSuitability(null);
    setSoilProfile(null);
    setSoilError('');
    setSeasons([]);
    setRecentActivities([]);
    setPerennialYields([]);
    setFieldSections([]);
    setRecordEditor(null);
    setRecordMessage('');
    setSoilAnalyses([]);
    setSoilUploadMessage('');
    setLabs([]);
    setLabsMessage('');
    setLabsOpen(false);
    setSoilGuideOpen(false);
    setFieldObservationOpen(false);
    setScientificMessage('');
    setRefreshSteps([]);
    void loadScientific();
    void loadSuitability();
    void loadSeasons();
    void loadSoilAnalyses();
    void loadRecentActivities();
    void loadProductionExtras();
  }, [open, fieldId, initialTab, loadScientific, loadSuitability, loadSeasons, loadSoilAnalyses, loadRecentActivities, loadProductionExtras]);

  useEffect(() => {
    if (!open || !initialActionTarget) return;
    const target = String(initialActionTarget).trim();
    if (!target || consumedInitialActionRef.current === target) return;
    consumedInitialActionRef.current = target;

    if (/soil-analysis|soil/i.test(target)) {
      setTab('soil');
      return;
    }
    if (/water-measurement/i.test(target)) {
      setTab('input');
      window.setTimeout(() => {
        const section = document.getElementById('field-water-measurements');
        const details = section?.querySelector<HTMLDetailsElement>('details');
        if (details) details.open = true;
        section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
          section
            ?.querySelector<HTMLInputElement>('input[placeholder="Örn. 24.5"]')
            ?.focus();
        }, 160);
      }, 120);
      return;
    }
    if (/irrigation|last-irrigation|soil-water/i.test(target)) {
      setTab('irrigation');
      return;
    }
    if (/field-growth|phenology|observation/i.test(target)) {
      setTab('plant');
      setFieldObservationOpen(true);
      return;
    }
    if (/field-production-profile|production-profile/i.test(target)) {
      setTab('input');
      openRecordEditor('profile');
      return;
    }
    if (/field-season|field-yield|yield/i.test(target)) {
      setTab('input');
      openRecordEditor('season');
      return;
    }
    if (/field-section|section/i.test(target)) {
      setTab('input');
      openRecordEditor('section');
      return;
    }
    if (/field-activity|activity|operation|cost/i.test(target)) {
      setTab('input');
      openRecordEditor('activity');
      return;
    }

    setTab('input');
  }, [open, initialActionTarget, openRecordEditor]);

  useEffect(() => {
    if (!open) consumedInitialActionRef.current = '';
  }, [open]);

  useEffect(() => {
    if (!open || !recordsRefreshNonce) return;
    void loadRecentActivities();
    void loadSeasons();
    void loadProductionExtras();
  }, [open, recordsRefreshNonce, loadRecentActivities, loadSeasons, loadProductionExtras]);

  useEffect(() => {
    if (!open || !fieldId || typeof window === 'undefined') return;

    const refreshSavedOperations = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      if (String(detail?.fieldId ?? '') !== fieldId) return;
      void loadRecentActivities();
    };

    window.addEventListener(
      'tp:field-operation-saved',
      refreshSavedOperations as EventListener,
    );

    return () => {
      window.removeEventListener(
        'tp:field-operation-saved',
        refreshSavedOperations as EventListener,
      );
    };
  }, [open, fieldId, loadRecentActivities]);

  useEffect(() => {
    if (!open || tab !== 'soil') return;
    if (!soilProfile && !soilLoading && !soilError) void loadSoil(false);
  }, [open, tab, soilProfile, soilLoading, soilError, loadSoil]);

  useEffect(() => {
    if (!open || tab !== 'irrigation') return;
    void loadIrrigationProfile();
  }, [open, tab, fieldId, loadIrrigationProfile]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const refreshScientific = useCallback(async (silent = false) => {
    if (!fieldId || refreshing || field?.demo) return;
    setRefreshing(true);
    if (!silent) setScientificMessage('Uydu ve model verileri kontrol ediliyor…');
    try {
      const result = await refreshFieldScientificSignals(fieldId);
      setSignals(result.signals);
      setRefreshSteps(result.steps);

      if (typeof window !== 'undefined') {
        window.dispatchEvent(
          new CustomEvent('tp:field-context-updated', {
            detail: { fieldId, changedFields: [] },
          }),
        );
      }

      const completed = result.steps.filter((item) => item.ok && !item.blocked).length;
      const waiting = result.steps.filter((item) => item.blocked).length;
      const failures = result.steps.filter((item) => !item.ok && !item.blocked);

      if (failures.length) {
        const first = failures[0];
        setScientificMessage(stepReason(first) || 'Bilimsel veri servislerinden biri çalışmadı.');
      } else if (completed > 0) {
        setScientificMessage(
          `${completed} katman güncellendi${waiting ? ` · ${waiting} katman veri / kapsam bekliyor` : ''}.`,
        );
      } else if (waiting > 0) {
        const firstWaiting = result.steps.find((item) => item.blocked);
        setScientificMessage(stepReason(firstWaiting) || 'Bilimsel katmanlar gerekli gerçek veriyi bekliyor.');
      } else if (!silent) {
        setScientificMessage('Bilimsel katmanlar kontrol edildi.');
      }
    } catch (error) {
      setScientificMessage(error instanceof Error ? error.message : 'Bilimsel veriler yenilenemedi.');
    } finally {
      setRefreshing(false);
    }
  }, [fieldId, refreshing, field?.demo]);

  useEffect(() => {
    if (!open || !fieldId || field?.demo || signalsLoading || signals.biophysics.latest) return;
    if (autoRefreshAttempted.current.has(fieldId) || autoRefreshRecentlyAttempted(fieldId)) return;
    autoRefreshAttempted.current.add(fieldId);
    markAutoRefreshAttempt(fieldId);
    void refreshScientific(true);
  }, [open, fieldId, field?.demo, signalsLoading, signals.biophysics.latest, refreshScientific]);

  const latest = signals.biophysics.latest;
  const metrics = latest?.metrics ?? {};
  const biophysicsInsight = useMemo(
    () =>
      buildFieldBiophysicsInsight({
        history: signals.biophysics.history,
        cropName,
        stageLabel,
      }),
    [signals.biophysics.history, cropName, stageLabel],
  );
  const rscm = signals.rscm?.assimilation ?? signals.rscm ?? null;
  const confidence = signals.dataConfidence?.data_confidence ?? signals.dataConfidence ?? null;
  const dataConfidenceScore = finite(confidence?.score);
  const modelAlignment = finite(rscm?.model_reality_alignment_score);

  const sl2pStep = refreshSteps.find((item) => item.engine === 'sl2p');
  const rscmStep = refreshSteps.find((item) => item.engine === 'rscm');
  const unicropStep = refreshSteps.find((item) => item.engine === 'unicrop');

  useEffect(() => {
    if (!open || !fieldId || field?.demo || !latest) return;
    if (!biophysicsInsight.comparisonReady) return;
    if (biophysicsInsight.quality === 'low' || biophysicsInsight.quality === 'unknown') return;
    syncBiophysicalTrendTaskBestEffort(fieldId, biophysicsInsight.taskCandidate);
  }, [
    open,
    fieldId,
    field?.demo,
    latest?.sceneId,
    biophysicsInsight.comparisonReady,
    biophysicsInsight.quality,
    biophysicsInsight.taskCandidate,
  ]);

  const irrigationDistributionSignal = useMemo(() => {
    const decision = decisions.find((item) => item.source === 'irrigation-distribution');
    if (decision) return decision;
    return notifications.find((item) => item.source === 'irrigation-distribution') ?? null;
  }, [decisions, notifications]);

  const multiStressSignal = useMemo(() => {
    const decision = decisions.find((item) => item.source === 'multi-stress');
    if (decision) return decision;
    return notifications.find((item) => item.source === 'multi-stress') ?? null;
  }, [decisions, notifications]);

  const riskItems = useMemo(() => {
    const isRealRisk = (item: { source?: string; severity?: string; title?: string; detail?: string; kind?: string }) => {
      const title = String(item.title ?? '');
      const detail = String(item.detail ?? '');
      const source = String(item.source ?? '');

      // Risk sekmesi yalnız gerçek risk taşır. Veri tamamlama, hazır bilgi, görev,
      // genel saha kontrolü veya "risk skoru tek başına karar değildir" gibi
      // açıklama metinleri burada yanlışlıkla risk olarak görünmez.
      if (/^(uydu görüntüsü hazır|yeni görev tanımlandı|sulama verisini tamamla|veri|kayıt)/i.test(title.trim())) return false;
      if (source === 'task-system' || source === 'notification' || source === 'multi-stress') return false;
      if (item.kind === 'avoid') return true;
      if (source === 'risk-radar') return true;

      const titleHasRisk = TRUE_RISK_TERMS.test(title);
      if (!titleHasRisk) return false;

      return item.severity === 'danger' || item.severity === 'warning' || item.kind === 'check' || TRUE_RISK_TERMS.test(detail);
    };

    const fromNotifications = notifications
      .filter((item) => !item.task)
      .filter((item) => isRealRisk(item))
      .map((item) => ({
        id: `n:${item.id}`,
        title: item.title,
        detail: item.detail,
        target: item.target,
        source: item.source,
        severity: item.severity,
        priority: item.priority,
      }));

    const notificationIds = new Set(fromNotifications.map((item) => `${item.title}|${item.detail}`));
    const fromDecisions = decisions
      .filter((item) => isRealRisk(item))
      .filter((item) => !notificationIds.has(`${item.title}|${item.detail}`))
      .map((item) => ({
        id: `d:${item.id}`,
        title: item.title,
        detail: item.detail,
        target: item.target,
        source: item.source,
        severity: item.kind === 'avoid' ? 'warning' : 'info',
        priority: item.priority,
      }));

    return [...fromNotifications, ...fromDecisions]
      .sort((a, b) => Number(b.priority ?? 0) - Number(a.priority ?? 0))
      .slice(0, 8);
  }, [notifications, decisions]);


  const metricCards = [
    { key: 'LAI', label: 'Yaprak alanı', helper: 'LAI' },
    { key: 'CCC', label: 'Klorofil', helper: 'CCC' },
    { key: 'CWC', label: 'Bitki suyu', helper: 'CWC' },
    { key: 'fCOVER', label: 'Bitki örtüsü', helper: 'fCOVER' },
    { key: 'fAPAR', label: 'Işık kullanımı', helper: 'fAPAR' },
    { key: 'Albedo', label: 'Yansıtım', helper: 'Albedo' },
  ];

  const irrigationResult = irrigation?.result ?? irrigation?.decision ?? null;
  const irrigationEvidence = irrigation?.modelEvidence ?? irrigationResult?.modelEvidence ?? null;
  const irrigationStatus = String(irrigation?.status ?? 'idle');
  const irrigationMissing = Array.isArray(irrigationEvidence?.missingInputs)
    ? irrigationEvidence.missingInputs
    : Array.isArray(irrigationResult?.missing)
      ? irrigationResult.missing
      : [];
  const irrigationUserMissing = irrigationMissing
    .map((value: unknown) => String(value))
    .filter((code: string) => USER_ACTIONABLE_IRRIGATION_MISSING.has(code));
  const irrigationSystemMissing = irrigationMissing
    .map((value: unknown) => String(value))
    .filter((code: string) => !USER_ACTIONABLE_IRRIGATION_MISSING.has(code));

  const missingDataItems = useMemo(() => {
    const codes = new Set<string>();

    refreshSteps.forEach((step) => {
      (step.missingInputs ?? []).forEach((value) => codes.add(String(value)));
    });
    if (Array.isArray(confidence?.missing_required)) {
      confidence.missing_required.forEach((value: unknown) => codes.add(String(value)));
    }
    irrigationUserMissing.forEach((value: string) => codes.add(value));

    if (latitude === null || longitude === null) codes.add('field_location');
    if (cropCycle === 'annual' && !seasons.some((season) => Boolean(season.plantingDate))) codes.add('planting_date');

    const storedPlantingYear = finite(field?.plantingYear ?? field?.planting_year);
    if (seasons.length || perennialYields.length || recentActivities.length || (cropCycle === 'perennial' && storedPlantingYear !== null)) {
      codes.delete('field_management');
    }
    if (!rscmSupported) codes.delete('supported_crop_wheat_maize_rice');
    if (soilAnalyses.length) codes.delete('soil_profile');

    return [...codes]
      .filter(Boolean)
      .map((code) => ({
        code,
        label: dataRequirementLabel(code),
        systemWaiting: isSystemWaitingRequirement(code),
      }));
  }, [refreshSteps, confidence?.missing_required, irrigationUserMissing, latitude, longitude, cropCycle, seasons, perennialYields, recentActivities, soilAnalyses, field?.plantingYear, field?.planting_year, rscmSupported]);

  const userMissingItems = missingDataItems.filter((item) => !item.systemWaiting);
  const systemWaitingItems = missingDataItems.filter((item) => item.systemWaiting);

  const focusIrrigationInput = (code: string) => {
    setTab('input');

    window.setTimeout(() => {
      if ([
        'soil_water_measurement',
        'current_surface_water_measurement',
        'current_surface_depletion_measurement',
        'current_root_zone_water_measurement',
        'current_root_zone_depletion',
      ].includes(code)) {
        const section = document.getElementById('field-water-measurements');
        const details = section?.querySelector<HTMLDetailsElement>('details');
        if (details) details.open = true;
        section?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        window.setTimeout(() => {
          section?.querySelector<HTMLInputElement>('input[placeholder="Örn. 24.5"]')?.focus();
        }, 160);
        return;
      }

      const anchor = document.querySelector<HTMLElement>(`[data-irrigation-input="${code}"]`);
      anchor?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      window.setTimeout(() => {
        if (anchor instanceof HTMLInputElement || anchor instanceof HTMLSelectElement) {
          anchor.focus();
        } else {
          anchor?.querySelector<HTMLInputElement | HTMLSelectElement>('input,select')?.focus();
        }
      }, 140);
    }, 80);
  };

  const openMissingItem = (code: string) => {
    if (code === 'planting_date' || code === 'field_management') {
      openRecordEditor(code === 'planting_date' && cropCycle === 'annual' ? 'season' : 'profile');
      return;
    }
    if (code === 'phenology') {
      setFieldObservationOpen(true);
      setTab('plant');
      return;
    }
    if (code === 'last_irrigation') {
      onOpenIrrigationRecord?.();
      return;
    }
    if (USER_ACTIONABLE_IRRIGATION_MISSING.has(code)) {
      focusIrrigationInput(code);
      return;
    }
    if (code === 'soil_profile') {
      setTab('soil');
      return;
    }
    if (code === 'stored_field_geometry' || code === 'field_location') {
      setTab('input');
      setRecordMessage('Tarla konumu veya parsel sınırı eksik. Ürün/dikim bilgilerini burada tamamlayabilir; parsel sınırını ana haritadaki tarla düzenleme akışından güncelleyebilirsin.');
    }
  };

  const inputActions = [
    {
      key: 'profile',
      icon: <PencilLine size={18} />,
      title: 'Ürün / dikim bilgisi',
      detail: cropCycle === 'perennial' ? 'Ürün tipi, dikim yılı, verim durumu' : 'Ürün tipi ve üretim bilgisi',
      action: () => openRecordEditor('profile'),
    },
    {
      key: 'season',
      icon: <BarChart3 size={18} />,
      title: cropCycle === 'perennial' ? 'Yıllık verim ekle' : 'Sezon / ekim tarihi ekle',
      detail: cropCycle === 'perennial' ? 'Yıl, kg, hasat tarihi' : 'Sezon, ürün, ekim ve hasat tarihi',
      action: () => openRecordEditor('season'),
    },
    {
      key: 'section',
      icon: <LandPlot size={18} />,
      title: 'Tarla bölümü ekle',
      detail: 'Bölüm adı, ürün ve alan',
      action: () => openRecordEditor('section'),
    },
    {
      key: 'observation',
      icon: <Activity size={18} />,
      title: 'Bitki evresi / saha gözlemi',
      detail: 'Gördüğün gerçek gelişim evresini ve saha notunu kaydet',
      action: () => {
        setFieldObservationOpen(true);
        setTab('plant');
      },
    },
    {
      key: 'activity',
      icon: <ClipboardPlus size={18} />,
      title: 'İşlem / masraf kaydet',
      detail: 'Sulama, gübreleme, ilaçlama, hasat, saha kontrolü',
      action: () => openRecordEditor('activity'),
    },
    {
      key: 'soil',
      icon: <FlaskConical size={18} />,
      title: 'Toprak analizi ekle',
      detail: 'Raporu burada yükle; sonuç Tarla Durumu içinde kalır',
      action: () => setTab('soil'),
    },
    {
      key: 'irrigation',
      icon: <Droplets size={18} />,
      title: 'Sulama kaydı ekle',
      detail: 'Son sulama ve uygulanan suyu kaydet',
      action: () => {
        setTab('input');
        window.setTimeout(() => document.getElementById('tp-field-status-irrigation-inputs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
      },
    },
  ];

  if (!open || typeof document === 'undefined') return null;

  const content = (
    <div
      className="tp-field-status-layer"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="tp-field-status-center"
        role="dialog"
        aria-modal="true"
        aria-label={`${fieldName} tarla durumu`}
      >
        <header className="tp-field-status-head">
          <div className="tp-field-status-head-icon" aria-hidden="true">
            <Gauge size={21} />
          </div>
          <div className="tp-field-status-head-copy">
            <span>TARLA DURUMU</span>
            <strong>{fieldName}</strong>
            <small>
              {cropName || 'Ürün belirtilmedi'}
              {field?.area ? ` · ${Number(field.area).toLocaleString('tr-TR')} da` : ''}
            </small>
          </div>
          <button type="button" className="tp-field-status-close" onClick={onClose} aria-label="Tarla durumunu kapat">
            <X size={20} />
          </button>
        </header>

        <nav className="tp-field-status-tabs" aria-label="Tarla durumu bölümleri">
          {TABS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={tab === item.key ? 'active' : ''}
              aria-pressed={tab === item.key}
              onClick={() => setTab(item.key)}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="tp-field-status-body">
          {field?.demo ? (
            <p className="tp-field-status-demo-note">
              Örnek tarlada gerçek uydu, toprak ve model kayıtları çalıştırılmaz.
            </p>
          ) : null}

          {tab === 'summary' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-hero compact">
                <div>
                  <span>BUGÜNKÜ FOTOĞRAF</span>
                  <strong>
                    {riskItems.some((item) => riskTone(item) === 'danger')
                      ? 'Dikkat isteyen sinyal var'
                      : riskItems.some((item) => riskTone(item) === 'warning')
                        ? 'Kontrol edilmesi gereken noktalar var'
                        : latest
                          ? biophysicsInsight.headline
                          : 'İlk bilimsel uydu sonucu hazırlanıyor'}
                  </strong>
                </div>
                <button type="button" className="tp-field-status-score" onClick={() => setTab('data')}>
                  <small>Veri güveni</small>
                  <strong>{dataConfidenceScore === null ? (userMissingItems.length || '—') : Math.round(dataConfidenceScore)}</strong>
                  <span>
                    {dataConfidenceScore !== null
                      ? confidenceLabel(confidence?.class)
                      : userMissingItems.length
                        ? 'Eksik bilgiyi tamamla'
                        : systemWaitingItems.length
                          ? 'Sistem verisi bekleniyor'
                          : 'Hazırlanıyor'}
                  </span>
                </button>
              </section>

              {userMissingItems.length ? (
                <button type="button" className="tp-field-status-missing-banner" onClick={() => setTab('data')}>
                  <div>
                    <span>VERİ EKSİĞİ</span>
                    <strong>{userMissingItems.length} bilgi tamamlanınca kararlar netleşecek</strong>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ) : null}

              {fieldEventCandidate ? (
                <button
                  type="button"
                  className="tp-field-status-field-event"
                  onClick={() => {
                    // Ana sayfadaki traktör butonuyla AYNI FieldOperationModal açılır.
                    // Kaynağı ve aday anahtarını da taşıyoruz; kullanıcı kayıt yapınca
                    // bu Pusula hareketlilik adayı kesin olarak çözülmüş sayılacak.
                    const candidateKey = fieldEventCandidate
                      ? fieldEventCandidateKey(fieldEventCandidate)
                      : null;
                    onClose();
                    window.setTimeout(() => {
                      window.dispatchEvent(
                        new CustomEvent('tp:home-map-open-field-operation', {
                          detail: {
                            source: 'pusula-field-event',
                            fieldId,
                            candidateKey,
                          },
                        }),
                      );
                    }, 40);
                  }}
                >
                  <span className="tp-field-status-field-event-icon" aria-hidden="true">
                    <Tractor size={19} strokeWidth={1.8} />
                  </span>
                  <span className="tp-field-status-field-event-copy">
                    <small>PUSULA TARLADA HAREKETLİLİK FARK ETTİ</small>
                    <strong>{fieldEventSummaryTitle(fieldEventCandidate)}</strong>
                    <em>Ne yaptığını belirt</em>
                  </span>
                  <ChevronRight size={18} aria-hidden="true" />
                </button>
              ) : null}

              <div className="tp-field-status-summary-grid">
                <button type="button" onClick={() => setTab('plant')}>
                  <Leaf size={18} />
                  <span>
                    <small>Bitki</small>
                    <strong>
                      {phenologyUsable && stageLabel
                        ? stageLabel
                        : latest
                          ? (biophysicsInsight.monitoringScore !== null
                            ? `Gidişat ${biophysicsInsight.monitoringScore}/100`
                            : `LAI ${formatMetric('LAI', metrics.LAI)}`)
                          : 'Gelişim evresi bekleniyor'}
                    </strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setTab('crop')}
                  className="tp-field-status-yield-summary"
                  aria-label="Verim, hasat ve kalite durumunu aç"
                >
                  <Sprout size={18} />
                  <span>
                    <small>Verim • Hasat • Kalite</small>
                    <strong>{yieldHarvestOverview.title}</strong>
                  </span>
                  <ChevronRight size={17} />
                </button>
                <button type="button" onClick={() => setTab('soil')}>
                  <LandPlot size={18} />
                  <span><small>Toprak</small><strong>{soilProfile ? textureClass(soilProfile) : 'Tahmini profil'}</strong></span>
                  <ChevronRight size={17} />
                </button>
                <button type="button" onClick={() => setTab('irrigation')}>
                  <Droplets size={18} />
                  <span><small>Sulama</small><strong>{irrigationResult?.display?.headline ?? (irrigationStatus === 'loading' ? 'Hesaplanıyor…' : 'Sulama durumu')}</strong></span>
                  <ChevronRight size={17} />
                </button>
                <button type="button" onClick={() => setTab('risk')}>
                  <AlertTriangle size={18} />
                  <span><small>Uyarılar</small><strong>{riskItems.length ? `${riskItems.length} gerçek risk uyarısı` : 'Aktif risk yok'}</strong></span>
                  <ChevronRight size={17} />
                </button>
                <button type="button" onClick={() => setTab('data')}>
                  <Database size={18} />
                  <span><small>Veri</small><strong>{modelAlignment === null ? 'Kaynak durumu' : `Model uyumu ${Math.round(modelAlignment)}/100`}</strong></span>
                  <ChevronRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={openWeedSummary}
                  aria-label={`Yabancı ot durumu: ${weedSummary}`}
                >
                  <Sprout size={18} />
                  <span><small>Yabancı Ot</small><strong>{weedSummary}</strong></span>
                  <ChevronRight size={17} />
                </button>
                <button
                  type="button"
                  onClick={() => setWorkabilityOpen((value) => !value)}
                  aria-expanded={workabilityOpen}
                  aria-label={`Tarlaya girilebilirlik: ${workability.snapshot?.headline ?? 'hesaplanıyor'}`}
                >
                  <Tractor size={18} />
                  <span>
                    <small>Tarlaya Girilebilirlik</small>
                    <strong>
                      {field?.demo
                        ? 'Örnek tarlada hesaplanmaz'
                        : workability.loading && !workability.snapshot
                          ? 'Kontrol ediliyor…'
                          : workability.snapshot?.headline ?? 'Giriş durumu hazırlanıyor'}
                    </strong>
                  </span>
                  <ChevronRight className={workabilityOpen ? 'is-open' : ''} size={17} />
                </button>
              </div>

              {workabilityOpen ? (
                <section className="tp-field-status-workability-detail" aria-label="Tarlaya girilebilirlik ayrıntısı">
                  <div className="tp-field-status-workability-head">
                    <div>
                      <span>TARLAYA GİRİLEBİLİRLİK</span>
                      <strong>
                        {field?.demo
                          ? 'Örnek tarlada gerçek giriş kararı üretilmez'
                          : workability.snapshot?.headline ?? (workability.loading ? 'Kontrol ediliyor…' : 'Giriş durumu hazırlanamadı')}
                      </strong>
                    </div>
                    <button type="button" onClick={() => setWorkabilityOpen(false)}>Kapat</button>
                  </div>

                  {workability.error ? <p>{workability.error}</p> : null}

                  {workability.snapshot ? (
                    <>
                      <p>{workability.snapshot.summary}</p>
                      <div className="tp-field-status-workability-facts">
                        <article>
                          <span>Yüzey nemi</span>
                          <strong>
                            {workability.snapshot.surfaceWater.ratioToFieldCapacity == null
                              ? 'Ölçüm yok'
                              : `%${Math.round(workability.snapshot.surfaceWater.ratioToFieldCapacity * 100)}`}
                          </strong>
                        </article>
                        <article>
                          <span>Son 24 saat yağış</span>
                          <strong>
                            {workability.snapshot.wetting.rainLast24hMm == null
                              ? 'Veri yok'
                              : `${workability.snapshot.wetting.rainLast24hMm.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm`}
                          </strong>
                        </article>
                        <article>
                          <span>Güven</span>
                          <strong>
                            {workability.snapshot.confidence === 'strong'
                              ? 'Yüksek'
                              : workability.snapshot.confidence === 'medium'
                                ? 'Orta'
                                : 'Ön değerlendirme'}
                          </strong>
                        </article>
                      </div>
                    </>
                  ) : null}
                </section>
              ) : null}

              <button type="button" className="tp-field-status-records primary" onClick={() => setTab('input')}>
                <div><span>VERİ GİRİŞİ</span><strong>Kayıt ekle veya güncelle</strong></div>
                <ChevronRight size={18} />
              </button>

              {riskItems[0] ? (
                <button
                  type="button"
                  className={`tp-field-status-highlight ${riskTone(riskItems[0])}`}
                  onClick={() => onOpenTarget?.(riskItems[0].target)}
                >
                  <div>
                    <span>{shortRiskLabel(riskItems[0].source)}</span>
                    <strong>{riskItems[0].title}</strong>
                  </div>
                  <ChevronRight size={18} />
                </button>
              ) : null}
            </div>
          )}

          {tab === 'plant' && (
            <PlantTabErrorBoundary resetKey={`${fieldId}:${recordsRefreshNonce}:${String(phenology?.stage ?? '')}`}>
              <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>BİTKİ</span>
                  <strong>
                    {phenologyUsable && stageLabel
                      ? stageLabel
                      : latest && biophysicsInsight.monitoringScore !== null
                        ? `Gidişat ${biophysicsInsight.monitoringScore}/100`
                        : latest
                          ? biophysicsInsight.headline
                          : 'Veri bekleniyor'}
                  </strong>
                </div>
                <span className={`tp-field-status-result-chip ${latest || phenologyUsable ? 'good' : 'muted'}`}>
                  {latest || phenologyUsable ? 'GÜNCEL' : 'BEKLİYOR'}
                </span>
              </section>
              <details className="tp-field-status-detail-fold">
                <summary>
                  <span><small>AYRINTILAR</small><strong>Bitki ölçümleri ve gelişim</strong><em>Uydu, evre ve saha gözlemleri</em></span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-detail-fold-body">



              <FieldGrowthStatusView field={field} phenology={phenology} />
              <OrchardChillPanel field={field} />

              <section className="tp-field-status-section-head">
                <div>
                  <span>BİTKİ ÖZELLİKLERİ</span>
                  <strong>Uydu bitki ölçümü</strong>
                  <p>Tarlanın bitki yoğunluğu, yaprak gelişimi, klorofil ve su durumunu uydu görüntüsünden ölçer.</p>
                </div>
                <button type="button" disabled={refreshing || field?.demo} onClick={() => void refreshScientific(false)}>
                  <RefreshCw size={16} className={refreshing ? 'is-spinning' : ''} />
                  {refreshing ? 'Kontrol' : 'Yenile'}
                </button>
              </section>

              {latest ? (
                <>
                  <div className="tp-field-status-source">
                    <CircleDot size={14} />
                    <span>Sentinel-2 uydu ölçümü · {trDate(latest.acquiredAt)}</span>
                    <b>{qualityLabel(latest.qc?.quality)}</b>
                  </div>
                  <div className="tp-field-status-metrics">
                    {metricCards.map((item) => {
                      const trend = biophysicsInsight.trends[item.key as keyof typeof biophysicsInsight.trends];
                      return (
                        <article key={item.key}>
                          <span>{item.label}</span>
                          <strong>{formatMetric(item.key, metrics[item.key])}</strong>
                          <div className="tp-field-status-metric-foot">
                            <small>{item.helper}</small>
                            {biophysicsInsight.comparisonReady ? (
                              <em className={`trend-${trend.direction}`}>{trend.shortLabel}</em>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>

                  <section className="tp-field-status-pusula-insight">
                    <div className="tp-field-status-pusula-insight-head">
                      <Gauge size={20} />
                      <div>
                        <span>PUSULA YORUMU</span>
                        <strong>{biophysicsInsight.headline}</strong>
                      </div>
                    </div>
                    <p>{biophysicsInsight.summary}</p>
                    <div className="tp-field-status-pusula-chips">
                      <span>{biophysicsInsight.confidenceLabel}</span>
                      <span>{biophysicsInsight.comparisonLabel}</span>
                      {biophysicsInsight.monitoringScore !== null ? (
                        <span>Gidişat {biophysicsInsight.monitoringScore}/100 · {biophysicsInsight.monitoringLabel}</span>
                      ) : null}
                      {biophysicsInsight.irrigationCanopyCoverPercent !== null ? (
                        <span>Örtü %{biophysicsInsight.irrigationCanopyCoverPercent} sulama hesabına aktarılıyor</span>
                      ) : null}
                    </div>
                    {biophysicsInsight.topChanges.length ? (
                      <div className="tp-field-status-pusula-trends">
                        {biophysicsInsight.topChanges.map((item) => (
                          <span key={item}>{item}</span>
                        ))}
                      </div>
                    ) : null}
                    {biophysicsInsight.taskCandidate.active ? (
                      <small className="tp-field-status-task-note">
                        Birden fazla gösterge birlikte gerilediği için saha kontrolü görevi Görevlerim'e eklendi.
                      </small>
                    ) : null}
                  </section>
                </>
              ) : (
                <div className="tp-field-status-source">
                  <CircleDot size={14} />
                  <span>Sentinel-2 uydu ölçümü</span>
                  <b>{refreshing ? 'Kontrol ediliyor' : 'Henüz sonuç yok'}</b>
                </div>
              )}

              {rscmSupported ? (
                <section className="tp-field-status-model-card">
                  <Activity size={19} />
                  <div>
                    <span>GELİŞİM MODELİ</span>
                    {modelAlignment !== null ? (
                      <>
                        <strong>Model–gerçeklik uyumu {Math.round(modelAlignment)}/100</strong>
                        <p>{Number(rscm?.observation_count ?? 0)} gerçek LAI tarihi ile kalibre edildi.</p>
                      </>
                    ) : (
                      <>
                        <strong>Kalibrasyon için gerçek gözlem birikiyor</strong>
                        <p>{stepReason(rscmStep) || `${signals.biophysics.historyCount}/4+ kaliteli gerçek LAI tarihi mevcut.`}</p>
                      </>
                    )}
                  </div>
                </section>
              ) : null}
              <details
                className="tp-field-status-fold"
                open={fieldObservationOpen}
                onToggle={(event) => setFieldObservationOpen(event.currentTarget.open)}
              >
                <summary>
                  <span><small>SAHADAN GÖZLEM</small><strong>Bitkinin gerçek evresini kaydet</strong></span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-fold-body">
                  {seasonsLoading && cropCycle === 'annual' ? (
                    <div className="tp-field-status-empty">Sezon kayıtları yükleniyor…</div>
                  ) : (
                    <FieldGrowthObservations
                      fieldId={fieldId}
                      seasons={seasons}
                      cropCycle={cropCycle}
                    />
                  )}
                </div>
              </details>


                </div>
              </details>
              </div>
            </PlantTabErrorBoundary>
          )}

          {tab === 'crop' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>VERİM • HASAT • KALİTE</span>
                  <strong>{yieldHarvestOverview.title}</strong>
                </div>
                <span className={`tp-field-status-result-chip ${yieldHarvestSnapshot ? 'good' : 'muted'}`}>
                  {yieldHarvestSnapshot ? 'TAKİPTE' : 'VERİ BEKLİYOR'}
                </span>
              </section>
              <details className="tp-field-status-detail-fold">
                <summary>
                  <span>
                    <small>AYRINTILAR</small>
                    <strong>Verim, hasat ve ürün ayrıntıları</strong>
                    <em>Tahminler, geçmiş, kalite ve ürün uygunluğu</em>
                  </span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-detail-fold-body">

              <section className="tp-field-status-yield-harvest">
                <header>
                  <div>
                    <span>VERİM • HASAT • KALİTE</span>
                    <strong>{yieldHarvestOverview.title}</strong>
                    <p>{yieldHarvestOverview.detail}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void yieldHarvest.refresh({ forcePhenologyRefresh: true })}
                    disabled={yieldHarvest.loading || field?.demo}
                    aria-label="Verim ve hasat bilgisini yenile"
                  >
                    <RefreshCw size={15} className={yieldHarvest.loading ? 'is-spinning' : ''} />
                    {yieldHarvest.loading ? 'Yenileniyor' : 'Yenile'}
                  </button>
                </header>

                <div className="tp-field-status-yield-metrics">
                  <div>
                    <small>Güncel verim</small>
                    <strong>
                      {currentYieldKgDa !== null
                        ? formatKgDa(currentYieldKgDa)
                        : yieldHarvestSnapshot?.observed.yieldKg !== null && yieldHarvestSnapshot?.observed.yieldKg !== undefined
                          ? `${formatKg(yieldHarvestSnapshot.observed.yieldKg)} toplam`
                          : 'Kayıt yok'}
                    </strong>
                  </div>
                  <div>
                    <small>Geçmiş ort.</small>
                    <strong>{averageYieldKgDa !== null ? formatKgDa(averageYieldKgDa) : 'Yeterli geçmiş yok'}</strong>
                  </div>
                  <div>
                    <small>Hasat</small>
                    <strong>
                      {yieldHarvestSnapshot?.harvest.actualDate
                        ? trDate(yieldHarvestSnapshot.harvest.actualDate)
                        : yieldHarvestSnapshot?.status === 'harvest_window'
                          ? 'Hasat penceresi'
                          : finite(yieldHarvestSnapshot?.harvest.daysToExpectedHarvest) !== null
                            ? `${Math.max(0, Math.round(Number(yieldHarvestSnapshot?.harvest.daysToExpectedHarvest)))} gün`
                            : yieldHarvestSnapshot?.harvest.expectedDate
                              ? trDate(yieldHarvestSnapshot.harvest.expectedDate)
                              : 'Takipte'}
                    </strong>
                  </div>
                  <div>
                    <small>Gidişat / kalite</small>
                    <strong>
                      {yieldHarvestSnapshot
                        ? `${yieldTrendLabel(yieldHarvestSnapshot.history.trend)} · ${yieldHarvestSnapshot.quality.status === 'measured' ? 'Kalite ölçüldü' : 'Kalite ölçümü yok'}`
                        : 'Veri bekleniyor'}
                    </strong>
                  </div>
                </div>

                <p className="tp-field-status-yield-note">
                  {yieldHarvestSnapshot?.notes?.[0] ?? 'Gerçek hasat ve verim kaydı girildiğinde model tahminlerinden daha güçlü kanıt olarak kullanılır.'}
                </p>
                {yieldHarvest.error ? <p className="tp-field-status-inline-message">{yieldHarvest.error}</p> : null}
              </section>

              <section className="tp-field-status-section-head">
                <div>
                  <span>ÜRÜN UYGUNLUĞU</span>
                  <strong>{cropName || 'Kayıtlı ürün'}</strong>
                  <p>Toprak ve iklim koşullarına göre tarla–ürün uyumunun ön taraması.</p>
                </div>
                <button type="button" disabled={cropLoading || field?.demo} onClick={() => void loadSuitability()}>
                  <RefreshCw size={16} className={cropLoading ? 'is-spinning' : ''} />
                  {cropLoading ? 'Bakılıyor' : 'Yenile'}
                </button>
              </section>

              {cropLoading && !cropSuitability ? (
                <div className="tp-field-status-empty">Ürün uygunluğu hesaplanıyor…</div>
              ) : cropError ? (
                <div className="tp-field-status-empty error">{cropError}</div>
              ) : cropSuitability?.screening ? (
                <>
                  <section className="tp-field-status-suitability-score">
                    <div>
                      <span>UYGUNLUK</span>
                      <strong>{finite(cropSuitability.screening.score) === null ? '—' : Math.round(Number(cropSuitability.screening.score))}</strong>
                    </div>
                    <div>
                      <b>{cropSuitability.screening.label}</b>
                      <p>Güven: {confidenceLabel(cropSuitability.screening.confidence)}</p>
                      {cropSuitability.screening.limitingFactor ? <small>Sınırlayan: {cropSuitability.screening.limitingFactor.label}</small> : null}
                    </div>
                  </section>

                  <div className="tp-field-status-factor-list tp-zebra-list">
                    {cropSuitability.screening.factors.map((factor) => (
                      <article key={factor.key}>
                        <div><span>{factor.label}</span><small>{factor.value == null ? 'Veri yok' : `${Number(factor.value).toFixed(1)} ${factor.unit}`}</small></div>
                        <strong>{factor.score == null ? '—' : `${Math.round(factor.score)}/100`}</strong>
                      </article>
                    ))}
                  </div>
                </>
              ) : (
                <div className="tp-field-status-empty">{cropSuitability?.status === 'unsupported_crop' ? `${cropName || 'Bu ürün'} için uygunluk kuralı henüz tanımlı değil.` : 'Ürün uygunluk sonucu henüz hazır değil.'}</div>
              )}

              <button type="button" className="tp-field-status-records" onClick={() => setTab('input')}>
                <div><span>ÜRETİM KAYITLARI</span><strong>Ürün tipi, sezon, yıllık verim ve tarla bölümleri</strong></div>
                <ChevronRight size={18} />
              </button>

                </div>
              </details>
            </div>
          )}

          {tab === 'soil' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>TOPRAK</span>
                  <strong>
                    {soilLoading && !soilProfile
                      ? 'Hazırlanıyor'
                      : soilError
                        ? 'Kontrol gerekli'
                        : soilProfile
                          ? `${textureClass(soilProfile)} · pH ${soilTopsoilValue(soilProfile, 'ph')?.toFixed(1) ?? '—'}`
                          : soilAnalyses.length
                            ? `${soilAnalyses.length} laboratuvar kaydı`
                            : 'Tahmini profil hazır değil'}
                  </strong>
                </div>
                <span className={`tp-field-status-result-chip ${soilProfile || soilAnalyses.length ? 'good' : 'muted'}`}>
                  {soilProfile || soilAnalyses.length ? 'HAZIR' : 'BEKLİYOR'}
                </span>
              </section>
              <details className="tp-field-status-detail-fold">
                <summary>
                  <span>
                    <small>AYRINTILAR</small>
                    <strong>Toprak ayrıntıları</strong>
                    <em>Tahmini profil, laboratuvar ve analiz kayıtları</em>
                  </span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-detail-fold-body">

              <section className="tp-field-status-section-head">
                <div>
                  <span>TOPRAK</span>
                  <strong>Tahmini toprak profili</strong>
                  <p>SoilGrids 250 m model tahmini. Laboratuvar analizi varsa gerçek ölçüm her zaman önceliklidir.</p>
                </div>
                <button type="button" disabled={soilLoading || field?.demo} onClick={() => void loadSoil(true)}>
                  <RefreshCw size={16} className={soilLoading ? 'is-spinning' : ''} />
                  {soilLoading ? 'Alınıyor' : 'Yenile'}
                </button>
              </section>

              <section className="tp-field-status-soil-quick" aria-label="Toprak işlemleri">
                <label className={soilUploadLoading || field?.demo ? 'disabled' : ''}>
                  <Upload size={16} />
                  <span>{soilUploadLoading ? 'Yükleniyor…' : 'Toprak analizi yükle'}</span>
                  <input
                    type="file"
                    accept="application/pdf,image/*"
                    disabled={soilUploadLoading || field?.demo}
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0] ?? null;
                      event.currentTarget.value = '';
                      void handleSoilUpload(file);
                    }}
                  />
                </label>
                <button type="button" onClick={() => setSoilGuideOpen(true)}>
                  <BookOpenCheck size={16} />
                  Analiz nasıl alınır?
                </button>
                <button type="button" onClick={() => void handleFindLabs()} disabled={labsLoading || field?.demo}>
                  <MapPin size={16} />
                  {labsLoading ? 'Aranıyor…' : 'Yakındaki laboratuvar'}
                </button>
              </section>
              {soilUploadMessage ? <p className="tp-field-status-inline-message">{soilUploadMessage}</p> : null}

              {soilLoading && !soilProfile ? (
                <div className="tp-field-status-empty">Tahmini toprak profili hazırlanıyor…</div>
              ) : soilError ? (
                <div className="tp-field-status-empty error">{soilError}</div>
              ) : soilProfile ? (
                <>
                  <section className="tp-field-status-soil-summary">
                    <div><small>0–30 cm pH</small><strong>{soilTopsoilValue(soilProfile, 'ph')?.toFixed(1) ?? '—'}</strong></div>
                    <div><small>Tekstür</small><strong>{textureClass(soilProfile)}</strong></div>
                    <div><small>Organik C</small><strong>{soilTopsoilValue(soilProfile, 'organicCarbon')?.toFixed(1) ?? '—'}</strong></div>
                  </section>

                  <div className="tp-field-status-texture-bar" aria-label="Tahmini toprak tekstürü">
                    <span style={{ flexBasis: `${Math.max(0, finite(soilProfile.texture.sandPercent) ?? 0)}%` }}>Kum %{Math.round(finite(soilProfile.texture.sandPercent) ?? 0)}</span>
                    <span style={{ flexBasis: `${Math.max(0, finite(soilProfile.texture.siltPercent) ?? 0)}%` }}>Silt %{Math.round(finite(soilProfile.texture.siltPercent) ?? 0)}</span>
                    <span style={{ flexBasis: `${Math.max(0, finite(soilProfile.texture.clayPercent) ?? 0)}%` }}>Kil %{Math.round(finite(soilProfile.texture.clayPercent) ?? 0)}</span>
                  </div>

                  <div className="tp-field-status-soil-profile tp-zebra-list">
                    {soilProfile.properties.ph.layers.map((layer, index) => {
                      const clayLayer = soilProfile.properties.clay.layers[index];
                      const sandLayer = soilProfile.properties.sand.layers[index];
                      return (
                        <article key={layer.depth}>
                          <strong>{layer.depth.replace('cm', ' cm')}</strong>
                          <span>pH {layer.value?.toFixed(1) ?? '—'}</span>
                          <span>Kil %{clayLayer?.value == null ? '—' : Math.round(clayLayer.value)}</span>
                          <span>Kum %{sandLayer?.value == null ? '—' : Math.round(sandLayer.value)}</span>
                        </article>
                      );
                    })}
                  </div>

                  <p className="tp-field-status-note">Kaynak: {soilProfile.provider} · {soilProfile.product} · yaklaşık {soilProfile.spatialResolutionMeters} m çözünürlük.</p>
                </>
              ) : (
                <div className="tp-field-status-empty">Toprak profili bu sekme açıldığında tarla koordinatından otomatik hazırlanır.</div>
              )}

              <section className="tp-field-status-soil-real">
                <div className="tp-field-status-soil-real-head">
                  <div>
                    <span>GERÇEK ÖLÇÜM</span>
                    <strong>Laboratuvar toprak analizi</strong>
                    <p>Raporu burada yükle. Sonuç kaydedilir, AI yorumu hazırlanır ve bu tarlanın kararlarında gerçek ölçüm olarak kullanılır.</p>
                  </div>
                  <FlaskConical size={22} />
                </div>


                <div className="tp-field-status-soil-history">
                  <div className="tp-field-status-subhead">
                    <span>KAYITLI ANALİZLER</span>
                    <strong>{soilAnalysesLoading ? 'Yükleniyor…' : soilAnalyses.length ? `${soilAnalyses.length} kayıt` : 'Henüz kayıt yok'}</strong>
                  </div>
                  {soilAnalyses.slice(0, 4).map((record) => (
                    <button key={record.id} type="button" onClick={() => void openSoilAnalysisFile(record)} disabled={!record.pdf_path && !record.report_path}>
                      <div>
                        <strong>{record.summary || record.status_label || 'Toprak analizi'}</strong>
                        <small>{trDate(record.created_at)} · {record.report_file_name || 'Laboratuvar raporu'}</small>
                      </div>
                      {(record.pdf_path || record.report_path) ? <ExternalLink size={15} /> : <FileText size={15} />}
                    </button>
                  ))}
                </div>
              </section>

                </div>
              </details>
            </div>
          )}

          {tab === 'irrigation' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>SULAMA</span>
                  <strong>
                    {irrigationResult?.display?.headline
                      ?? (irrigationStatus === 'loading' ? 'Hesaplanıyor' : 'Sulama sonucu bekleniyor')}
                  </strong>
                </div>
                <span className={`tp-field-status-result-chip ${irrigationResult ? 'good' : 'muted'}`}>
                  {irrigationResult ? 'SONUÇ' : 'BEKLİYOR'}
                </span>
              </section>

              <details className="tp-field-status-detail-fold">
                <summary>
                  <span><small>AYRINTILAR</small><strong>Sulama hesabı</strong><em>Su açığı, yağış, ekonomi ve model kanıtları</em></span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-detail-fold-body">
                  <IrrigationResultPanel
                    decision={irrigationResult}
                    whatIf={irrigation?.whatIf ?? null}
                    status={irrigationStatus}
                    error={irrigation?.error ?? null}
                    onAddIrrigationRecord={onOpenIrrigationRecord}
                    onOpenDataEntry={() => {
                      setTab('input');
                      window.setTimeout(() => {
                        document
                          .getElementById('tp-field-status-irrigation-inputs')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }, 120);
                    }}
                  />
                </div>
              </details>

              <details className="tp-field-status-intelligence-card tp-field-status-accordion">
                <summary>
                  <div className="tp-field-status-intelligence-head">
                    <div>
                      <span>SULAMA DAĞILIM ZEKÂSI</span>
                      <strong>{irrigationDistributionSignal?.title ?? 'Normal takipte'}</strong>
                    </div>
                    <span className={`tp-field-status-intelligence-badge ${irrigationDistributionSignal ? 'watch' : 'ready'}`}>
                      {irrigationDistributionSignal ? 'KONTROL' : 'TAKİPTE'}
                    </span>
                  </div>
                </summary>
                <div className="tp-field-status-accordion-body">
                  <p>{irrigationDistributionSignal?.detail ?? 'Son sulama sonrası dağılım farkları uydu ve radar ile kontrol edilir.'}</p>
                  {irrigationDistributionSignal ? (
                    <button type="button" onClick={() => onOpenTarget?.(irrigationDistributionSignal.target)}>
                      Haritada kontrol et <ChevronRight size={15} />
                    </button>
                  ) : null}
                </div>
              </details>

              {irrigationResult && fieldId && !field?.demo ? (
                <WaterScarcityPlanPanel fieldId={fieldId} decision={irrigationResult} />
              ) : (
                <section className="tp-field-status-intelligence-card muted">
                  <div className="tp-field-status-intelligence-head">
                    <div><span>SU KITLIĞI PLANI</span><strong>Sulama kararıyla birlikte hazırlanacak</strong></div>
                    <span className="tp-field-status-intelligence-badge">BEKLİYOR</span>
                  </div>
                  <p>Kullanılabilir su bütçesi, fenoloji ve 5 günlük su ihtiyacı birlikte değerlendirilir.</p>
                </section>
              )}

            </div>
          )}

          {tab === 'risk' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>RİSK</span>
                  <strong>{riskItems.length ? `${riskItems.length} risk kontrol edilmeli` : 'Aktif risk yok'}</strong>
                </div>
                <span className={`tp-field-status-result-chip ${riskItems.length ? 'watch' : 'good'}`}>
                  {riskItems.length ? 'KONTROL' : 'NORMAL'}
                </span>
              </section>

              <section className={`tp-field-status-multi-stress ${multiStressSignal ? 'active' : 'quiet'}`}>
                <div>
                  <span>BİRLEŞİK ÇOKLU STRES</span>
                  <strong>{multiStressSignal?.title ?? 'Aktif birleşik stres sinyali yok'}</strong>
                </div>
                {multiStressSignal ? (
                  <button type="button" onClick={() => onOpenTarget?.(multiStressSignal.target)}>
                    İncele <ChevronRight size={15} />
                  </button>
                ) : <span className="tp-field-status-multi-stress-ok">NORMAL</span>}
              </section>

              {riskItems.length ? (
                <div className="tp-field-status-risk-list tp-zebra-list">
                  {riskItems.map((item) => (
                    <button key={item.id} type="button" onClick={() => onOpenTarget?.(item.target)}>
                      <span className={`tp-field-status-risk-dot ${riskTone(item)}`} aria-hidden="true" />
                      <div>
                        <small>{shortRiskLabel(item.source)}</small>
                        <strong>{item.title}</strong>
                      </div>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="tp-field-status-empty good">Şu anda aktif bir risk uyarısı yok. Bilgi ve kayıt kartları bu listeye dahil edilmez.</div>
              )}
            </div>
          )}

          {tab === 'data' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>VERİ</span>
                  <strong>
                    {dataConfidenceScore !== null
                      ? `Güven ${Math.round(dataConfidenceScore)}/100`
                      : userMissingItems.length
                        ? `${userMissingItems.length} eksik veri`
                        : systemWaitingItems.length
                          ? `${systemWaitingItems.length} kaynak bekleniyor`
                          : 'Hazırlanıyor'}
                  </strong>
                </div>
                <span className={`tp-field-status-result-chip ${userMissingItems.length ? 'watch' : dataConfidenceScore !== null ? 'good' : 'muted'}`}>
                  {userMissingItems.length ? 'EKSİK' : dataConfidenceScore !== null ? 'HAZIR' : 'BEKLİYOR'}
                </span>
              </section>
              <details className="tp-field-status-detail-fold">
                <summary>
                  <span><small>AYRINTILAR</small><strong>Veri kaynakları</strong><em>Eksikler, uydu ve model durumu</em></span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-detail-fold-body">



              <section className="tp-field-status-confidence-card">
                <ShieldCheck size={24} />
                <div>
                  <span>VERİ GÜVENİ</span>
                  <strong>
                    {dataConfidenceScore === null
                      ? userMissingItems.length
                        ? `${userMissingItems.length} bilgi eksik`
                        : systemWaitingItems.length
                          ? 'Sistem verisi bekleniyor'
                          : 'Hazırlanıyor'
                      : `${Math.round(dataConfidenceScore)}/100 · ${confidenceLabel(confidence?.class)}`}
                  </strong>
                  <p>
                    {userMissingItems.length
                      ? 'Aşağıdaki eksikleri tamamladıkça sulama, gelişim ve model yorumları daha güvenilir hale gelir.'
                      : systemWaitingItems.length
                        ? 'Kullanıcıdan ek giriş gerekmiyor; aşağıdaki kaynaklar otomatik olarak tamamlanacak.'
                        : stepReason(unicropStep) || 'Uydu, hava, toprak, sezon ve model kanıtları birlikte kontrol edilir.'}
                  </p>
                </div>
              </section>

              {userMissingItems.length ? (
                <section className="tp-field-status-missing-panel">
                  <div className="tp-field-status-subhead">
                    <span>SENDEN BEKLENEN</span>
                    <strong>{userMissingItems.length} eksik bilgi</strong>
                  </div>
                  <div className="tp-field-status-missing-list">
                    {userMissingItems.map((item) => (
                      <button key={item.code} type="button" onClick={() => openMissingItem(item.code)}>
                        <div>
                          <strong>{item.label}</strong>
                          <small>Tamamlamak için dokun</small>
                        </div>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                </section>
              ) : (
                <div className="tp-field-status-empty good">Kullanıcı tarafından tamamlanması gereken zorunlu veri görünmüyor.</div>
              )}

              {systemWaitingItems.length ? (
                <section className="tp-field-status-waiting-panel">
                  <div className="tp-field-status-subhead">
                    <span>SİSTEMDEN BEKLENEN</span>
                    <strong>{systemWaitingItems.length} otomatik kaynak</strong>
                  </div>
                  <div className="tp-field-status-waiting-list">
                    {systemWaitingItems.map((item) => (
                      <article key={item.code}>
                        <CircleDot size={14} />
                        <div>
                          <strong>{item.label}</strong>
                          <small>Kullanıcı girişi gerekmez; uygun veri oluşunca otomatik güncellenir.</small>
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              ) : null}

              <div className="tp-field-status-data-list tp-zebra-list">
                <article>
                  <span>Uydu bitki ölçümü <small>Sentinel-2 · SL2P</small></span>
                  <strong>{latest ? `Hazır · ${trDate(latest.acquiredAt)}` : stepReason(sl2pStep) || (refreshing ? 'Uydu verisi kontrol ediliyor' : 'Henüz ölçüm oluşmadı')}</strong>
                </article>
                <article>
                  <span>Gelişim modeli <small>RSCM</small></span>
                  <strong>{!rscmSupported ? `${cropName || 'Bu ürün'} için pilot kapsamı dışında` : rscm ? `Aktif · uyum ${Math.round(modelAlignment ?? 0)}/100` : stepReason(rscmStep) || `${signals.biophysics.historyCount}/4+ LAI gerekiyor`}</strong>
                </article>
                <article>
                  <span>Veri bütünlüğü <small>harmonizasyon</small></span>
                  <strong>{confidence ? `Aktif · ${confidenceLabel(confidence.class)}` : stepReason(unicropStep) || (latest ? 'Kaynaklar değerlendiriliyor' : 'Sentinel-2 sonucu bekleniyor')}</strong>
                </article>
                <article>
                  <span>SoilGrids</span>
                  <strong>{soilProfile ? `Aktif · ${soilProfile.spatialResolutionMeters} m tahmin` : soilError ? soilError : 'Toprak sekmesinde kontrol edilir'}</strong>
                </article>
                <article>
                  <span>Ürün uygunluğu</span>
                  <strong>{suitabilityDiagnostic(cropSuitability, cropLoading, cropError)}</strong>
                </article>
              </div>

              {fieldId ? (
                <details className="tp-field-status-detail-fold tp-field-status-sensor-fold">
                  <summary>
                    <span><small>OPSİYONEL</small><strong>Mikroiklim / sensör</strong><em>Saha sıcaklığı, nem, debi ve basınç</em></span>
                    <ChevronRight size={18} />
                  </summary>
                  <div className="tp-field-status-detail-fold-body">
                    <MicroclimateSensorPanel fieldId={fieldId} />
                  </div>
                </details>
              ) : null}


                </div>
              </details>
            </div>
          )}

          {tab === 'input' && (
            <div className="tp-field-status-stack">
              <section className="tp-field-status-result-card">
                <div>
                  <span>VERİ GİRİŞİ</span>
                  <strong>Ne kaydetmek istiyorsun?</strong>
                </div>
                <span className="tp-field-status-result-chip good">KAYIT</span>
              </section>

              <div className="tp-field-status-input-grid">
                {inputActions.map((item) => (
                  <button key={item.key} type="button" onClick={item.action} disabled={!item.action}>
                    <span className="tp-field-status-input-icon">{item.icon}</span>
                    <span className="tp-field-status-input-copy">
                      <strong>{item.title}</strong>
                      <small>{item.detail}</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                ))}
              </div>

              <details className="tp-field-status-detail-fold">
                <summary>
                  <span><small>SAHA VERİSİ</small><strong>Sulama bilgileri</strong><em>Profil, yöntem ve ölçüm</em></span>
                  <ChevronRight size={18} />
                </summary>
                <div id="tp-field-status-irrigation-inputs" className="tp-field-status-detail-fold-body">
              <section className="tp-field-status-irrigation-tools">
                <div className="tp-field-status-subhead">
                  <span>SULAMA BİLGİLERİ</span>
                  <strong>Sulama motorunun kullanacağı saha kayıtları</strong>
                </div>
                <p className="tp-field-status-note">Buraya girilen bilgiler Sulama sekmesindeki sonuç ekranını besler. Sonuç/öneri burada gösterilmez.</p>
                <div className="tp-field-status-irrigation-profile">
                  <div className="tp-field-status-irrigation-profile-grid">
                    <label><span>Tarla sulama durumu</span><select data-irrigation-input="irrigation_status" value={irrigationProfile.status} disabled={irrigationProfileLoading || irrigationProfileSaving} onChange={(event) => setIrrigationProfile((current) => ({ ...current, status: event.target.value }))}><option value="">Seç</option><option value="sulu">Sulu</option><option value="kısmi">Kısmi sulama</option><option value="susuz">Susuz / kuru tarım</option></select></label>
                    {(normalizedCrop(cropName).includes('üzüm') || normalizedCrop(cropName).includes('uzum') || normalizedCrop(cropName).includes('grape')) ? <label><span>Üzüm tipi</span><select data-irrigation-input="crop_water_reference_profile" value={irrigationProfile.cropSubtype} disabled={irrigationProfileLoading || irrigationProfileSaving} onChange={(event) => setIrrigationProfile((current) => ({ ...current, cropSubtype: event.target.value }))}><option value="">Seç</option><option value="table">Sofralık</option><option value="wine">Şaraplık</option></select></label> : null}
                    <label><span>Tarlanın ne kadarı bitkiyle kaplı?</span><small className="tp-field-status-input-help">0 = çıplak, 50 = yaklaşık yarısı, 100 = neredeyse tamamı.</small><input data-irrigation-input="canopy_cover" type="number" min="0" max="100" step="1" inputMode="decimal" value={irrigationProfile.canopyCover} disabled={irrigationProfileLoading || irrigationProfileSaving} onChange={(event) => setIrrigationProfile((current) => ({ ...current, canopyCover: event.target.value }))} placeholder="Örn. 65" /></label>
                    <label><span>Bitki / ağaç yüksekliği (m)</span><input data-irrigation-input="canopy_height" type="number" min="0.1" max="30" step="0.1" inputMode="decimal" value={irrigationProfile.canopyHeight} disabled={irrigationProfileLoading || irrigationProfileSaving} onChange={(event) => setIrrigationProfile((current) => ({ ...current, canopyHeight: event.target.value }))} placeholder="Örn. 1.8" /></label>
                  </div>
                  <button type="button" className="tp-field-status-irrigation-profile-save" disabled={irrigationProfileLoading || irrigationProfileSaving} onClick={() => void saveIrrigationProfile()}>{irrigationProfileSaving ? 'Kaydediliyor…' : 'Sulama profilini kaydet'}</button>
                  {irrigationProfileMessage ? <p className="tp-field-status-inline-message">{irrigationProfileMessage}</p> : null}
                </div>
                {fieldId ? <div data-irrigation-input="irrigation_method"><FieldIrrigationMethod fieldId={fieldId} /></div> : null}
                {fieldId ? <div data-irrigation-input="soil_water_measurement"><FieldWaterMeasurements fieldId={fieldId} /></div> : null}
                {onOpenIrrigationRecord ? <button type="button" className="tp-field-status-irrigation-entry" onClick={onOpenIrrigationRecord}><Droplets size={17} /><div><strong>Son sulama kaydını ekle</strong><small>Tarih ve verilen su miktarı sonucu doğrudan günceller.</small></div><ChevronRight size={16} /></button> : null}
                <button type="button" className="tp-field-status-irrigation-profile-save" onClick={() => setTab('irrigation')}>Sulama sonuçlarını gör</button>
              </section>
                </div>
              </details>

              <details className="tp-field-status-detail-fold">
                <summary>
                  <span><small>KAYITLAR</small><strong>Bu tarlada kayıtlı veriler</strong><em>Sezon, analiz, işlem ve bölümler</em></span>
                  <ChevronRight size={18} />
                </summary>
                <div className="tp-field-status-detail-fold-body">
              <section className="tp-field-status-recent-records">
                <div className="tp-field-status-subhead">
                  <span>BU TARLADA KAYITLI</span>
                  <strong>{(cropCycle === 'perennial' ? perennialYields.length : seasons.length) + recentActivities.length + soilAnalyses.length + fieldSections.length} kayıt özeti</strong>
                </div>

                <div className="tp-field-status-record-summary-grid">
                  <button type="button" onClick={() => setTab('crop')}>
                    <span>Sezon / verim</span>
                    <strong>{cropCycle === 'perennial' ? perennialYields.length : seasons.length}</strong>
                  </button>
                  <button type="button" onClick={() => setTab('soil')}>
                    <span>Toprak analizi</span>
                    <strong>{soilAnalyses.length}</strong>
                  </button>
                  <div>
                    <span>Son işlemler</span>
                    <strong>{recentActivities.length}</strong>
                  </div>
                  <div>
                    <span>Tarla bölümü</span>
                    <strong>{fieldSections.length}</strong>
                  </div>
                </div>

                {recentActivities.length ? (
                  <div className="tp-field-status-activity-list">
                    {recentActivities.map((item) => (
                      <article key={item.id}>
                        <div>
                          <strong>{item.title}</strong>
                          <small>{item.type}{item.date ? ` · ${trDate(item.date)}` : ''}</small>
                        </div>
                        <span>{item.cost === null ? '—' : `${item.cost.toLocaleString('tr-TR')} ₺`}</span>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="tp-field-status-empty">Henüz kayıtlı tarla işlemi yok.</div>
                )}
              </section>
                </div>
              </details>

              {recordMessage ? <p className="tp-field-status-inline-message">{recordMessage}</p> : null}
              <p className="tp-field-status-note">Saha gözlemi <b>Bitki</b>, sulama bilgileri <b>Veri Girişi</b>, sulama sonucu <b>Sulama</b>, toprak raporu <b>Toprak</b> sekmesinde. Eski Tarla Detayı artık ana takip ekranı değildir.</p>
            </div>
          )}
        </div>
      </section>

      {recordEditor ? (
        <div className="tp-field-status-nested-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget && !recordSaving) setRecordEditor(null);
        }}>
          <section className="tp-field-status-nested-dialog" role="dialog" aria-modal="true" aria-label="Tarla kaydı ekle">
            <header>
              <div>
                <span>VERİ GİRİŞİ</span>
                <strong>
                  {recordEditor === 'profile' ? 'Ürün / dikim bilgisi' :
                    recordEditor === 'season' ? (cropCycle === 'perennial' ? 'Yıllık verim kaydı' : 'Sezon / ekim kaydı') :
                      recordEditor === 'section' ? 'Tarla bölümü ekle' : 'İşlem / masraf kaydı'}
                </strong>
              </div>
              <button type="button" disabled={recordSaving} onClick={() => setRecordEditor(null)} aria-label="Kapat"><X size={18} /></button>
            </header>
            <div className="tp-field-status-nested-body">
              <div className="tp-field-status-inline-form">
                {recordEditor === 'profile' ? (
                  <>
                    <label>
                      <span>Üretim tipi</span>
                      <select value={String(recordDraft.cropCycle ?? cropCycle)} onChange={(event) => updateRecordDraft('cropCycle', event.target.value)}>
                        <option value="annual">Tek yıllık ürün</option>
                        <option value="perennial">Çok yıllık ürün / bahçe</option>
                      </select>
                    </label>
                    {recordDraft.cropCycle === 'perennial' ? (
                      <>
                        <label>
                          <span>Dikim yılı</span>
                          <input type="number" min="1900" max={new Date().getFullYear()} value={String(recordDraft.plantingYear ?? '')} onChange={(event) => updateRecordDraft('plantingYear', event.target.value)} placeholder="Örn. 1995" />
                        </label>
                        <label className="tp-field-status-check-row">
                          <input type="checkbox" checked={Boolean(recordDraft.bearing)} onChange={(event) => updateRecordDraft('bearing', event.target.checked)} />
                          <span>Ürün veriyor</span>
                        </label>
                      </>
                    ) : null}
                  </>
                ) : null}

                {recordEditor === 'season' ? (
                  <>
                    <div className="tp-field-status-form-grid two">
                      <label>
                        <span>Yıl</span>
                        <input type="number" min="2000" max="2100" value={String(recordDraft.year ?? '')} onChange={(event) => updateRecordDraft('year', event.target.value)} />
                      </label>
                      {cropCycle === 'perennial' ? (
                        <label>
                          <span>Toplam verim (kg)</span>
                          <input inputMode="decimal" value={String(recordDraft.yieldKg ?? '')} onChange={(event) => updateRecordDraft('yieldKg', event.target.value)} placeholder="Örn. 12500" />
                        </label>
                      ) : (
                        <label>
                          <span>Ürün</span>
                          <input value={String(recordDraft.crop ?? '')} onChange={(event) => updateRecordDraft('crop', event.target.value)} placeholder="Ürün" />
                        </label>
                      )}
                    </div>
                    {cropCycle === 'annual' ? (
                      <>
                        <label>
                          <span>Ekim / dikim tarihi</span>
                          <input type="date" value={String(recordDraft.plantingDate ?? '')} onChange={(event) => updateRecordDraft('plantingDate', event.target.value)} />
                        </label>
                        <label>
                          <span>Toplam verim (kg)</span>
                          <input inputMode="decimal" value={String(recordDraft.yieldKg ?? '')} onChange={(event) => updateRecordDraft('yieldKg', event.target.value)} placeholder="Hasat tamamlandıysa gir" />
                        </label>
                      </>
                    ) : null}
                    <label>
                      <span>Hasat tarihi</span>
                      <input type="date" value={String(recordDraft.harvestDate ?? '')} onChange={(event) => updateRecordDraft('harvestDate', event.target.value)} />
                    </label>
                    <label>
                      <span>Not</span>
                      <textarea rows={3} value={String(recordDraft.notes ?? '')} onChange={(event) => updateRecordDraft('notes', event.target.value)} placeholder="İsteğe bağlı" />
                    </label>
                  </>
                ) : null}

                {recordEditor === 'section' ? (
                  <>
                    <label>
                      <span>Bölüm adı</span>
                      <input value={String(recordDraft.name ?? '')} onChange={(event) => updateRecordDraft('name', event.target.value)} placeholder="Örn. Kuzey blok" />
                    </label>
                    <div className="tp-field-status-form-grid two">
                      <label>
                        <span>Ürün</span>
                        <input value={String(recordDraft.crop ?? '')} onChange={(event) => updateRecordDraft('crop', event.target.value)} placeholder="Ürün" />
                      </label>
                      <label>
                        <span>Alan (da)</span>
                        <input inputMode="decimal" value={String(recordDraft.area ?? '')} onChange={(event) => updateRecordDraft('area', event.target.value)} placeholder="İsteğe bağlı" />
                      </label>
                    </div>
                  </>
                ) : null}

                {recordEditor === 'activity' ? (
                  <>
                    <div className="tp-field-status-form-grid two">
                      <label>
                        <span>İşlem</span>
                        <select value={String(recordDraft.activityType ?? 'Saha Kontrolü')} onChange={(event) => updateRecordDraft('activityType', event.target.value)}>
                          <option>Saha Kontrolü</option>
                          <option>Gübreleme</option>
                          <option>İlaçlama</option>
                          <option>Sulama</option>
                          <option>Ekim</option>
                          <option>Hasat</option>
                          <option>Toprak İşleme</option>
                          <option>Diğer</option>
                        </select>
                      </label>
                      <label>
                        <span>Tarih</span>
                        <input type="date" value={String(recordDraft.date ?? '')} onChange={(event) => updateRecordDraft('date', event.target.value)} />
                      </label>
                    </div>
                    <label>
                      <span>Masraf (₺)</span>
                      <input inputMode="decimal" value={String(recordDraft.cost ?? '')} onChange={(event) => updateRecordDraft('cost', event.target.value)} placeholder="İsteğe bağlı" />
                    </label>
                    <label>
                      <span>Not</span>
                      <textarea rows={3} value={String(recordDraft.notes ?? '')} onChange={(event) => updateRecordDraft('notes', event.target.value)} placeholder="Yapılan işlemi kısaca yaz" />
                    </label>
                  </>
                ) : null}
              </div>

              {recordMessage ? <p className="tp-field-status-inline-message">{recordMessage}</p> : null}
              <div className="tp-field-status-form-actions">
                <button type="button" onClick={() => setRecordEditor(null)} disabled={recordSaving}>Vazgeç</button>
                <button type="button" className="primary" onClick={() => void saveInlineRecord()} disabled={recordSaving}>{recordSaving ? 'Kaydediliyor…' : 'Kaydet'}</button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {soilGuideOpen ? (
        <div className="tp-field-status-nested-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSoilGuideOpen(false);
        }}>
          <section className="tp-field-status-nested-dialog" role="dialog" aria-modal="true" aria-label="Toprak analizi numunesi nasıl alınır">
            <header>
              <div>
                <span>TOPRAK NUMUNESİ</span>
                <strong>Toprak analizi nasıl alınır?</strong>
              </div>
              <button type="button" onClick={() => setSoilGuideOpen(false)} aria-label="Kapat"><X size={18} /></button>
            </header>
            <div className="tp-field-status-nested-body">
              <p className="tp-field-status-nested-intro">Amaç, bütün tarlayı temsil eden temiz ve doğru etiketlenmiş bir numune oluşturmaktır. Laboratuvarın kendi numune talimatı varsa onu öncelikli uygula.</p>
              <div className="tp-field-status-sample-steps">
                {SOIL_SAMPLE_STEPS.map((step) => (
                  <article key={step.no}>
                    <span>{step.no}</span>
                    <div>
                      <strong>{step.title}</strong>
                      <p>{step.detail}</p>
                    </div>
                  </article>
                ))}
              </div>
              <div className="tp-field-status-guide-note">
                <BookOpenCheck size={17} />
                <p>Farklı toprak yapısı, eğim, ürün geçmişi veya problemli alanlar belirginse bunları ayrı numune olarak göndermek daha doğru sonuç verir.</p>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {labsOpen ? (
        <div className="tp-field-status-nested-layer" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setLabsOpen(false);
        }}>
          <section className="tp-field-status-nested-dialog" role="dialog" aria-modal="true" aria-label="Yakındaki laboratuvarlar">
            <header>
              <div>
                <span>YAKINDAKİ NOKTALAR</span>
                <strong>Toprak analizi laboratuvarları</strong>
              </div>
              <button type="button" onClick={() => setLabsOpen(false)} aria-label="Kapat"><X size={18} /></button>
            </header>
            <div className="tp-field-status-nested-body">
              <p className="tp-field-status-nested-intro">{labsMessage || 'Tarla konumuna göre yakın laboratuvarlar aranır.'}</p>
              {labsLoading ? (
                <div className="tp-field-status-empty">Laboratuvarlar aranıyor…</div>
              ) : labs.length ? (
                <div className="tp-field-status-lab-list">
                  {labs.map((lab, index) => (
                    <article key={`${lab.name}-${lab.latitude ?? index}-${lab.longitude ?? index}`}>
                      <MapPin size={17} />
                      <div>
                        <strong>{lab.name}</strong>
                        <small>
                          {lab.distanceKm == null ? '' : `${lab.distanceKm.toFixed(1)} km`}
                          {lab.address ? `${lab.distanceKm == null ? '' : ' · '}${lab.address}` : ''}
                        </small>
                        {lab.phone ? <a href={`tel:${lab.phone}`}>{lab.phone}</a> : null}
                        {lab.sourceLabel ? (
                          <small className={lab.verified ? 'tp-field-status-lab-source verified' : 'tp-field-status-lab-source'}>
                            {lab.verified ? 'Doğrulandı · ' : ''}{lab.sourceLabel}
                          </small>
                        ) : null}
                        {lab.sourceUrl ? (
                          <a href={lab.sourceUrl} target="_blank" rel="noreferrer">Kaynağı gör</a>
                        ) : null}
                      </div>
                      {lab.mapUrl ? (
                        <a className="tp-field-status-map-link" href={lab.mapUrl} target="_blank" rel="noreferrer">
                          Harita <ExternalLink size={14} />
                        </a>
                      ) : null}
                    </article>
                  ))}
                </div>
              ) : (
                <div className="tp-field-status-empty">Yakında kayıtlı laboratuvar bulunamadı.</div>
              )}
              <p className="tp-field-status-note">Liste açık harita verisindeki laboratuvar / analiz noktalarından gelir. Gitmeden önce toprak analizi hizmeti ve numune kabul koşullarını telefonla doğrula.</p>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );

  return createPortal(content, document.body);
}
