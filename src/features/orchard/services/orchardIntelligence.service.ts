import {
  listOrchardTreeObservations,
  listOrchardTrees,
  resolveOrchardPilotCrop,
} from './orchardTree.service';
import type {
  OrchardAlternanceResult,
  OrchardIntelligenceSnapshot,
  OrchardMethodReference,
  OrchardTreeObservationRecord,
  OrchardTreeRecord,
  OrchardTreeStatus,
} from '../types/orchardTree';

const METHOD_REFERENCES: OrchardMethodReference[] = [
  { key: 'asymetree', label: 'Asymetree yaklaşımı', runtimeAvailable: false, productionAuthority: false, role: 'method_reference' },
  { key: 'samson', label: 'SAMSON yaklaşımı', runtimeAvailable: false, productionAuthority: false, role: 'method_reference' },
  { key: 'fruitmeasure', label: 'FruitMeasure yaklaşımı', runtimeAvailable: false, productionAuthority: false, role: 'method_reference' },
  { key: 'mangosense', label: 'MangoSense yaklaşımı', runtimeAvailable: false, productionAuthority: false, role: 'method_reference' },
];

function dateMs(value: unknown) {
  const ms = Date.parse(String(value ?? ''));
  return Number.isFinite(ms) ? ms : null;
}

function latestByTree(observations: OrchardTreeObservationRecord[]) {
  const result = new Map<string, OrchardTreeObservationRecord>();
  for (const observation of [...observations].sort((a, b) => b.observedAt.localeCompare(a.observedAt))) {
    if (!result.has(observation.treeId)) result.set(observation.treeId, observation);
  }
  return result;
}

function treeStatus(observation: OrchardTreeObservationRecord | undefined): OrchardTreeStatus {
  if (!observation) return 'unknown';
  if (observation.stressLevel === 'high' || observation.waterStatus === 'stress') return 'attention';
  if (observation.stressLevel === 'medium' || observation.stressLevel === 'low' || observation.waterStatus === 'watch') return 'watch';
  if (observation.stressLevel === 'none' && observation.waterStatus === 'normal') return 'normal';
  return 'unknown';
}

function alternanceFromMeasuredYield(
  trees: OrchardTreeRecord[],
  observations: OrchardTreeObservationRecord[],
): OrchardAlternanceResult {
  const possibleTreeIds: string[] = [];
  let evaluatedTreeCount = 0;
  const evidence: string[] = [];

  for (const tree of trees) {
    const byYear = new Map<number, number>();
    for (const observation of observations) {
      if (observation.treeId !== tree.id || observation.yieldKgMeasured === null) continue;
      const year = new Date(observation.observedAt).getUTCFullYear();
      if (!Number.isFinite(year)) continue;
      byYear.set(year, Math.max(byYear.get(year) ?? -Infinity, observation.yieldKgMeasured));
    }

    const values = [...byYear.entries()].sort((a, b) => a[0] - b[0]).slice(-3);
    if (values.length < 3) continue;
    evaluatedTreeCount += 1;

    const [a, b, c] = values.map(([, value]) => value);
    const edgeMean = (a + c) / 2;
    const edgeSimilarity = edgeMean > 0 ? Math.abs(a - c) / edgeMean : 0;
    const middleDifference = edgeMean > 0 ? Math.abs(b - edgeMean) / edgeMean : 0;
    const alternates = edgeSimilarity <= 0.35 && middleDifference >= 0.35;
    if (alternates) {
      possibleTreeIds.push(tree.id);
      evidence.push(`${tree.treeCode}: son üç gerçek ağaç verim kaydında belirgin yüksek-düşük-yüksek / düşük-yüksek-düşük örüntüsü var.`);
    }
  }

  if (!evaluatedTreeCount) {
    return { status: 'insufficient', evaluatedTreeCount: 0, possibleTreeIds: [], evidence: [] };
  }
  return {
    status: possibleTreeIds.length ? 'possible' : 'stable',
    evaluatedTreeCount,
    possibleTreeIds,
    evidence: evidence.slice(0, 5),
  };
}

export function buildOrchardIntelligenceSnapshot(input: {
  fieldId: string;
  crop: string;
  trees: OrchardTreeRecord[];
  observations: OrchardTreeObservationRecord[];
  now?: Date;
}): OrchardIntelligenceSnapshot {
  const now = input.now ?? new Date();
  const cropKey = resolveOrchardPilotCrop(input.crop);
  const trees = input.trees.filter((tree) => tree.active);
  const observations = input.observations.filter((observation) => trees.some((tree) => tree.id === observation.treeId));
  const latest = latestByTree(observations);
  const latestObservations = [...latest.values()];
  const recentCutoff = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recent = observations.filter((item) => (dateMs(item.observedAt) ?? 0) >= recentCutoff);
  const stressMediumHigh = latestObservations.filter((item) => item.stressLevel === 'medium' || item.stressLevel === 'high');
  const highStress = latestObservations.filter((item) => item.stressLevel === 'high');
  const waterStress = latestObservations.filter((item) => item.waterStatus === 'stress');
  const flowering = latestObservations.filter((item) => item.stage === 'flowering' || ['medium', 'high', 'very_high'].includes(item.flowerIntensity));
  const fruiting = latestObservations.filter((item) => ['fruit_set', 'fruit_growth', 'maturation', 'harvest_window'].includes(item.stage) || ['medium', 'high', 'very_high'].includes(item.fruitLoad));
  const measuredYieldTreeIds = new Set(observations.filter((item) => item.yieldKgMeasured !== null).map((item) => item.treeId));
  const sensorTreeIds = new Set(observations.filter((item) => item.source === 'sensor' && (item.trunkDiameterMm !== null || item.sapFlowLph !== null)).map((item) => item.treeId));
  const alternance = alternanceFromMeasuredYield(trees, observations);
  const latestObservationAt = observations.map((item) => item.observedAt).sort().at(-1) ?? null;

  const evidence = [
    trees.length ? `${trees.length} kayıtlı ağaç ayrı dijital varlık olarak izleniyor.` : '',
    latestObservations.length ? `${latestObservations.length} ağaçta en az bir gerçek saha/sensör gözlemi var.` : '',
    stressMediumHigh.length ? `${stressMediumHigh.length} ağaçta son kayıt orta/yüksek stres gösteriyor.` : '',
    waterStress.length ? `${waterStress.length} ağaçta son gerçek gözlem su stresi olarak işaretlendi.` : '',
    flowering.length ? `${flowering.length} ağaç çiçeklenme bağlamında.` : '',
    fruiting.length ? `${fruiting.length} ağaç meyve bağlamında.` : '',
    alternance.status === 'possible' ? `${alternance.possibleTreeIds.length} ağaçta gerçek yıllık verimlerden olası alternans örüntüsü var.` : '',
  ].filter(Boolean);

  const warnings = [
    !cropKey ? 'Ağaç bazlı Pusula üretim pilotu şu anda yalnız Badem ve Antep Fıstığı için açıktır.' : '',
    trees.some((tree) => tree.latitude === null || tree.longitude === null)
      ? 'Konumu olmayan ağaçlar harita katmanında gösterilmez; kayıt ve gözlemler yine korunur.'
      : '',
    'Sentinel-2 parsel sinyali tek bir ağacın stres, çiçek veya meyve durumunu kanıtlamaz; ağaç durumu yalnız gerçek ağaç kaydı/saha/sensör kanıtından gelir.',
    'Asymetree, SAMSON, FruitMeasure ve MangoSense bu sürümde yöntem referansıdır; doğrulanmış TarlaPusula runtime çıktısı değildir.',
  ].filter(Boolean);

  const mapPoints = trees
    .filter((tree) => tree.latitude !== null && tree.longitude !== null)
    .map((tree) => {
      const observation = latest.get(tree.id);
      return {
        treeId: tree.id,
        treeCode: tree.treeCode,
        latitude: tree.latitude!,
        longitude: tree.longitude!,
        status: treeStatus(observation),
        latestObservationAt: observation?.observedAt ?? null,
        variety: tree.variety,
      };
    });

  return {
    version: '16.0',
    fieldId: input.fieldId,
    crop: input.crop,
    cropKey,
    pilotEnabled: Boolean(cropKey),
    status: !cropKey
      ? 'not_applicable'
      : trees.length === 0
        ? 'empty'
        : highStress.length || waterStress.length
          ? 'attention'
          : 'ready',
    treeCount: trees.length,
    geolocatedTreeCount: mapPoints.length,
    observedTreeCount: latestObservations.length,
    latestObservationAt,
    recentObservationCount: recent.length,
    stressedTreeCount: stressMediumHigh.length,
    highStressTreeCount: highStress.length,
    waterStressTreeCount: waterStress.length,
    floweringTreeCount: flowering.length,
    fruitingTreeCount: fruiting.length,
    measuredYieldTreeCount: measuredYieldTreeIds.size,
    measuredSensorTreeCount: sensorTreeIds.size,
    alternance,
    trees,
    latestObservations,
    mapPoints,
    evidence,
    warnings,
    methodReferences: METHOD_REFERENCES,
    generatedAt: now.toISOString(),
  };
}

export async function loadOrchardIntelligenceSnapshot(
  fieldIdInput: unknown,
  cropInput: unknown,
): Promise<OrchardIntelligenceSnapshot> {
  const fieldId = String(fieldIdInput ?? '').trim();
  const crop = String(cropInput ?? '').trim();
  if (!fieldId) {
    return buildOrchardIntelligenceSnapshot({ fieldId: '', crop, trees: [], observations: [] });
  }
  const [trees, observations] = await Promise.all([
    listOrchardTrees(fieldId),
    listOrchardTreeObservations(fieldId),
  ]);
  return buildOrchardIntelligenceSnapshot({ fieldId, crop, trees, observations });
}
