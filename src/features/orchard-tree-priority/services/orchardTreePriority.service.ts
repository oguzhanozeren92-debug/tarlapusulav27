import type { OrchardIntelligenceSnapshot, OrchardTreeObservationRecord } from '../../orchard/types/orchardTree';
import type {
  OrchardTreePriorityBand,
  OrchardTreePriorityItem,
  OrchardTreePriorityReason,
  OrchardTreePrioritySnapshot,
} from '../types/orchardTreePriority';

const DAY_MS = 24 * 60 * 60 * 1000;
const FRUIT_STAGES = new Set(['fruit_set', 'fruit_growth', 'maturation', 'harvest_window']);

function dayDiff(now: Date, value: string | null | undefined) {
  if (!value) return null;
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return null;
  return Math.max(0, Math.floor((now.getTime() - time) / DAY_MS));
}

function bandFromScore(score: number, hasUrgentReason: boolean, noObservation: boolean): OrchardTreePriorityBand {
  if (hasUrgentReason || score >= 70) return 'urgent';
  if (score >= 40) return 'priority';
  if (noObservation) return 'baseline';
  return 'follow';
}

function addReason(
  reasons: OrchardTreePriorityReason[],
  code: OrchardTreePriorityReason['code'],
  label: string,
  detail: string,
) {
  reasons.push({ code, label, detail });
}

function scoreObservation(input: {
  observation: OrchardTreeObservationRecord | undefined;
  daysSinceObservation: number | null;
  alternance: boolean;
}) {
  const { observation, daysSinceObservation, alternance } = input;
  const reasons: OrchardTreePriorityReason[] = [];
  let score = 0;
  let urgent = false;

  if (!observation) {
    score += 30;
    addReason(reasons, 'no_observation', 'İlk gözlem gerekli', 'Bu ağaç için henüz saha gözlemi yok. Sorun olduğu anlamına gelmez; temel kayıt oluşturulmalı.');
  } else {
    if (observation.stressLevel === 'high') {
      score += 70;
      urgent = true;
      addReason(reasons, 'high_stress', 'Yüksek stres kaydı', 'Son gerçek saha/sensör kaydında stres yüksek işaretlenmiş.');
    } else if (observation.stressLevel === 'medium') {
      score += 35;
      addReason(reasons, 'medium_stress', 'Orta stres kaydı', 'Son gözlemde orta düzey stres kaydı var.');
    }

    if (observation.waterStatus === 'stress') {
      score += 70;
      urgent = true;
      addReason(reasons, 'water_stress', 'Su stresi kaydı', 'Son gerçek gözlemde su stresi işaretlenmiş.');
    } else if (observation.waterStatus === 'watch') {
      score += 30;
      addReason(reasons, 'water_watch', 'Su durumu takipte', 'Son gözlemde su durumu takip gerektiriyor.');
    }

    if (daysSinceObservation !== null && daysSinceObservation > 90) {
      score += 35;
      addReason(reasons, 'stale_observation', 'Gözlem eski', `Son ağaç gözlemi ${daysSinceObservation} gün önce yapılmış.`);
    } else if (daysSinceObservation !== null && daysSinceObservation > 45) {
      score += 22;
      addReason(reasons, 'stale_observation', 'Gözlem yenilenmeli', `Son ağaç gözlemi ${daysSinceObservation} gün önce yapılmış.`);
    }

    const fruitStage = FRUIT_STAGES.has(observation.stage);
    if (fruitStage && (observation.fruitLoad === 'low' || observation.fruitLoad === 'none')) {
      score += observation.fruitLoad === 'none' ? 24 : 16;
      addReason(
        reasons,
        'low_fruit_load',
        'Meyve yükü düşük',
        'Meyve dönemindeki son saha kaydında yük düşük görünüyor; komşu ağaçlarla karşılaştırılması yararlı olur.',
      );
    }
  }

  if (alternance) {
    score += 25;
    addReason(reasons, 'alternance', 'Alternans takibi', 'En az üç yıllık gerçek ağaç veriminde dönüşümlü yük örüntüsü görülmüş. Teşhis değildir.');
  }

  return { score, reasons, urgent };
}

export function buildOrchardTreePrioritySnapshot(
  orchard: OrchardIntelligenceSnapshot | null | undefined,
  now = new Date(),
): OrchardTreePrioritySnapshot {
  const trees = orchard?.trees ?? [];
  const latestByTree = new Map((orchard?.latestObservations ?? []).map((item) => [item.treeId, item]));
  const alternanceIds = new Set(orchard?.alternance?.possibleTreeIds ?? []);

  if (!trees.length) {
    return {
      status: 'no_trees',
      totalTreeCount: 0,
      observedTreeCount: 0,
      urgentCount: 0,
      priorityCount: 0,
      followCount: 0,
      baselineCount: 0,
      topTrees: [],
      headline: 'Ağaç bazlı kayıt henüz yok',
      summary: 'Bahçedeki ağaçlar kaydedildiğinde Pusula hangi ağaçların önce kontrol edilmesi gerektiğini sıralar.',
      generatedAt: now.toISOString(),
    };
  }

  const items = trees.map((tree): OrchardTreePriorityItem => {
    const observation = latestByTree.get(tree.id);
    const daysSinceObservation = dayDiff(now, observation?.observedAt);
    const scored = scoreObservation({
      observation,
      daysSinceObservation,
      alternance: alternanceIds.has(tree.id),
    });
    const band = bandFromScore(scored.score, scored.urgent, !observation);
    return {
      treeId: tree.id,
      treeCode: tree.treeCode,
      variety: tree.variety,
      rowNo: tree.rowNo,
      latestObservationAt: observation?.observedAt ?? null,
      daysSinceObservation,
      band,
      score: scored.score,
      reasons: scored.reasons,
    };
  });

  const ranked = items
    .filter((item) => item.reasons.length > 0)
    .sort((a, b) => b.score - a.score || a.treeCode.localeCompare(b.treeCode, 'tr-TR'));

  const urgentCount = items.filter((item) => item.band === 'urgent').length;
  const priorityCount = items.filter((item) => item.band === 'priority').length;
  const followCount = items.filter((item) => item.band === 'follow' && item.reasons.length > 0).length;
  const baselineCount = items.filter((item) => item.band === 'baseline').length;
  const observedTreeCount = trees.length - baselineCount;

  const headline = urgentCount
    ? `${urgentCount} ağaç önce kontrol edilmeli`
    : priorityCount
      ? `${priorityCount} ağaç öncelikli takipte`
      : baselineCount
        ? `${baselineCount} ağaçta ilk gözlem eksik`
        : 'Şu an öne çıkan ağaç yok';

  const summary = urgentCount
    ? 'Son gerçek saha kayıtlarında yüksek stres veya su stresi bulunan ağaçlar listenin başına alındı.'
    : priorityCount
      ? 'Stres, eski gözlem, meyve yükü ve gerçek verim geçmişi birlikte değerlendirilerek kontrol sırası oluşturuldu.'
      : baselineCount
        ? 'Bu ağaçlarda problem tespit edilmedi; sadece karşılaştırma yapabilmek için ilk saha gözlemi gerekiyor.'
        : 'Mevcut gerçek ağaç kayıtlarında özel saha kontrolü gerektiren bir sinyal görünmüyor.';

  return {
    status: observedTreeCount ? 'ready' : 'no_observations',
    totalTreeCount: trees.length,
    observedTreeCount,
    urgentCount,
    priorityCount,
    followCount,
    baselineCount,
    topTrees: ranked.slice(0, 6),
    headline,
    summary,
    generatedAt: now.toISOString(),
  };
}
