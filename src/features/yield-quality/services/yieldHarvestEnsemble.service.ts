import { loadLatestAquaCropPilotAudit, isAquaCropPilotAuditFresh } from '../../irrigation/services/aquaCropPilotEvidence.service';
import { runDssatShadow, type DssatShadowRunResult } from '../../irrigation/services/dssatShadowRun.service';
import { loadLatestPcsePilotAudit, toPcsePilotEvidence } from '../../phenology/services/pcsePilotEvidence.service';
import { loadFieldScientificSignals } from '../../../services/fieldScientificSignals.service';
import type {
  HarvestTimingConsensus,
  YieldEnsembleMember,
  YieldForecastEnvelope,
  YieldHarvestQualitySnapshot,
} from '../types/yieldHarvestQuality';

export type YieldHarvestEnsembleSupport = {
  dssat: DssatShadowRunResult | null;
  aquacrop: Awaited<ReturnType<typeof loadLatestAquaCropPilotAudit>>;
  pcse: Awaited<ReturnType<typeof loadLatestPcsePilotEvidence>>;
  sl2p: Awaited<ReturnType<typeof loadFieldScientificSignals>> | null;
  warnings: string[];
};

const dssatCache = new Map<string, { at: number; value: DssatShadowRunResult | null }>();
const DSSAT_TTL_MS = 6 * 60 * 60 * 1000;

async function loadLatestPcsePilotEvidence(fieldId: string) {
  const audit = await loadLatestPcsePilotAudit(fieldId);
  return toPcsePilotEvidence(audit);
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isoDay(value: unknown) {
  const text = String(value ?? '').trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(`${text}T12:00:00Z`))
    ? text
    : null;
}

function normalizedCrop(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function wheatCrop(value: unknown) {
  return /bugday|wheat/.test(normalizedCrop(value));
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function cachedDssat(fieldId: string) {
  const cached = dssatCache.get(fieldId);
  if (cached && Date.now() - cached.at < DSSAT_TTL_MS) return cached.value;
  const fallback: DssatShadowRunResult = {
    ok: false,
    blocked: true,
    fieldId,
    summary: null,
    missingInputs: ['timeout'],
    note: 'DSSAT shadow yanıtı bu yüklemede beklenmedi; diğer kanıtlarla devam edildi.',
    error: null,
  };
  const value = await withTimeout(runDssatShadow(fieldId), 7000, fallback).catch(() => null);
  dssatCache.set(fieldId, { at: Date.now(), value });
  return value;
}

export async function loadYieldHarvestEnsembleSupport(fieldIdInput: string): Promise<YieldHarvestEnsembleSupport> {
  const fieldId = String(fieldIdInput ?? '').trim();
  if (!fieldId) return { dssat: null, aquacrop: null, pcse: null, sl2p: null, warnings: [] };

  const [dssatResult, aquaResult, pcseResult, sl2pResult] = await Promise.allSettled([
    cachedDssat(fieldId),
    loadLatestAquaCropPilotAudit(fieldId),
    loadLatestPcsePilotEvidence(fieldId),
    loadFieldScientificSignals(fieldId),
  ]);

  const warnings: string[] = [];
  if (dssatResult.status === 'rejected') warnings.push('DSSAT shadow kanıtı okunamadı.');
  if (aquaResult.status === 'rejected') warnings.push('AquaCrop pilot kanıtı okunamadı.');
  if (pcseResult.status === 'rejected') warnings.push('PCSE/WOFOST pilot kanıtı okunamadı.');
  if (sl2pResult.status === 'rejected') warnings.push('SL2P biyofizik kanıtı okunamadı.');

  return {
    dssat: dssatResult.status === 'fulfilled' ? dssatResult.value : null,
    aquacrop: aquaResult.status === 'fulfilled' ? aquaResult.value : null,
    pcse: pcseResult.status === 'fulfilled' ? pcseResult.value : null,
    sl2p: sl2pResult.status === 'fulfilled' ? sl2pResult.value : null,
    warnings,
  };
}

function dssatYield(support: YieldHarvestEnsembleSupport) {
  if (!support.dssat?.ok || support.dssat.blocked || !support.dssat.summary) return null;
  return finite(
    support.dssat.summary.harvested_yield_kg_ha ??
    support.dssat.summary.yield_at_maturity_kg_ha,
  );
}

function dssatHarvestDate(support: YieldHarvestEnsembleSupport) {
  const summary = support.dssat?.summary;
  if (!summary) return null;
  return isoDay(summary.harvest_date_code) ?? isoDay(summary.maturity_date_code);
}

function historyKgHa(snapshot: YieldHarvestQualitySnapshot) {
  const avg = finite(snapshot.history.averageYieldKgHa);
  if (avg === null || avg <= 0) return null;
  return avg;
}

function evidenceEnvelope(values: number[]) {
  const usable = values.filter((value) => Number.isFinite(value) && value >= 0).sort((a, b) => a - b);
  if (!usable.length) return { lower: null, central: null, upper: null };
  if (usable.length === 1) return { lower: null, central: usable[0], upper: null };
  const central = usable.length % 2
    ? usable[(usable.length - 1) / 2]
    : (usable[usable.length / 2 - 1] + usable[usable.length / 2]) / 2;
  return { lower: usable[0], central, upper: usable[usable.length - 1] };
}

function forecastFor(snapshot: YieldHarvestQualitySnapshot, members: YieldEnsembleMember[]): YieldForecastEnvelope {
  const observed = finite(snapshot.observed.yieldKgHa);
  if (observed !== null) {
    return {
      status: 'observed', scope: wheatCrop(snapshot.crop) ? 'wheat_first' : 'general_observed_only',
      lowerKgHa: observed, centralKgHa: observed, upperKgHa: observed,
      rangeKind: 'observed', confidence: 'high', modelMemberCount: 0,
      historicalSampleCount: snapshot.history.sampleCount,
      uncertaintyNote: 'Gerçek hasat/verim kaydı mevcut; model aralığı kullanıcıya gerçek verimin yerine gösterilmez.',
      actualOverridesModels: true,
    };
  }

  if (!wheatCrop(snapshot.crop)) {
    return {
      status: snapshot.history.sampleCount ? 'historical_context' : 'unavailable',
      scope: 'general_observed_only', lowerKgHa: null, centralKgHa: null, upperKgHa: null,
      rangeKind: 'none', confidence: snapshot.history.sampleCount >= 3 ? 'low' : 'unknown',
      modelMemberCount: 0, historicalSampleCount: snapshot.history.sampleCount,
      uncertaintyNote: 'Sayısal ensemble ilk pilotta buğdayla sınırlıdır; diğer ürünlerde gerçek verim ve ölçülen kalite gösterilir.',
      actualOverridesModels: true,
    };
  }

  const modelValues = members
    .filter((member) => member.status === 'ready' && member.yieldKgHa !== null)
    .map((member) => Number(member.yieldKgHa));
  const historical = historyKgHa(snapshot);
  const envelope = evidenceEnvelope([
    ...modelValues,
    ...(historical !== null ? [historical] : []),
  ]);

  if (modelValues.length) {
    return {
      status: 'model_supported', scope: 'wheat_first',
      lowerKgHa: envelope.lower, centralKgHa: envelope.central, upperKgHa: envelope.upper,
      rangeKind: envelope.lower !== null && envelope.upper !== null ? 'evidence_envelope' : 'none',
      confidence: modelValues.length >= 2 && snapshot.history.sampleCount >= 3 ? 'medium' : 'low',
      modelMemberCount: modelValues.length, historicalSampleCount: snapshot.history.sampleCount,
      uncertaintyNote: envelope.lower !== null && envelope.upper !== null
        ? 'Aralık istatistiksel güven aralığı değildir; gerçek model çıktısı ile tarla geçmişinin kanıt zarfıdır.'
        : 'Tek sayısal model üyesi bulundu; kalibre edilmiş belirsizlik aralığı olmadığı için yalnız merkez değer bağlam olarak tutuldu.',
      actualOverridesModels: true,
    };
  }

  return {
    status: historical !== null ? 'historical_context' : 'unavailable', scope: 'wheat_first',
    lowerKgHa: null, centralKgHa: null, upperKgHa: null, rangeKind: 'none',
    confidence: historical !== null && snapshot.history.sampleCount >= 3 ? 'low' : 'unknown',
    modelMemberCount: 0, historicalSampleCount: snapshot.history.sampleCount,
    uncertaintyNote: historical !== null
      ? 'Canlı sayısal verim modeli hazır değil; geçmiş ortalama yalnız bağlamdır ve tahmin olarak sunulmaz.'
      : 'Sayısal verim aralığı için gerçek model çıktısı veya yeterli geçmiş bulunmuyor.',
    actualOverridesModels: true,
  };
}

function dateOffset(day: string, delta: number) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

function harvestTiming(snapshot: YieldHarvestQualitySnapshot, members: YieldEnsembleMember[]): HarvestTimingConsensus {
  if (snapshot.harvest.actualDate) {
    return { status: 'actual', date: snapshot.harvest.actualDate, lowerDate: snapshot.harvest.actualDate, upperDate: snapshot.harvest.actualDate, confidence: 'high', memberCount: 1, note: 'Gerçek hasat tarihi model tarihlerinden üstündür.' };
  }

  const phenologyDate = isoDay(snapshot.harvest.expectedDate);
  const modelDates = members.map((member) => member.harvestDate).filter((value): value is string => Boolean(value));
  if (phenologyDate) {
    const closeModelDates = modelDates.filter((day) => Math.abs((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${phenologyDate}T12:00:00Z`)) / 86400000) <= 10);
    const spread = closeModelDates.length ? 5 : 7;
    return {
      status: closeModelDates.length ? 'consensus' : 'phenology_only',
      date: phenologyDate,
      lowerDate: dateOffset(phenologyDate, -spread),
      upperDate: dateOffset(phenologyDate, spread),
      confidence: closeModelDates.length ? 'medium' : 'low',
      memberCount: 1 + closeModelDates.length,
      note: closeModelDates.length
        ? 'Fenoloji hasat tarihi model zamanlamasıyla aynı pencereye düşüyor; saha olgunluğu yine son kontroldür.'
        : 'Hasat penceresi fenolojiye dayanıyor; model tarihi doğrulaması bulunmuyor.',
    };
  }

  if (modelDates.length) {
    return { status: 'model_context', date: modelDates[0], lowerDate: dateOffset(modelDates[0], -10), upperDate: dateOffset(modelDates[0], 10), confidence: 'low', memberCount: modelDates.length, note: 'Yalnız supporting model zamanı mevcut; production hasat tarihi olarak kullanılmaz.' };
  }

  return { status: 'unavailable', date: null, lowerDate: null, upperDate: null, confidence: 'unknown', memberCount: 0, note: 'Hasat zamanı için yeterli gerçek veya model kanıtı yok.' };
}

export function applyYieldHarvestEnsemble(
  snapshot: YieldHarvestQualitySnapshot,
  support: YieldHarvestEnsembleSupport,
): YieldHarvestQualitySnapshot {
  const dssatKgHa = dssatYield(support);
  const dssatDate = dssatHarvestDate(support);
  const aquaReady = Boolean(support.aquacrop && support.aquacrop.status === 'completed' && isAquaCropPilotAuditFresh(support.aquacrop));
  const pcseReady = support.pcse?.status === 'ready';
  const sl2pLatest = support.sl2p?.biophysics.latest ?? null;
  const sl2pQuality = String(sl2pLatest?.qc?.quality ?? '').toLocaleLowerCase('tr-TR');
  const sl2pReady = Boolean(sl2pLatest && !['low', 'invalid', 'unknown'].includes(sl2pQuality));

  const members: YieldEnsembleMember[] = [
    {
      key: 'dssat', label: 'DSSAT shadow',
      status: dssatKgHa !== null ? 'ready' : support.dssat?.blocked ? 'blocked' : 'unavailable',
      yieldKgHa: dssatKgHa, harvestDate: dssatDate, weight: dssatKgHa !== null ? 1 : 0,
      productionAuthority: false,
      note: dssatKgHa !== null ? 'Gerçek DSSAT shadow çıktısı; production verim kaydını geçemez.' : support.dssat?.note ?? support.dssat?.error ?? 'DSSAT sayısal verim çıktısı yok.',
    },
    {
      key: 'aquacrop', label: 'AquaCrop', status: aquaReady ? 'context' : 'unavailable',
      yieldKgHa: null, harvestDate: null, weight: 0, productionAuthority: false,
      note: aquaReady ? 'Mevcut AquaCrop pilotu su dengesi evidence-only çalışıyor; yield_authority=false olduğu için verim sayısı ensemble’a alınmadı.' : 'AquaCrop pilot kanıtı hazır değil.',
    },
    {
      key: 'pcse-wofost', label: 'PCSE/WOFOST', status: pcseReady ? 'context' : support.pcse?.status === 'blocked' ? 'blocked' : 'unavailable',
      yieldKgHa: null, harvestDate: null, weight: 0, productionAuthority: false,
      note: pcseReady ? `Fenoloji desteği hazır${support.pcse?.dvs != null ? ` · DVS ${Number(support.pcse.dvs).toFixed(2)}` : ''}; mevcut pilot verim otoritesi değildir.` : support.pcse?.note ?? 'PCSE/WOFOST kanıtı hazır değil.',
    },
    {
      key: 'sl2p-biophysics', label: 'SL2P biyofizik', status: sl2pReady ? 'context' : 'unavailable',
      yieldKgHa: null, harvestDate: null, weight: 0, productionAuthority: false,
      note: sl2pReady ? 'LAI/CCC/CWC/fCOVER biyofizik bağlamı hazır; tek başına ton/ha veya kalite sınıfı değildir.' : 'SL2P biyofizik bağlamı hazır değil veya kalite düşük.',
    },
    {
      key: 'yield4cast', label: 'YIELD4CAST', status: 'method_reference', yieldKgHa: null, harvestDate: null, weight: 0, productionAuthority: false,
      note: 'YIELD4CAST yaklaşımı roadmap method-reference olarak tutulur; doğrulanmış TarlaPusula runtime çıktısı yok.',
    },
    {
      key: 'qualitree', label: 'QualiTree', status: 'method_reference', yieldKgHa: null, harvestDate: null, weight: 0, productionAuthority: false,
      note: 'QualiTree meyve kalite/irilik/şeker yaklaşımı method-reference; yerel tür/çeşit kalibrasyonu olmadan sayısal kalite çıktısı üretmez.',
    },
  ];

  const forecast = forecastFor(snapshot, members);
  const timing = harvestTiming(snapshot, members);
  const supportingEvidence = [
    ...support.warnings,
    ...members.filter((member) => member.status === 'ready' || member.status === 'context').map((member) => `${member.label}: ${member.note}`),
  ].slice(0, 8);

  const notes = [...snapshot.notes];
  if (forecast.status === 'model_supported') notes.push(`Buğday verim ensemble kanıtı hazır; ${forecast.uncertaintyNote}`);
  if (forecast.status === 'historical_context') notes.push('Canlı sayısal ensemble hazır olmadığı için geçmiş verim tahmin diye etiketlenmedi.');
  if (supportingEvidence.length) notes.push('DSSAT/AquaCrop/PCSE/SL2P yalnız destek kanıtıdır; gerçek hasat/verim kaydı otoritedir.');

  return {
    ...snapshot,
    ensemble: {
      forecast,
      harvestTiming: timing,
      members,
      supportingEvidence,
      methodReferences: [
        { key: 'yield4cast', runtimeAvailable: false, productionAuthority: false, note: 'IRTA YIELD4CAST yaklaşımı; TarlaPusula runtime yok.' },
        { key: 'qualitree', runtimeAvailable: false, productionAuthority: false, note: 'QualiTree meyve kalite yaklaşımı; yerel kalibrasyon/runtime yok.' },
        { key: 'prosail', runtimeAvailable: false, productionAuthority: false, note: 'PROSAIL sayısal kalite/verim runtime yok; mevcut SL2P biyofizik yalnız supporting context.' },
      ],
    },
    authority: {
      ...snapshot.authority,
      supportingModels: ['dssat', 'aquacrop', 'pcse-wofost', 'sl2p-biophysics', 'yield4cast', 'qualitree'],
    },
    notes: [...new Set(notes)],
  };
}
