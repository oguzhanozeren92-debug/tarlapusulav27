import { supabase } from '../../../supabaseClient';
import { loadMicroclimateSensorSnapshot } from '../../microclimate/services/microclimateSensor.service';
import type { FieldOperation } from '../../field-operations/types/fieldOperation';
import type {
  IrrigationDistributionConfidence,
  IrrigationDistributionObservation,
  IrrigationDistributionSnapshot,
} from '../types/irrigationDistribution';

const MAX_DAYS_AFTER_IRRIGATION = 14;
const RECURRENCE_WINDOW = 4;
const RAIN_CONFOUND_MM = 5;

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T00:00:00Z`);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10) === match[1] ? match[1] : null;
}

function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  );
}

function normalizeArea(value: unknown) {
  const raw = text(value).toLocaleLowerCase('tr-TR');
  const compact = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
  const aliases: Record<string, string> = {
    kuzeybati: 'kuzeybatı', northwest: 'kuzeybatı',
    kuzey: 'kuzey', north: 'kuzey',
    kuzeydogu: 'kuzeydoğu', northeast: 'kuzeydoğu',
    bati: 'batı', west: 'batı',
    merkez: 'merkez', center: 'merkez', centre: 'merkez',
    dogu: 'doğu', east: 'doğu',
    guneybati: 'güneybatı', southwest: 'güneybatı',
    guney: 'güney', south: 'güney',
    guneydogu: 'güneydoğu', southeast: 'güneydoğu',
  };
  return aliases[compact.replace(/[^a-z]+/g, '')] ?? (raw || null);
}

function irrigationOperations(operations: FieldOperation[]) {
  return operations
    .filter((item) => text(item.type).toLocaleLowerCase('tr-TR') === 'sulama')
    .filter((item) => Boolean(dateOnly(item.date)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
}

function findingsFromSpatial(spatial: any) {
  const findings = Array.isArray(spatial?.findings) ? spatial.findings : [];
  return findings.filter((item: any) => normalizeArea(item?.area ?? item?.direction));
}

function scoreSpatial(input: { ndviSpatial?: any; radarSpatial?: any; fallbackArea?: unknown }) {
  const byArea = new Map<string, { score: number; evidence: string[]; signature: Record<string, unknown> }>();

  const touch = (areaInput: unknown) => {
    const area = normalizeArea(areaInput);
    if (!area) return null;
    const existing = byArea.get(area) ?? { score: 0, evidence: [], signature: {} };
    byArea.set(area, existing);
    return { area, existing };
  };

  for (const finding of findingsFromSpatial(input.ndviSpatial)) {
    const row = touch(finding?.area ?? finding?.direction);
    if (!row) continue;
    const relativeHealth = finite(finding?.ndvi?.relativeHealth);
    const delta = finite(finding?.ndvi?.deltaFromFieldMean);
    const status = text(finding?.ndvi?.relativeStatus);
    const weak = status === 'weaker' || (relativeHealth != null && relativeHealth <= 0.32) || (delta != null && delta <= -0.04);
    if (!weak) continue;
    const severity = relativeHealth != null
      ? Math.max(0, Math.min(1, 1 - relativeHealth))
      : delta != null
        ? Math.max(0, Math.min(1, Math.abs(delta) / 0.12))
        : Math.max(0, Math.min(1, finite(finding?.score) ?? 0.55));
    row.existing.score += 0.48 * Math.max(0.55, severity);
    row.existing.evidence.push('Sulama sonrası uydu tarihinde bu bölüm bitki görünümünde parsel ortalamasına göre daha zayıf kaldı.');
    row.existing.signature.ndvi = {
      relativeHealth,
      deltaFromFieldMean: delta,
      relativeStatus: status || null,
    };
  }

  for (const finding of findingsFromSpatial(input.radarSpatial)) {
    const row = touch(finding?.area ?? finding?.direction);
    if (!row) continue;
    const vv = finite(finding?.radarVv?.relativeBackscatter);
    const water = finite(finding?.radarWater?.blueRatio);
    const vh = finite(finding?.radarVh?.relativeBackscatter);
    const texture = finite(finding?.radarVh?.textureScore);
    const vvDeviation = vv == null ? 0 : Math.abs(vv - 0.5) * 2;
    const vhDeviation = vh == null ? 0 : Math.abs(vh - 0.5) * 2;
    const vhSignal = Math.max(vhDeviation, texture ?? 0);

    if (vvDeviation >= 0.52) {
      row.existing.score += 0.28 * vvDeviation;
      row.existing.evidence.push('Sentinel-1 VV geri-saçılımı aynı tarihte çevresine göre belirgin farklılık gösterdi.');
    }
    if (water != null && water >= 0.68) {
      row.existing.score += 0.22 * water;
      row.existing.evidence.push('Radar su görünümünde aynı bölüm çevresine göre farklı su/yüzey sinyali gösterdi.');
    }
    if (vhSignal >= 0.52) {
      row.existing.score += 0.18 * vhSignal;
      row.existing.evidence.push('Sentinel-1 VH yapısı aynı bölümde çevresine göre belirgin farklılık gösterdi.');
    }

    row.existing.signature.radar = { vv, water, vh, texture };
  }

  if (byArea.size > 0 && input.fallbackArea) {
    const fallback = touch(input.fallbackArea);
    if (fallback && fallback.existing.score > 0) {
      fallback.existing.evidence.push('Pusula genel tarla sentezi de aynı bölgeyi öncelikli kontrol alanı olarak işaretledi.');
    }
  }

  const ranked = [...byArea.entries()]
    .map(([area, value]) => ({ area, ...value, score: Math.min(1, value.score) }))
    .sort((a, b) => b.score - a.score);

  return ranked[0] ?? null;
}

async function loadFieldLocation(fieldId: string) {
  const { data, error } = await supabase
    .from('fields')
    .select('latitude,longitude,parcel_centroid_lat,parcel_centroid_lng')
    .eq('id', fieldId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const latitude = finite(data.parcel_centroid_lat ?? data.latitude);
  const longitude = finite(data.parcel_centroid_lng ?? data.longitude);
  return latitude != null && longitude != null ? { latitude, longitude } : null;
}

async function rainBetween(fieldId: string, start: string, end: string) {
  if (start >= end) return 0;
  try {
    const location = await loadFieldLocation(fieldId);
    if (!location) return null;
    const url = new URL('https://archive-api.open-meteo.com/v1/archive');
    url.searchParams.set('latitude', String(location.latitude));
    url.searchParams.set('longitude', String(location.longitude));
    url.searchParams.set('start_date', start);
    url.searchParams.set('end_date', end);
    url.searchParams.set('daily', 'precipitation_sum');
    url.searchParams.set('timezone', 'UTC');
    url.searchParams.set('models', 'era5_land');
    const response = await fetch(url.toString());
    const payload = await response.json().catch(() => null);
    if (!response.ok || !Array.isArray(payload?.daily?.precipitation_sum)) return null;
    const values = payload.daily.precipitation_sum
      .map(finite)
      .filter((value: number | null): value is number => value != null && value >= 0);
    if (!values.length) return null;
    return Number(values.reduce((sum: number, value: number) => sum + value, 0).toFixed(1));
  } catch {
    return null;
  }
}

function mapObservation(row: any): IrrigationDistributionObservation {
  return {
    id: row.id ? String(row.id) : undefined,
    irrigationOperationId: String(row.irrigation_operation_id),
    irrigationDate: String(row.irrigation_date),
    satelliteDate: String(row.satellite_date),
    area: row.area ? String(row.area) : null,
    assessmentStatus: row.assessment_status,
    anomalyScore: Number(row.anomaly_score ?? 0),
    confidence: row.confidence,
    rainBetweenMm: finite(row.rain_between_mm),
    evidence: Array.isArray(row.evidence) ? row.evidence.map(text).filter(Boolean) : [],
    spatialSignature: row.spatial_signature && typeof row.spatial_signature === 'object' ? row.spatial_signature : {},
    createdAt: row.created_at ? String(row.created_at) : null,
  };
}

async function loadHistory(fieldId: string) {
  const { data, error } = await supabase
    .from('field_irrigation_distribution_observations')
    .select('id,irrigation_operation_id,irrigation_date,satellite_date,area,assessment_status,anomaly_score,confidence,rain_between_mm,evidence,spatial_signature,created_at')
    .eq('field_id', fieldId)
    .order('satellite_date', { ascending: false })
    .limit(12);
  if (error) throw error;
  return (data ?? []).map(mapObservation);
}

async function persistObservation(
  fieldId: string,
  observation: IrrigationDistributionObservation,
) {
  const { data: sessionData } = await supabase.auth.getSession();
  const userId = sessionData.session?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('field_irrigation_distribution_observations')
    .upsert({
      user_id: userId,
      field_id: fieldId,
      irrigation_operation_id: observation.irrigationOperationId,
      irrigation_date: observation.irrigationDate,
      satellite_date: observation.satelliteDate,
      area: observation.area,
      assessment_status: observation.assessmentStatus,
      anomaly_score: observation.anomalyScore,
      confidence: observation.confidence,
      rain_between_mm: observation.rainBetweenMm,
      evidence: observation.evidence,
      spatial_signature: observation.spatialSignature,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,field_id,irrigation_operation_id,satellite_date' });
  if (error) throw error;
}

function confidenceFor(score: number, evidenceCount: number, rainMm: number | null): IrrigationDistributionConfidence {
  if (rainMm != null && rainMm >= RAIN_CONFOUND_MM) return 'low';
  if (score >= 0.82 && evidenceCount >= 2) return 'strong';
  if (score >= 0.58) return 'medium';
  return 'low';
}

export async function loadIrrigationDistributionSnapshot(input: {
  fieldId: string;
  operations: FieldOperation[];
  satelliteDate?: string | null;
  homePusulaResult?: any;
  fieldSynthesis?: any;
}): Promise<IrrigationDistributionSnapshot> {
  const generatedAt = new Date().toISOString();
  const operations = irrigationOperations(input.operations ?? []);
  const latest = operations[0] ?? null;
  const latestIrrigation = latest
    ? { operationId: String(latest.id), date: dateOnly(latest.date)!, amount: finite(latest.quantity), unit: latest.unit ?? null }
    : null;
  const satelliteDate = dateOnly(input.satelliteDate ?? input.homePusulaResult?.context?.ndvi?.date ?? input.homePusulaResult?.context?.ndvi?.zonalStats?.datetime);
  const baseGuardrails = [
    'Bu özellik sulama dağılım anomalisi ön taramasıdır; damlatıcı, boru veya pompa arızasını uzaktan doğrulamaz.',
    'Tek uydu görüntüsüyle arıza teşhisi yapılmaz; tekrarlayan sınıf yalnız farklı sulama olaylarından sonra aynı bölgenin tekrar sapmasıyla oluşur.',
    'Yağış, drenaj, toprak farkı, bitki gelişimi ve başka stresler benzer mekânsal desen üretebilir; saha kontrolü gerekir.',
  ];

  if (!latestIrrigation) {
    return {
      fieldId: input.fieldId, status: 'needs_data', confidence: 'low', generatedAt,
      latestIrrigation: null, satelliteDate, daysAfterIrrigation: null, area: null,
      anomalyScore: null, repeatCount: 0, assessedIrrigationCount: 0, rainBetweenMm: null,
      headline: 'Sulama dağılımı için sulama kaydı bekleniyor',
      summary: 'Pusula, sulama sonrası uydu/radar tepkisini eşleştirebilmek için tarihli bir Sulama işlemi kaydı kullanır.',
      evidence: [], guardrails: baseGuardrails, history: [],
    };
  }

  if (!satelliteDate) {
    const history = await loadHistory(input.fieldId).catch(() => []);
    return {
      fieldId: input.fieldId, status: 'waiting_for_satellite', confidence: 'low', generatedAt,
      latestIrrigation, satelliteDate: null, daysAfterIrrigation: null, area: null,
      anomalyScore: null, repeatCount: 0, assessedIrrigationCount: history.length, rainBetweenMm: null,
      headline: 'Sulama sonrası uydu gözlemi bekleniyor',
      summary: 'Sulama kaydı var; dağılım karşılaştırması için sulamadan sonraki kullanılabilir uydu/radar tarihi bekleniyor.',
      evidence: [`Son sulama: ${latestIrrigation.date}.`], guardrails: baseGuardrails, history,
    };
  }

  const gap = daysBetween(latestIrrigation.date, satelliteDate);
  if (gap < 1 || gap > MAX_DAYS_AFTER_IRRIGATION) {
    const history = await loadHistory(input.fieldId).catch(() => []);
    return {
      fieldId: input.fieldId, status: 'waiting_for_satellite', confidence: 'low', generatedAt,
      latestIrrigation, satelliteDate, daysAfterIrrigation: gap, area: null,
      anomalyScore: null, repeatCount: 0, assessedIrrigationCount: history.length, rainBetweenMm: null,
      headline: gap < 1 ? 'Sulama sonrası yeni uydu tarihi bekleniyor' : 'Bu sulama için uygun karşılaştırma penceresi geçti',
      summary: gap < 1
        ? 'Mevcut uydu tarihi son sulamadan önce/aynı gün; dağılım sonucu üretmek için sonraki gözlem gerekiyor.'
        : 'Mevcut uydu tarihi sulamadan 14 günden daha uzak. Bu kayıt sulama dağılımına bağlanmadı.',
      evidence: [`Son sulama: ${latestIrrigation.date}.`, `Mevcut uydu tarihi: ${satelliteDate}.`], guardrails: baseGuardrails, history,
    };
  }

  const ndviSpatial = input.homePusulaResult?.context?.ndvi?.spatial ?? null;
  const radarSpatial = input.homePusulaResult?.context?.radar?.spatial ?? null;
  const best = scoreSpatial({
    ndviSpatial,
    radarSpatial,
    fallbackArea: input.fieldSynthesis?.importantArea?.area ?? input.homePusulaResult?.analysis?.importantArea?.area,
  });

  if (!best) {
    const history = await loadHistory(input.fieldId).catch(() => []);
    return {
      fieldId: input.fieldId, status: 'waiting_for_satellite', confidence: 'low', generatedAt,
      latestIrrigation, satelliteDate, daysAfterIrrigation: gap, area: null,
      anomalyScore: null, repeatCount: 0, assessedIrrigationCount: history.length, rainBetweenMm: null,
      headline: 'Sulama sonrası mekânsal karşılaştırma hazırlanamadı',
      summary: 'Uydu tarihi uygun ancak parsel içi 3×3 mekânsal sinyal henüz yeterli değil. Harita sağlık/radar katmanı yenilendiğinde tekrar taranır.',
      evidence: [`Sulama ile uydu arasında ${gap} gün var.`], guardrails: baseGuardrails, history,
    };
  }

  const rainMm = await rainBetween(input.fieldId, latestIrrigation.date, satelliteDate);
  const sensorSnapshot = await loadMicroclimateSensorSnapshot(input.fieldId).catch(() => null);
  const hydraulicAlerts = sensorSnapshot?.rangeAlerts ?? [];
  const rainPenalty = rainMm != null && rainMm >= RAIN_CONFOUND_MM ? 0.16 : 0;
  const adjustedScore = Math.max(0, Math.min(1, best.score - rainPenalty));
  const suspect = adjustedScore >= 0.58;
  const baseConfidence = confidenceFor(adjustedScore, best.evidence.length, rainMm);
  const confidence = suspect && hydraulicAlerts.length
    ? baseConfidence === 'low' ? 'medium' : 'strong'
    : baseConfidence;
  const observation: IrrigationDistributionObservation = {
    irrigationOperationId: latestIrrigation.operationId,
    irrigationDate: latestIrrigation.date,
    satelliteDate,
    area: suspect ? best.area : null,
    assessmentStatus: suspect ? 'suspect' : 'normal',
    anomalyScore: Number(adjustedScore.toFixed(3)),
    confidence,
    rainBetweenMm: rainMm,
    evidence: [
      ...best.evidence,
      rainMm != null ? `Sulama ile uydu tarihi arasında ERA5-Land toplam yağış: ${rainMm.toFixed(1)} mm.` : 'Ara dönem yağış toplamı alınamadı; bu karışıklık faktörü güvene eklenmedi.',
      ...hydraulicAlerts.slice(0, 2).map((item) => `${item.deviceName}: canlı ${item.metric === 'pressure' ? 'basınç' : 'debi'} ölçümü cihaz için tanımlanan beklenen aralığın dışında (${item.value.toFixed(1)}). Bu arıza teşhisi değildir.`),
    ],
    spatialSignature: best.signature,
  };

  await persistObservation(input.fieldId, observation).catch((error) => {
    console.warn('[irrigation-distribution] gözlem kalıcılaştırılamadı:', error);
  });
  const history = await loadHistory(input.fieldId).catch(() => [observation]);
  const currentAndRecent = history.slice(0, RECURRENCE_WINDOW);
  const sameAreaDistinctIrrigations = new Set(
    currentAndRecent
      .filter((item) => item.area === best.area && ['suspect', 'recurrent'].includes(item.assessmentStatus))
      .map((item) => item.irrigationOperationId),
  );
  const repeatCount = suspect ? sameAreaDistinctIrrigations.size : 0;
  const recurrent = suspect && repeatCount >= 2;

  if (recurrent && observation.assessmentStatus !== 'recurrent') {
    await persistObservation(input.fieldId, { ...observation, assessmentStatus: 'recurrent' }).catch(() => undefined);
  }

  const areaLabel = best.area.charAt(0).toLocaleUpperCase('tr-TR') + best.area.slice(1);
  const status = recurrent ? 'recurrent' : suspect ? 'suspect' : 'normal';
  const headline = recurrent
    ? `${areaLabel} bölümünde tekrarlayan sulama dağılım şüphesi`
    : suspect
      ? `Sulama sonrası ${best.area} bölümü farklı tepki verdi`
      : 'Sulama sonrası belirgin dağılım anomalisi görülmedi';
  const summary = recurrent
    ? `Son ${Math.min(RECURRENCE_WINDOW, history.length)} değerlendirmenin ${repeatCount} farklı sulamasında aynı ${best.area} bölümü tekrar sapma gösterdi. Bu, hat/debi/dağılım problemi olasılığını saha kontrolünde öncelikli hale getirir; uzaktan arıza teşhisi değildir.`
    : suspect
      ? `${best.area} bölümü sulamadan ${gap} gün sonraki uydu/radar karşılaştırmasında çevresine göre farklı kaldı. Tek olay arıza kanıtı değildir; aynı desen sonraki sulamalarda tekrar ederse güven artar.`
      : `Sulamadan ${gap} gün sonraki parsel içi karşılaştırmada kalıcı uyarı eşiğini aşan bir dağılım sapması oluşmadı.`;

  return {
    fieldId: input.fieldId,
    status,
    confidence: recurrent && confidence === 'strong' ? 'strong' : confidence,
    generatedAt,
    latestIrrigation,
    satelliteDate,
    daysAfterIrrigation: gap,
    area: suspect ? best.area : null,
    anomalyScore: Number(adjustedScore.toFixed(3)),
    repeatCount,
    assessedIrrigationCount: history.length,
    rainBetweenMm: rainMm,
    headline,
    summary,
    evidence: observation.evidence,
    guardrails: baseGuardrails,
    history,
  };
}
