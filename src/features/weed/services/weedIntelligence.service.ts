import { supabase } from '../../../supabaseClient';
import type { AiFieldAnalysis } from '../../../types';
import { publishUserFieldDataEvent } from '../../data-backbone/services/fieldDataBackbone.service';
import type {
  FieldDataBackboneSnapshot,
  FieldDataEvent,
} from '../../data-backbone/types/fieldDataBackbone';

export type WeedPresence =
  | 'not_visible'
  | 'possible'
  | 'visible'
  | 'uncertain';

export type WeedDensity =
  | 'low'
  | 'medium'
  | 'high'
  | 'unknown';

export type WeedDistribution =
  | 'scattered'
  | 'patchy'
  | 'dense_patch'
  | 'uniform'
  | 'row_interference'
  | 'unknown';

export type WeedChangeStatus =
  | 'increasing'
  | 'stable'
  | 'decreasing'
  | 'not_comparable'
  | 'unknown';

export type WeedComparisonScope =
  | 'same_observation_point'
  | 'field_photo_history'
  | 'none';

export type WeedSpatialHotspot = {
  observationPointId: string;
  direction: string | null;
  centroid: [number, number] | null;
  areaGeometry: unknown | null;
  coverPercent: number | null;
  density: WeedDensity;
  severity: 'low' | 'medium' | 'high' | 'unknown';
  presence: WeedPresence;
  changeStatus: WeedChangeStatus;
  coverDeltaPercent: number | null;
  observedAt: string | null;
};

export type WeedIntelligenceSignal = {
  fieldId: string;

  status:
    | 'clear'
    | 'watch'
    | 'confirmed'
    | 'uncertain';

  presence: WeedPresence;

  severity:
    | 'low'
    | 'medium'
    | 'high'
    | 'unknown';

  confidencePercent: number;

  coverPercent: number | null;
  cropCoverPercent: number | null;
  bareSoilPercent: number | null;

  density: WeedDensity;
  distribution: WeedDistribution;

  candidate: string | null;

  trend:
    | 'improving'
    | 'stable'
    | 'worsening'
    | 'unknown';

  changeStatus: WeedChangeStatus;
  comparisonScope: WeedComparisonScope;

  previousCoverPercent: number | null;
  coverDeltaPercent: number | null;

  previousObservedAt: string | null;
  daysSincePrevious: number | null;

  historyCount: number;

  nextPhotoDueAt: string | null;

  headline: string;
  summary: string;

  evidence: string[];

  needsMoreEvidence: boolean;

  observedAt: string | null;

  observationPointId: string | null;

  direction: string | null;

  centroid: [number, number] | null;

  areaGeometry: unknown | null;

  spatialHotspots: WeedSpatialHotspot[];

  activeHotspotCount: number;

  increasingHotspotCount: number;

  sourceEventId: string | null;

  sourceModel: string;
};

function text(
  value: unknown,
  max = 300,
) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function finite(
  value: unknown,
) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return null;
  }

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}

function percent(
  value: unknown,
) {
  const number =
    finite(value);

  return number === null
    ? null
    : Math.max(
        0,
        Math.min(
          100,
          number,
        ),
      );
}

function confidence(
  value: unknown,
) {
  return Math.round(
    percent(value) ?? 0,
  );
}

function asPresence(
  value: unknown,
): WeedPresence {
  return [
    'not_visible',
    'possible',
    'visible',
    'uncertain',
  ].includes(String(value))
    ? (String(value) as WeedPresence)
    : 'uncertain';
}

function asDensity(
  value: unknown,
): WeedDensity {
  return [
    'low',
    'medium',
    'high',
    'unknown',
  ].includes(String(value))
    ? (String(value) as WeedDensity)
    : 'unknown';
}

function asDistribution(
  value: unknown,
): WeedDistribution {
  return [
    'scattered',
    'patchy',
    'dense_patch',
    'uniform',
    'row_interference',
    'unknown',
  ].includes(String(value))
    ? (String(value) as WeedDistribution)
    : 'unknown';
}

function asTrend(
  value: unknown,
): WeedIntelligenceSignal['trend'] {
  return [
    'improving',
    'stable',
    'worsening',
    'unknown',
  ].includes(String(value))
    ? (
        String(value) as
          WeedIntelligenceSignal['trend']
      )
    : 'unknown';
}

function asSeverity(
  value: unknown,
): WeedIntelligenceSignal['severity'] {
  return [
    'low',
    'medium',
    'high',
    'unknown',
  ].includes(String(value))
    ? (
        String(value) as
          WeedIntelligenceSignal['severity']
      )
    : 'unknown';
}

function eventTime(
  event: FieldDataEvent,
) {
  const raw =
    event.observedAt ||
    event.createdAt;

  const parsed =
    Date.parse(raw || '');

  return Number.isFinite(parsed)
    ? parsed
    : 0;
}

function dateDiffDays(
  later: string | null,
  earlier: string | null,
) {
  const laterMs =
    Date.parse(later || '');

  const earlierMs =
    Date.parse(earlier || '');

  if (
    !Number.isFinite(laterMs) ||
    !Number.isFinite(earlierMs) ||
    laterMs < earlierMs
  ) {
    return null;
  }

  return Math.max(
    0,
    Math.round(
      (laterMs - earlierMs) /
        86400000,
    ),
  );
}

function isoDatePlusDays(
  value: string | null,
  days: number,
) {
  const parsed =
    Date.parse(value || '');

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(
    parsed +
      Math.max(0, days) *
        86400000,
  ).toISOString();
}

function pointGeometry(
  centroid:
    | [number, number]
    | null,
) {
  if (!centroid) {
    return null;
  }

  return {
    type: 'Point',
    coordinates: centroid,
  };
}

function spatialPayload(
  payload: Record<string, any>,
) {
  const lng =
    finite(
      payload.centroidLng,
    );

  const lat =
    finite(
      payload.centroidLat,
    );

  const centroid:
    | [number, number]
    | null =
    lng !== null &&
    lat !== null
      ? [lng, lat]
      : null;

  return {
    observationPointId:
      text(
        payload.observationPointId,
        80,
      ) || null,

    direction:
      text(
        payload.direction,
        120,
      ) || null,

    centroid,

    areaGeometry:
      payload.areaGeometry ??
      pointGeometry(centroid),
  };
}

function weedEvents(
  snapshot:
    | FieldDataBackboneSnapshot
    | null
    | undefined,
) {
  return (
    snapshot?.events ?? []
  )
    .filter(
      (event) =>
        event.mutation !==
          'deleted' &&
        event.domain ===
          'observation' &&
        event.eventType ===
          'weed_visual_analysis',
    )
    .sort(
      (a, b) =>
        eventTime(b) -
        eventTime(a),
    );
}

function previousForPoint(
  events: FieldDataEvent[],
  currentIndex: number,
  pointId: string,
) {
  return (
    events
      .slice(
        currentIndex + 1,
      )
      .find(
        (event) =>
          text(
            event.payload
              ?.observationPointId,
            80,
          ) === pointId,
      ) ?? null
  );
}

function comparablePreviousEvent(
  events: FieldDataEvent[],
  latest: FieldDataEvent,
) {
  const latestPointId =
    text(
      latest.payload
        ?.observationPointId,
      80,
    );

  if (latestPointId) {
    const samePoint =
      events
        .slice(1)
        .find(
          (event) =>
            text(
              event.payload
                ?.observationPointId,
              80,
            ) === latestPointId,
        );

    if (samePoint) {
      return {
        event: samePoint,
        scope:
          'same_observation_point' as const,
      };
    }
  }

  const previous =
    events[1] ?? null;

  if (!previous) {
    return {
      event: null,
      scope:
        'none' as const,
    };
  }

  return {
    event: previous,
    scope:
      'field_photo_history' as const,
  };
}

function deriveChange(
  input: {
    latestCover:
      | number
      | null;

    previousCover:
      | number
      | null;

    comparisonScope:
      WeedComparisonScope;

    reportedTrend:
      WeedIntelligenceSignal['trend'];
  },
) {
  const {
    latestCover,
    previousCover,
    comparisonScope,
    reportedTrend,
  } = input;

  if (
    comparisonScope ===
      'same_observation_point' &&
    latestCover !== null &&
    previousCover !== null
  ) {
    const delta =
      Number(
        (
          latestCover -
          previousCover
        ).toFixed(1),
      );

    if (delta >= 5) {
      return {
        changeStatus:
          'increasing' as const,

        trend:
          'worsening' as const,

        coverDeltaPercent:
          delta,
      };
    }

    if (delta <= -5) {
      return {
        changeStatus:
          'decreasing' as const,

        trend:
          'improving' as const,

        coverDeltaPercent:
          delta,
      };
    }

    return {
      changeStatus:
        'stable' as const,

      trend:
        'stable' as const,

      coverDeltaPercent:
        delta,
    };
  }

  if (
    comparisonScope ===
    'field_photo_history'
  ) {
    return {
      changeStatus:
        'not_comparable' as const,

      trend:
        reportedTrend,

      coverDeltaPercent:
        null,
    };
  }

  return {
    changeStatus:
      reportedTrend ===
      'worsening'
        ? ('increasing' as const)
        : reportedTrend ===
            'improving'
          ? ('decreasing' as const)
          : reportedTrend ===
              'stable'
            ? ('stable' as const)
            : ('unknown' as const),

    trend:
      reportedTrend,

    coverDeltaPercent:
      null,
  };
}

function buildSpatialHotspots(
  events: FieldDataEvent[],
) {
  const seen =
    new Set<string>();

  const hotspots:
    WeedSpatialHotspot[] = [];

  events.forEach(
    (
      event,
      index,
    ) => {
      const payload =
        event.payload ?? {};

      const pointId =
        text(
          payload.observationPointId,
          80,
        );

      if (
        !pointId ||
        seen.has(pointId)
      ) {
        return;
      }

      seen.add(pointId);

      const presence =
        asPresence(
          payload.weedPresence,
        );

      if (
        presence !== 'visible' &&
        presence !== 'possible'
      ) {
        return;
      }

      const previous =
        previousForPoint(
          events,
          index,
          pointId,
        );

      const latestCover =
        percent(
          payload.weedCoverPercent,
        );

      const previousCover =
        previous
          ? percent(
              previous.payload
                ?.weedCoverPercent,
            )
          : null;

      const derived =
        deriveChange({
          latestCover,

          previousCover,

          comparisonScope:
            previous
              ? 'same_observation_point'
              : 'none',

          reportedTrend:
            asTrend(
              payload.trend,
            ),
        });

      const spatial =
        spatialPayload(
          payload,
        );

      hotspots.push({
        observationPointId:
          pointId,

        direction:
          spatial.direction,

        centroid:
          spatial.centroid,

        areaGeometry:
          spatial.areaGeometry,

        coverPercent:
          latestCover,

        density:
          asDensity(
            payload.weedDensity,
          ),

        severity:
          asSeverity(
            payload.severity,
          ),

        presence,

        changeStatus:
          derived.changeStatus,

        coverDeltaPercent:
          derived.coverDeltaPercent,

        observedAt:
          event.observedAt ||
          event.createdAt ||
          null,
      });
    },
  );

  const densityScore:
    Record<
      WeedDensity,
      number
    > = {
    low: 1,
    medium: 2,
    high: 3,
    unknown: 0,
  };

  return hotspots.sort(
    (a, b) => {
      const aIncreasing =
        a.changeStatus ===
        'increasing'
          ? 1000
          : 0;

      const bIncreasing =
        b.changeStatus ===
        'increasing'
          ? 1000
          : 0;

      const aCover =
        a.coverPercent ?? 0;

      const bCover =
        b.coverPercent ?? 0;

      return (
        bIncreasing +
        bCover * 10 +
        densityScore[b.density] -
        (
          aIncreasing +
          aCover * 10 +
          densityScore[a.density]
        )
      );
    },
  );
}

function followUpDays(
  input: {
    status:
      WeedIntelligenceSignal['status'];

    severity:
      WeedIntelligenceSignal['severity'];

    trend:
      WeedIntelligenceSignal['trend'];

    needsMoreEvidence:
      boolean;
  },
) {
  if (
    input.severity ===
      'high' ||
    input.trend ===
      'worsening'
  ) {
    return 2;
  }

  if (
    input.needsMoreEvidence ||
    input.status ===
      'uncertain'
  ) {
    return 3;
  }

  if (
    input.status ===
    'confirmed'
  ) {
    return 4;
  }

  if (
    input.status ===
    'watch'
  ) {
    return 5;
  }

  return 7;
}

async function resolveObservationPointSpatialContext(
  fieldId: string,
  observationPointId:
    | string
    | null,
) {
  if (!observationPointId) {
    return null;
  }

  try {
    const {
      data,
      error,
    } = await supabase
      .from(
        'field_observation_points',
      )
      .select(
        [
          'id',
          'field_id',
          'direction',
          'centroid_lat',
          'centroid_lng',
          'area_geometry',
        ].join(', '),
      )
      .eq(
        'id',
        observationPointId,
      )
      .eq(
        'field_id',
        fieldId,
      )
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!data) {
      return null;
    }

    const lat =
      finite(
        data.centroid_lat,
      );

    const lng =
      finite(
        data.centroid_lng,
      );

    return {
      observationPointId:
        String(data.id),

      direction:
        text(
          data.direction,
          120,
        ) || null,

      centroidLat:
        lat,

      centroidLng:
        lng,

      areaGeometry:
        data.area_geometry ??
        null,
    };
  } catch (error) {
    console.warn(
      'Yabancı ot takip noktası konumu alınamadı:',
      error,
    );

    return null;
  }
}

export function buildWeedIntelligenceSignal(
  fieldIdInput:
    | string
    | number
    | null
    | undefined,

  snapshot:
    | FieldDataBackboneSnapshot
    | null
    | undefined,
): WeedIntelligenceSignal | null {
  const fieldId =
    text(
      fieldIdInput,
      80,
    );

  if (!fieldId) {
    return null;
  }

  const events =
    weedEvents(snapshot);

  const latest =
    events[0];

  if (!latest) {
    return null;
  }

  const payload =
    latest.payload ?? {};

  const presence =
    asPresence(
      payload.weedPresence,
    );

  const issueType =
    text(
      payload.issueType,
      40,
    );

  const resolvedPresence =
    presence ===
      'uncertain' &&
    issueType === 'weed'
      ? 'possible'
      : presence;

  const confidencePercent =
    confidence(
      payload.confidence,
    );

  const evidence =
    Array.isArray(
      payload.weedEvidence,
    )
      ? payload.weedEvidence
          .map(
            (item) =>
              text(
                item,
                240,
              ),
          )
          .filter(Boolean)
          .slice(0, 6)
      : [];

  const status:
    WeedIntelligenceSignal['status'] =
    resolvedPresence ===
    'visible'
      ? 'confirmed'
      : resolvedPresence ===
          'possible'
        ? 'watch'
        : resolvedPresence ===
            'not_visible'
          ? 'clear'
          : 'uncertain';

  const observedAt =
    latest.observedAt ||
    latest.createdAt ||
    null;

  const latestCover =
    percent(
      payload.weedCoverPercent,
    );

  const comparison =
    comparablePreviousEvent(
      events,
      latest,
    );

  const previousObservedAt =
    comparison.event
      ?.observedAt ||
    comparison.event
      ?.createdAt ||
    null;

  const previousCover =
    comparison.event
      ? percent(
          comparison.event
            .payload
            ?.weedCoverPercent,
        )
      : null;

  const reportedTrend =
    asTrend(
      payload.trend,
    );

  const derived =
    deriveChange({
      latestCover,
      previousCover,
      comparisonScope:
        comparison.scope,
      reportedTrend,
    });

  const severity =
    asSeverity(
      payload.severity,
    );

  const needsMoreEvidence =
    Boolean(
      payload.needsMoreEvidence,
    );

  const dueDays =
    followUpDays({
      status,
      severity,
      trend:
        derived.trend,
      needsMoreEvidence,
    });

  const spatial =
    spatialPayload(
      payload,
    );

  const spatialHotspots =
    buildSpatialHotspots(
      events,
    );

  return {
    fieldId,

    status,

    presence:
      resolvedPresence,

    severity,

    confidencePercent,

    coverPercent:
      latestCover,

    cropCoverPercent:
      percent(
        payload.cropCoverPercent,
      ),

    bareSoilPercent:
      percent(
        payload.bareSoilPercent,
      ),

    density:
      asDensity(
        payload.weedDensity,
      ),

    distribution:
      asDistribution(
        payload.weedDistribution,
      ),

    candidate:
      text(
        payload.weedCandidate ||
          payload.possibleIssue,
        160,
      ) || null,

    trend:
      derived.trend,

    changeStatus:
      derived.changeStatus,

    comparisonScope:
      comparison.scope,

    previousCoverPercent:
      previousCover,

    coverDeltaPercent:
      derived.coverDeltaPercent,

    previousObservedAt,

    daysSincePrevious:
      dateDiffDays(
        observedAt,
        previousObservedAt,
      ),

    historyCount:
      events.length,

    nextPhotoDueAt:
      status === 'clear'
        ? null
        : isoDatePlusDays(
            observedAt,
            dueDays,
          ),

    headline:
      text(
        payload.headline,
        180,
      ) ||
      'Yabancı ot görsel ön değerlendirmesi',

    summary:
      text(
        payload.comparison,
        300,
      ) ||
      text(
        payload.summary,
        300,
      ) ||
      'Son saha fotoğrafındaki yabancı ot sinyali değerlendirildi.',

    evidence,

    needsMoreEvidence,

    observedAt,

    observationPointId:
      spatial.observationPointId,

    direction:
      spatial.direction,

    centroid:
      spatial.centroid,

    areaGeometry:
      spatial.areaGeometry,

    spatialHotspots,

    activeHotspotCount:
      spatialHotspots.length,

    increasingHotspotCount:
      spatialHotspots.filter(
        (item) =>
          item.changeStatus ===
          'increasing',
      ).length,

    sourceEventId:
      latest.id || null,

    sourceModel:
      text(
        payload.model,
        100,
      ) ||
      'pusula-visual-weed-v3',
  };
}

export async function publishWeedVisualObservation(
  input: {
    fieldId:
      | string
      | number;

    analysis:
      AiFieldAnalysis;

    activityId?:
      | string
      | null;

    observationPointId?:
      | string
      | null;
  },
) {
  const fieldId =
    text(
      input.fieldId,
      80,
    );

  if (!fieldId) {
    return null;
  }

  const analysis =
    input.analysis;

  const presence =
    asPresence(
      analysis.weedPresence,
    );

  const hasStructuredWeedResult =
    analysis.issueType ===
      'weed' ||
    presence ===
      'visible' ||
    presence ===
      'possible' ||
    presence ===
      'not_visible';

  if (!hasStructuredWeedResult) {
    return null;
  }

  const observationPointId =
    text(
      input.observationPointId,
      80,
    ) || null;

  const spatial =
    await resolveObservationPointSpatialContext(
      fieldId,
      observationPointId,
    );

  const event =
    await publishUserFieldDataEvent({
      fieldId,

      domain:
        'observation',

      eventType:
        'weed_visual_analysis',

      source:
        'pusula-ai-weed-observation',

      changedFields: [
        'weed_observation_history',
        'weed_intelligence_context',
        'weed_change_detection',
        'weed_spatial_context',
        'plant_protection_context',
        'field_memory',
      ],

      observedAt:
        analysis.analyzedAt ||
        new Date()
          .toISOString(),

      payload: {
        schemaVersion:
          'weed-visual-observation-v3',

        issueType:
          analysis.issueType ??
          null,

        status:
          analysis.status,

        severity:
          analysis.severity ??
          'unknown',

        headline:
          analysis.headline,

        possibleIssue:
          analysis.possibleIssue,

        confidence:
          analysis.confidence,

        trend:
          analysis.trend ??
          'unknown',

        comparison:
          analysis.comparison ??
          null,

        needsMoreEvidence:
          Boolean(
            analysis.needsMoreEvidence,
          ),

        weedPresence:
          presence,

        weedCoverPercent:
          analysis.weedCoverPercent ??
          null,

        cropCoverPercent:
          analysis.cropCoverPercent ??
          null,

        bareSoilPercent:
          analysis.bareSoilPercent ??
          null,

        weedDensity:
          analysis.weedDensity ??
          'unknown',

        weedDistribution:
          analysis.weedDistribution ??
          'unknown',

        weedCandidate:
          analysis.weedCandidate ??
          null,

        weedEvidence:
          Array.isArray(
            analysis.weedEvidence,
          )
            ? analysis.weedEvidence.slice(
                0,
                6,
              )
            : [],

        activityId:
          text(
            input.activityId,
            80,
          ) || null,

        observationPointId,

        direction:
          spatial?.direction ??
          null,

        centroidLat:
          spatial?.centroidLat ??
          null,

        centroidLng:
          spatial?.centroidLng ??
          null,

        areaGeometry:
          spatial?.areaGeometry ??
          null,

        spatialSource:
          spatial
            ? 'field_observation_point'
            : 'none',

        provider:
          analysis.provider ??
          null,

        model:
          analysis.model ??
          null,

        source:
          analysis.source ??
          'gemini_image_analysis',
      },
    });

  if (
    typeof window !==
    'undefined'
  ) {
    window.dispatchEvent(
      new CustomEvent(
        'tp:field-context-updated',
        {
          detail: {
            fieldId,

            domain:
              'observation',

            eventType:
              'weed_visual_analysis',

            source:
              'pusula-ai-weed-observation',
          },
        },
      ),
    );
  }

  return event;
}