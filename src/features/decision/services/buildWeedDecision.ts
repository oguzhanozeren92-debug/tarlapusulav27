import type {
  WeedIntelligenceSignal,
} from '../../weed/services/weedIntelligence.service';

import type {
  HomeDecisionEvent,
} from '../types/homeDecision';

function confidenceLabel(
  value: number,
): HomeDecisionEvent['confidence'] {
  if (value >= 80) {
    return 'strong';
  }

  if (value >= 55) {
    return 'medium';
  }

  return 'preliminary';
}

function densityLabel(
  value:
    WeedIntelligenceSignal['density'],
) {
  if (value === 'high') {
    return 'yüksek yoğunluk';
  }

  if (value === 'medium') {
    return 'orta yoğunluk';
  }

  if (value === 'low') {
    return 'düşük yoğunluk';
  }

  return '';
}

function distributionLabel(
  value:
    WeedIntelligenceSignal['distribution'],
) {
  if (value === 'patchy') {
    return 'kümeli dağılım';
  }

  if (
    value ===
    'dense_patch'
  ) {
    return 'yoğun odak';
  }

  if (value === 'uniform') {
    return 'yaygın/homojen dağılım';
  }

  if (
    value ===
    'row_interference'
  ) {
    return 'ürün sırasına karışan dağılım';
  }

  if (
    value ===
    'scattered'
  ) {
    return 'dağınık dağılım';
  }

  return '';
}

function formatObservedAt(
  value: string | null,
) {
  if (!value) {
    return '';
  }

  const parsed =
    new Date(value);

  if (
    !Number.isFinite(
      parsed.getTime(),
    )
  ) {
    return '';
  }

  return new Intl.DateTimeFormat(
    'tr-TR',
    {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    },
  ).format(parsed);
}

function changeText(
  signal:
    WeedIntelligenceSignal,
) {
  if (
    signal.comparisonScope ===
      'same_observation_point' &&
    signal.coverDeltaPercent !==
      null &&
    signal.previousCoverPercent !==
      null &&
    signal.coverPercent !==
      null
  ) {
    const delta =
      signal.coverDeltaPercent;

    const direction =
      delta > 0
        ? 'arttı'
        : delta < 0
          ? 'azaldı'
          : 'değişmedi';

    const absolute =
      Math.abs(delta)
        .toFixed(1)
        .replace(
          '.',
          ',',
        );

    return (
      `Aynı takip noktasında kaplama ` +
      `%${Math.round(signal.previousCoverPercent)} → ` +
      `%${Math.round(signal.coverPercent)}; ` +
      `${absolute} puan ${direction}.`
    );
  }

  if (
    signal.comparisonScope ===
      'field_photo_history' &&
    signal.historyCount > 1
  ) {
    return (
      'Önceki saha fotoğrafı var ancak aynı nokta ' +
      'doğrulanmadığı için kaplama yüzdeleri doğrudan kıyaslanmadı.'
    );
  }

  if (
    signal.trend ===
    'worsening'
  ) {
    return 'Görsel değerlendirme artış eğilimi bildiriyor.';
  }

  if (
    signal.trend ===
    'improving'
  ) {
    return 'Görsel değerlendirme gerileme eğilimi bildiriyor.';
  }

  if (
    signal.trend ===
    'stable'
  ) {
    return 'Görsel değerlendirme belirgin değişim göstermiyor.';
  }

  return '';
}

function spatialText(
  signal:
    WeedIntelligenceSignal,
) {
  if (
    signal.increasingHotspotCount >
    1
  ) {
    return (
      `${signal.increasingHotspotCount} takip noktasında ` +
      'yabancı ot baskısı artıyor.'
    );
  }

  if (
    signal.increasingHotspotCount ===
    1
  ) {
    const hotspot =
      signal.spatialHotspots.find(
        (item) =>
          item.changeStatus ===
          'increasing',
      );

    const area =
      hotspot?.direction ||
      signal.direction;

    return area
      ? `${area} odağında yabancı ot baskısı artıyor.`
      : 'Bir takip noktasında yabancı ot baskısı artıyor.';
  }

  if (
    signal.activeHotspotCount >
    1
  ) {
    return (
      `${signal.activeHotspotCount} ayrı takip noktasında ` +
      'yabancı ot bulgusu var.'
    );
  }

  if (
    signal.activeHotspotCount ===
      1 &&
    signal.direction
  ) {
    return (
      `Bulgular ${signal.direction} takip alanında yoğunlaşıyor.`
    );
  }

  return '';
}

export function buildWeedDecision(
  fieldIdInput:
    | string
    | number
    | null
    | undefined,

  signal:
    | WeedIntelligenceSignal
    | null
    | undefined,
): HomeDecisionEvent | null {
  const fieldId =
    String(
      fieldIdInput ?? '',
    ).trim();

  if (
    !fieldId ||
    !signal
  ) {
    return null;
  }

  if (
    signal.status ===
    'clear'
  ) {
    return null;
  }

  const urgent =
    signal.severity ===
      'high' ||
    signal.changeStatus ===
      'increasing' ||
    signal.increasingHotspotCount >
      0;

  const confirmed =
    signal.status ===
    'confirmed';

  const possible =
    signal.status ===
    'watch';

  const cover =
    signal.coverPercent ===
    null
      ? ''
      : (
          `Görsel kaplama tahmini yaklaşık ` +
          `%${Math.round(signal.coverPercent)}.`
        );

  const density =
    densityLabel(
      signal.density,
    );

  const distribution =
    distributionLabel(
      signal.distribution,
    );

  const observedDate =
    formatObservedAt(
      signal.observedAt,
    );

  const previousDate =
    formatObservedAt(
      signal.previousObservedAt,
    );

  const nextPhotoDate =
    formatObservedAt(
      signal.nextPhotoDueAt,
    );

  const candidate =
    signal.candidate &&
    signal.candidate !==
      'Belirsiz'
      ? signal.candidate
      : null;

  const change =
    changeText(signal);

  const spatial =
    spatialText(signal);

  const primaryHotspot =
    signal.spatialHotspots.find(
      (item) =>
        item.changeStatus ===
        'increasing',
    ) ||
    signal.spatialHotspots[0] ||
    null;

  const mapDirection =
    primaryHotspot?.direction ||
    signal.direction;

  const mapGeometry =
    primaryHotspot?.areaGeometry ||
    signal.areaGeometry;

  const mapPointId =
    primaryHotspot
      ?.observationPointId ||
    signal.observationPointId;

  const mapCentroid =
    primaryHotspot?.centroid ||
    signal.centroid;

  const detailParts = [
    confirmed
      ? (
          'Saha fotoğrafında istenmeyen bitki/yabancı ot ' +
          'bulgusu görünür durumda.'
        )
      : possible
        ? (
            'Saha fotoğrafında yabancı ot olasılığı var; ' +
            'kesinleştirmek için saha doğrulaması gerekli.'
          )
        : (
            'Görsel kanıt yabancı ot kararı için henüz yeterli değil.'
          ),

    cover,

    [
      density,
      distribution,
    ]
      .filter(Boolean)
      .join(' · '),

    change,

    spatial,

    nextPhotoDate
      ? (
          `Tekrar fotoğraf hedefi: ${nextPhotoDate}.`
        )
      : '',
  ].filter(Boolean);

  const title =
    signal.increasingHotspotCount >
    1
      ? (
          `${signal.increasingHotspotCount} Noktada Yabancı Ot Artıyor`
        )
      : signal.changeStatus ===
            'increasing' ||
          signal.increasingHotspotCount ===
            1
        ? candidate
          ? (
              `Yabancı Ot Artıyor · ${candidate}`
            )
          : (
              'Yabancı Ot Kaplaması Artıyor'
            )
        : confirmed
          ? candidate
            ? (
                `Yabancı Ot Bulgusu · ${candidate}`
              )
            : (
                'Yabancı Ot Bulgusu Görüldü'
              )
          : possible
            ? (
                'Yabancı Ot Şüphesini Sahada Doğrula'
              )
            : (
                'Yabancı Ot İçin Daha İyi Görsel Gerekli'
              );

  const period =
    (
      signal.observedAt ||
      new Date()
        .toISOString()
    ).slice(
      0,
      10,
    );

  const priority =
    urgent
      ? 112
      : confirmed
        ? 96
        : 82;

  const evidence = [
    observedDate
      ? (
          `Görsel gözlem tarihi: ${observedDate}.`
        )
      : '',

    previousDate
      ? (
          `Karşılaştırılan önceki gözlem: ${previousDate}.`
        )
      : '',

    candidate
      ? (
          `Görsel tür adayı: ${candidate}.`
        )
      : '',

    cover,

    change,

    spatial,

    density
      ? (
          `Yoğunluk: ${density}.`
        )
      : '',

    distribution
      ? (
          `Dağılım: ${distribution}.`
        )
      : '',

    ...signal.evidence,

    (
      'Tür/kaplama çıktıları görsel ön değerlendirmedir; ' +
      'uydu tek başına yabancı ot türü teşhis etmez.'
    ),
  ]
    .filter(Boolean)
    .slice(
      0,
      10,
    );

  return {
    signal: {
      status:
        signal.status ===
        'uncertain'
          ? 'needs-data'
          : 'ready',

      observedAt:
        signal.observedAt,
    },

    id:
      `weed:${fieldId}:` +
      `${signal.sourceEventId || period}`,

    group:
      'weed-intelligence',

    source:
      'weed-intelligence',

    priority,

    severity:
      urgent
        ? 'danger'
        : confirmed
          ? 'warning'
          : 'info',

    target:
      'map_vegetation',

    channels:
      urgent ||
      confirmed
        ? [
            'today',
            'notification',
            'pusula',
          ]
        : [
            'today',
            'pusula',
          ],

    kind:
      'check',

    label:
      'YABANCI OT',

    title,

    detail:
      `${detailParts.join(' ')} ` +
      'Kimyasal ürün veya doz önerilmedi; önce alanı ve türü doğrula.',

    evidence,

    confidence:
      confidenceLabel(
        signal.confidencePercent,
      ),

    sourceModel:
      `weed-intelligence:${signal.sourceModel}`,

    task: {
      taskKey:
        `weed-field-check:${fieldId}:${period}`,

      actionTarget:
        'field-photo',

      rewardPoints:
        0,

      rewardRuleKey:
        null,

      metadata: {
        source:
          'weed_intelligence',

        sourceLayer:
          'vegetation',

        weedPresence:
          signal.presence,

        weedCandidate:
          candidate,

        weedCoverPercent:
          signal.coverPercent,

        previousWeedCoverPercent:
          signal.previousCoverPercent,

        weedCoverDeltaPercent:
          signal.coverDeltaPercent,

        weedChangeStatus:
          signal.changeStatus,

        comparisonScope:
          signal.comparisonScope,

        weedDensity:
          signal.density,

        weedDistribution:
          signal.distribution,

        observationPointId:
          mapPointId,

        direction:
          mapDirection,

        areaGeometry:
          mapGeometry,

        centroid:
          mapCentroid,

        importantArea:
          mapDirection ||
          mapGeometry
            ? {
                area:
                  mapDirection,

                geometry:
                  mapGeometry,
              }
            : undefined,

        activeWeedHotspotCount:
          signal.activeHotspotCount,

        increasingWeedHotspotCount:
          signal.increasingHotspotCount,

        nextPhotoDueAt:
          signal.nextPhotoDueAt,

        openPhoto:
          true,

        requestPhoto:
          true,
      },
    },

    today: {
      tone:
        urgent
          ? 'red'
          : confirmed
            ? 'amber'
            : 'neutral',

      visual:
        'spraying',

      iconKey:
        'leaf-gold',

      iconClass:
        'leaf',
    },

    notification:
      urgent ||
      confirmed
        ? {
            iconKey:
              'leaf',

            iconTone:
              'gold',

            dotTone:
              urgent
                ? 'danger'
                : 'warning',
          }
        : undefined,
  };
}