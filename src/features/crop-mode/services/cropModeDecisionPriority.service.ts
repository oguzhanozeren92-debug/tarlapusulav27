import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type {
  CropModeModule,
  CropModeRisk,
  CropModeRuntime,
} from '../types/cropMode';

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function moduleForEvent(event: HomeDecisionEvent): CropModeModule | null {
  if (event.source === 'risk-radar') return 'risk';
  if (event.source === 'phenology') return 'phenology';
  if (event.source === 'irrigation') return 'irrigation';
  if (event.source === 'nutrition') return 'nutrition';
  if (event.source === 'satellite') return 'satellite';
  if (event.source === 'weather') return 'weather';
  if (event.source === 'weed-intelligence') return 'weed';
  if (event.source === 'calendar' || event.source === 'operation') return 'harvest';
  return null;
}

function inferRiskFromText(value: unknown): CropModeRisk | null {
  const haystack = normalize(value);

  if (/\b(don|frost)\b/.test(haystack)) return 'frost';
  if (/\b(isi|sicak|heat|yuksek sicaklik)\b/.test(haystack)) return 'heat';
  if (/\b(kurak|kuraklik|drought)\b/.test(haystack)) return 'drought';
  if (/\b(su stresi|water stress|susuzluk)\b/.test(haystack)) return 'water_stress';
  if (/\b(yabanci ot|weed)\b/.test(haystack)) return 'weed_pressure';
  if (/\b(yatma|lodging)\b/.test(haystack)) return 'lodging';
  if (/\b(hasat).*(yagis|hava)|\b(yagis|hava).*(hasat)\b/.test(haystack)) {
    return 'harvest_weather';
  }
  if (/\b(zararli|pest|bocek|akar|mite)\b/.test(haystack)) return 'pest';
  if (/\b(mantar|fungal|fungus|hastalik|disease|kulleme|mildiyo|pas)\b/.test(haystack)) {
    return 'fungal_disease';
  }

  return null;
}

function riskFromRadar(radar: unknown): CropModeRisk | null {
  if (!radar || typeof radar !== 'object') return null;
  const value = radar as any;
  const threat =
    (Array.isArray(value.topThreats) ? value.topThreats[0] : null) ??
    (Array.isArray(value.threats) ? value.threats[0] : null);
  if (!threat) return null;

  return inferRiskFromText(
    `${threat.threatType ?? ''} ${threat.type ?? ''} ${threat.name ?? ''} ${threat.displayName ?? ''} ${threat.commonName ?? ''}`,
  );
}

function riskForEvent(event: HomeDecisionEvent, radar: unknown): CropModeRisk | null {
  if (event.source === 'risk-radar') {
    return riskFromRadar(radar) ?? inferRiskFromText(`${event.title} ${event.detail}`);
  }

  return inferRiskFromText(
    `${event.source} ${event.group} ${event.title} ${event.detail}`,
  );
}

function rankBoost(rank: number, maxBoost: number) {
  if (rank < 0) return 0;
  if (rank === 0) return maxBoost;
  if (rank === 1) return Math.max(0, maxBoost - 3);
  if (rank === 2) return Math.max(0, maxBoost - 6);
  if (rank <= 4) return Math.max(0, maxBoost - 9);
  return 0;
}

/**
 * Ürün modu tarımsal risk skorunu veya bilimsel meteoroloji eşiğini değiştirmez.
 * Zaten üretilmiş gerçek sinyallerin ürün için önem sırasını düzenler.
 * Böylece örneğin bademde don, bağda mantari hastalık, mısırda ısı/su stresi
 * daha yukarı taşınır. Warning/danger bildirimleri hiçbir zaman gizlenmez.
 */
export function applyCropModeDecisionPriority(
  events: HomeDecisionEvent[],
  cropMode: CropModeRuntime,
  context: { riskRadar?: unknown } = {},
): HomeDecisionEvent[] {
  if (!events.length || cropMode.fallback) return events;

  return events.map((event) => {
    const module = moduleForEvent(event);
    const moduleRank = module ? cropMode.priorityModules.indexOf(module) : -1;
    const riskKey = riskForEvent(event, context.riskRadar);
    const riskRank = riskKey ? cropMode.priorityRisks.indexOf(riskKey) : -1;

    const moduleBoost = rankBoost(moduleRank, 6);
    const riskBoost = rankBoost(riskRank, 12);
    const totalBoost = moduleBoost + riskBoost;

    let channels = [...event.channels];

    // Yalnızca düşük önem taşıyan bilgi bildirimlerini azalt; tehlike/uyarı kalır.
    if (
      event.severity === 'info' &&
      channels.includes('notification') &&
      moduleRank > 5 &&
      (riskRank < 0 || riskRank > 5)
    ) {
      channels = channels.filter((channel) => channel !== 'notification');
    }

    return {
      ...event,
      priority: Math.min(130, event.priority + totalBoost),
      channels,
    };
  });
}
