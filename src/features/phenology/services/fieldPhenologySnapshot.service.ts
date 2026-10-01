import {
  loadFieldPhenologyContext,
} from './fieldPhenologyContext.service';

import {
  fetchPhenologyClimateShift,
} from './phenologyClimateShift.service';

import {
  fetchFieldNdviTimeSeries,
} from '../../satellite/services/ndviTimeSeries.service';

import {
  isRecentSatelliteObservation,
} from '../../satellite/services/buildHomeSatelliteDecision';

import {
  buildFieldPhenology,
} from './buildFieldPhenology';

import {
  estimateNasaHarvestCropStage,
  fusePhenologyWithNasaHarvest,
  type NasaHarvestCropStageResult,
} from './nasaHarvestCropStage.service';

import {
  fetchPcsePhenologyEvidence,
  fusePhenologyWithPcse,
  type PcsePhenologyEvidence,
} from './pcsePhenologyEvidence.service';

import {
  fetchLatestFieldGrowthObservation,
  fieldObservationSignature,
  fusePhenologyWithFieldObservation,
  type FieldGrowthObservationEvidence,
} from './fieldGrowthObservationAuthority.service';

import type {
  PhenologyResult,
} from '../types/phenology';

const CACHE_PREFIX =
  'tp_field_phenology_snapshot_v5';

const LEGACY_CACHE_PREFIXES = [
  'tp_field_phenology_snapshot_v4',
  'tp_field_phenology_snapshot_v3',
  'tp_field_phenology_snapshot_v2',
  'tp_field_phenology_snapshot_v1',
];

const DEFAULT_CACHE_MS =
  6 * 60 * 60 * 1000;

type SourceStatus =
  | 'ready'
  | 'skipped'
  | 'error';

export type FieldPhenologySnapshot = {
  fieldId: string;

  generatedAt: string;

  phenology:
    PhenologyResult;

  ndvi: {
    status:
      SourceStatus;

    direction:
      | 'rising'
      | 'stable'
      | 'falling'
      | 'unknown';

    quality:
      | 'usable'
      | 'insufficient';

    latestAverage:
      | number
      | null;

    observationCount:
      number;

    spanDays:
      | number
      | null;

    message:
      | string
      | null;
  };

  climateShift: {
    status:
      SourceStatus;

    shiftDays:
      number;

    anomalyC:
      | number
      | null;

    confidence:
      | 'low'
      | 'medium';

    baselineYearsUsed:
      number;

    message:
      | string
      | null;
  };

  context: {
    status:
      SourceStatus;

    cropName:
      | string
      | null;

    cropCycle:
      | 'annual'
      | 'perennial'
      | 'unknown';

    actualPlantingDate:
      | string
      | null;

    actualHarvestDate:
      | string
      | null;

    plantingYear:
      | number
      | null;

    bearing:
      | boolean
      | null;

    hasSeasonRecord:
      boolean;

    message:
      | string
      | null;
  };

  nasaHarvest: {
    status:
      SourceStatus;

    stageCode:
      | NasaHarvestCropStageResult['stageCode'];

    stageLabel:
      string | null;

    confidence:
      PhenologyResult['confidence'];

    observationCount:
      number;

    dailyPointCount:
      number;

    spanDays:
      number | null;

    peakDate:
      string | null;

    daysSincePeak:
      number | null;

    latestDate:
      string | null;

    message:
      string | null;
  };

  pcseWofost: {
    status:
      | 'ready'
      | 'partial'
      | 'missing'
      | 'blocked'
      | 'running'
      | 'skipped'
      | 'error';

    stage:
      string | null;

    canonicalStage:
      PhenologyResult['stage'] | null;

    dvs:
      number | null;

    model:
      string | null;

    completedAt:
      string | null;

    missingInputs:
      string[];

    message:
      string | null;
  };

  fieldObservation: {
    status: 'ready' | 'missing' | 'error';
    evidence: FieldGrowthObservationEvidence | null;
    message: string | null;
  };

  evidence:
    string[];

  warnings:
    string[];

  cache: {
    hit:
      boolean;

    ttlMs:
      number;
  };
};

type CacheEnvelope = {
  expiresAt:
    number;

  value:
    FieldPhenologySnapshot;
};

const memoryCache =
  new Map<
    string,
    CacheEnvelope
  >();

function fieldKey(
  field: any,
) {
  if (
    field?.id ===
      null ||
    field?.id ===
      undefined
  ) {
    throw new Error(
      'Fenoloji özeti için tarla kimliği bulunamadı.',
    );
  }

  return String(
    field.id,
  );
}

function cacheKey(
  fieldId: string,
) {
  return `${CACHE_PREFIX}:${fieldId}`;
}

function nowMs() {
  return Date.now();
}

function readCache(
  key: string,
): FieldPhenologySnapshot | null {
  const now =
    nowMs();

  const memory =
    memoryCache.get(
      key,
    );

  if (
    memory &&
    memory.expiresAt >
      now
  ) {
    return {
      ...memory.value,

      cache: {
        ...memory.value
          .cache,

        hit: true,
      },
    };
  }

  if (
    memory &&
    memory.expiresAt <=
      now
  ) {
    memoryCache.delete(
      key,
    );
  }

  if (
    typeof window ===
    'undefined'
  ) {
    return null;
  }

  try {
    const raw =
      window.localStorage.getItem(
        key,
      );

    if (!raw) {
      return null;
    }

    const parsed =
      JSON.parse(
        raw,
      ) as CacheEnvelope;

    if (
      !parsed?.value ||
      !Number.isFinite(
        parsed?.expiresAt,
      ) ||
      parsed.expiresAt <=
        now
    ) {
      window.localStorage.removeItem(
        key,
      );

      return null;
    }

    memoryCache.set(
      key,
      parsed,
    );

    return {
      ...parsed.value,

      cache: {
        ...parsed.value
          .cache,

        hit: true,
      },
    };
  } catch {
    return null;
  }
}

function saveCache(
  key: string,
  value:
    FieldPhenologySnapshot,
  ttlMs: number,
) {
  const envelope:
    CacheEnvelope = {
    expiresAt:
      nowMs() +
      ttlMs,

    value,
  };

  memoryCache.set(
    key,
    envelope,
  );

  if (
    typeof window ===
    'undefined'
  ) {
    return;
  }

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify(
        envelope,
      ),
    );
  } catch {
    // Cache yazılamazsa ana akışı bozmayız.
  }
}

function errorMessage(
  error: unknown,
) {
  return error instanceof
    Error
    ? error.message
    : 'Bilinmeyen hata';
}

export function clearFieldPhenologySnapshotCache(
  fieldId?:
    | string
    | number,
) {
  if (
    fieldId ===
    undefined
  ) {
    memoryCache.clear();

    if (
      typeof window !==
      'undefined'
    ) {
      const keys:
        string[] = [];

      for (
        let i = 0;
        i <
        window.localStorage
          .length;
        i++
      ) {
        const key =
          window.localStorage.key(
            i,
          );

        if (
          key?.startsWith(
            `${CACHE_PREFIX}:`,
          ) ||
          LEGACY_CACHE_PREFIXES.some(
            (prefix) =>
              key?.startsWith(
                `${prefix}:`,
              ),
          )
        ) {
          keys.push(
            key,
          );
        }
      }

      for (
        const key
        of keys
      ) {
        window.localStorage.removeItem(
          key,
        );
      }
    }

    return;
  }

  const key =
    cacheKey(
      String(
        fieldId,
      ),
    );

  memoryCache.delete(
    key,
  );

  if (
    typeof window !==
    'undefined'
  ) {
    window.localStorage.removeItem(
      key,
    );

    for (
      const prefix
      of LEGACY_CACHE_PREFIXES
    ) {
      window.localStorage.removeItem(
        `${prefix}:${String(fieldId)}`,
      );
    }
  }
}

function cachedFieldObservationMatches(
  cached: FieldPhenologySnapshot,
  current: FieldGrowthObservationEvidence | null,
) {
  return fieldObservationSignature(cached.fieldObservation?.evidence ?? null) ===
    fieldObservationSignature(current);
}

export async function getFieldPhenologySnapshot(
  field: any,
  options?: {
    forceRefresh?:
      boolean;

    cacheMs?:
      number;

    currentDate?:
      | string
      | Date
      | null;
  },
): Promise<FieldPhenologySnapshot> {
  const fieldId =
    fieldKey(
      field,
    );

  const key =
    cacheKey(
      fieldId,
    );

  const ttlMs =
    Math.max(
      60_000,
      Number(
        options?.cacheMs ??
        DEFAULT_CACHE_MS,
      ),
    );

  let fieldObservation: FieldGrowthObservationEvidence | null = null;
  let fieldObservationError: string | null = null;

  try {
    fieldObservation = await fetchLatestFieldGrowthObservation(
      fieldId,
      options?.currentDate ?? null,
    );
  } catch (error) {
    fieldObservationError = errorMessage(error);
  }

  if (
    !options
      ?.forceRefresh
  ) {
    const cached =
      readCache(
        key,
      );

    if (
      cached &&
      (
        fieldObservationError !== null ||
        cachedFieldObservationMatches(cached, fieldObservation)
      )
    ) {
      return cached;
    }
  }

  /*
    Bağlam, iklim, NDVI ve PCSE birbirinden bağımsızdır.
    Saha gözlemi ayrıca her çağrıda hızlıca kontrol edilir; böylece eski 6 saatlik
    cache yeni bir gerçek saha gözleminin önüne geçemez.
  */
  const contextPromise =
    loadFieldPhenologyContext(
      field,
    );

  const climatePromise =
    fetchPhenologyClimateShift(
      field,
      {
        currentDate:
          options
            ?.currentDate ??
          null,
      },
    );

  const pcsePromise =
    String(
      field?.cropCycle ??
      field?.crop_cycle ??
      '',
    )
      .trim()
      .toLocaleLowerCase('tr-TR') === 'perennial'
      ? Promise.resolve(null)
      : fetchPcsePhenologyEvidence(fieldId);

  const ndviPromise =
    field?.parcelGeometry ||
    field?.parcel_geometry
      ? fetchFieldNdviTimeSeries(
          field.parcelGeometry ??
          field.parcel_geometry,
          {
            /*
             * NASA Harvest A–E modeli sezon eğrisini ve olası geçmiş tepeyi
             * görmek zorunda. 90 gün birçok yıllık üründe yetersiz kalıyordu.
             */
            daysBack:
              180,
          },
        )
      : Promise.resolve(
          null,
        );

  const [
    contextSettled,
    climateSettled,
    ndviSettled,
    pcseSettled,
  ] =
    await Promise.allSettled(
      [
        contextPromise,
        climatePromise,
        ndviPromise,
        pcsePromise,
      ],
    );

  const context =
    contextSettled.status ===
    'fulfilled'
      ? contextSettled.value
      : null;

  const climate =
    climateSettled.status ===
    'fulfilled'
      ? climateSettled.value
      : null;

  const ndvi =
    ndviSettled.status ===
    'fulfilled'
      ? ndviSettled.value
      : null;

  const pcse: PcsePhenologyEvidence | null =
    pcseSettled.status === 'fulfilled'
      ? pcseSettled.value
      : null;

  const latestObservationDate = ndvi?.points?.at(-1)?.date ?? null;
  const referenceDate = options?.currentDate ? new Date(options.currentDate) : new Date();
  const observationFresh = isRecentSatelliteObservation(latestObservationDate, referenceDate);

  const ndviTrend =
    ndvi?.trend && observationFresh
      ? {
          direction:
            ndvi.trend
              .quality ===
              'usable'
              ? ndvi.trend
                  .direction
              : 'unknown',

          quality:
            ndvi.trend
              .quality,

          latestAverage:
            ndvi.trend
              .latestAverage ??
            null,

          changeFromPrevious:
            ndvi.trend
              .changeFromPrevious ??
            null,

          changeFromFirst:
            ndvi.trend
              .changeFromFirst ??
            null,
        }
      : null;

  /*
    Climate shift yalnızca status=ready ise uygulanır.
    Hata veya yetersiz veri → 0 gün.
  */
  const climateShiftDays =
    climate?.status ===
      'ready'
      ? climate.shiftDays
      : 0;

  const phenologyField = {
    ...field,

    cropName:
      context?.cropName ??
      field?.cropName ??
      field?.crop ??
      null,

    cropCycle:
      context?.cropCycle ??
      field?.cropCycle ??
      field?.crop_cycle ??
      null,

    plantingYear:
      context?.plantingYear ??
      field?.plantingYear ??
      field?.planting_year ??
      null,

    bearing:
      context?.bearing ??
      (
        typeof field?.bearing ===
        'boolean'
          ? field.bearing
          : null
      ),

    /*
      Çok yıllık dikim yılı burada kullanılmaz.
      Context servisi yalnızca gerçek sezon tarihini verir.
    */
    sowingDate:
      context?.actualPlantingDate ??
      field?.sowingDate ??
      field?.sowing_date ??
      field?.plantingDate ??
      field?.planting_date ??
      null,

    actualHarvestDate:
      context?.actualHarvestDate ??
      field?.actualHarvestDate ??
      field?.actual_harvest_date ??
      null,

    phenologySeasonShiftDays:
      climateShiftDays,
  };

  const basePhenology =
    buildFieldPhenology(
      phenologyField,
      ndviTrend,
      options
        ?.currentDate ??
      null,
    );

  const cropCycle =
    String(
      phenologyField?.cropCycle ??
      phenologyField?.crop_cycle ??
      '',
    )
      .trim()
      .toLocaleLowerCase('tr-TR');

  const nasaReferenceDate =
    options?.currentDate
      ? new Date(options.currentDate)
      : new Date();

  const nasaHarvest =
    cropCycle !== 'perennial' &&
    Array.isArray(ndvi?.points) &&
    ndvi.points.length
      ? estimateNasaHarvestCropStage(
          ndvi.points,
          nasaReferenceDate,
        )
      : null;

  /*
   * NASA Harvest yalnız gözlenen NDVI sezon eğrisini temsil eder.
   * Takvim/PCSE/WOFOST gibi kaynaklarla tek başına yarışmaz; fusion katmanı
   * uyuşmayı güçlendirir, belirgin uyuşmazlıkta güveni düşürür.
   */
  const nasaFusedPhenology =
    fusePhenologyWithNasaHarvest(
      basePhenology,
      nasaHarvest,
    ) ??
    basePhenology;

  /*
   * Kanonik fenoloji sonucu:
   * production authority = TarlaPusula Fenoloji Motoru
   * supporting = NASA Harvest + PCSE/WOFOST
   * saha gözlemi = güncelse mevcut evrede son doğrulama otoritesi.
   * PCSE tek başına evreyi değiştiremez. Saha gözlemi de doğrulanmış hasat
   * kaydı olmadan sezonu post_harvest durumuna kapatamaz.
   */
  const pcseFusedPhenology =
    fusePhenologyWithPcse(
      nasaFusedPhenology,
      pcse,
    ) ??
    nasaFusedPhenology;

  const phenology =
    fusePhenologyWithFieldObservation(
      pcseFusedPhenology,
      fieldObservation,
    ) ??
    pcseFusedPhenology;

  const evidence = [
    ...phenology.basis,
  ];

  const warnings = [
    ...phenology.warnings,
  ];

  if (
    context?.cropCycle ===
      'perennial' &&
    context?.bearing ===
      false
  ) {
    evidence.push(
      'Üretim durumu: çok yıllık ürün henüz ürün vermiyor (bearing=false).',
    );

    warnings.push(
      'Takvimde meyve/olgunlaşma/hasat dönemi görünse bile ürün vermeyen ağaç için meyve veya hasat önerisi üretilmemeli.',
    );
  }

  if (
    contextSettled.status ===
    'rejected'
  ) {
    warnings.push(
      `Sezon geçmişi okunamadı: ${errorMessage(
        contextSettled.reason,
      )}`,
    );
  }

  if (
    climateSettled.status ===
    'rejected'
  ) {
    warnings.push(
      `ERA5 fenoloji düzeltmesi alınamadı: ${errorMessage(
        climateSettled.reason,
      )}`,
    );
  }

  if (
    ndviSettled.status ===
    'rejected'
  ) {
    warnings.push(
      `NDVI trendi alınamadı: ${errorMessage(
        ndviSettled.reason,
      )}`,
    );
  }

  if (
    pcseSettled.status ===
    'rejected'
  ) {
    warnings.push(
      `PCSE/WOFOST destek kanıtı alınamadı: ${errorMessage(
        pcseSettled.reason,
      )}`,
    );
  }

  if (fieldObservationError) {
    warnings.push(
      `Saha gelişim gözlemi okunamadı: ${fieldObservationError}`,
    );
  }

  if (
    climate?.status ===
      'ready'
  ) {
    evidence.push(
      `ERA5-Land fenoloji takvim düzeltmesi: ${
        climate.shiftDays >
        0
          ? '+'
          : ''
      }${climate.shiftDays} gün`,
    );

    if (
      climate.anomalyC !==
      null
    ) {
      evidence.push(
        `Mevsim sıcaklık sapması: ${
          climate.anomalyC >
          0
            ? '+'
            : ''
        }${climate.anomalyC.toFixed(
          1,
        )} °C`,
      );
    }
  }

  const snapshot:
    FieldPhenologySnapshot = {
    fieldId,

    generatedAt:
      new Date()
        .toISOString(),

    phenology,

    ndvi: {
      status:
        ndviSettled.status ===
        'rejected'
          ? 'error'
          : ndvi
            ? 'ready'
            : 'skipped',

      direction:
        ndviTrend
          ?.direction ??
        'unknown',

      quality:
        ndviTrend
          ?.quality ??
        'insufficient',

      latestAverage:
        ndviTrend
          ?.latestAverage ??
        null,

      observationCount:
        ndvi?.trend
          ?.observationCount ??
        0,

      spanDays:
        ndvi?.trend
          ?.spanDays ??
        null,

      message:
        ndviSettled.status ===
        'rejected'
          ? errorMessage(
              ndviSettled.reason,
            )
          : latestObservationDate && !observationFresh
            ? 'Son uydu görüntüsü eski; güncel bitki gelişimi yorumunda kullanılmadı.'
          : ndvi?.message ??
            null,
    },

    climateShift: {
      status:
        climateSettled.status ===
        'rejected'
          ? 'error'
          : climate
            ? 'ready'
            : 'skipped',

      shiftDays:
        climateShiftDays,

      anomalyC:
        climate
          ?.anomalyC ??
        null,

      confidence:
        climate
          ?.confidence ??
        'low',

      baselineYearsUsed:
        climate
          ?.baselineYearsUsed ??
        0,

      message:
        climateSettled.status ===
        'rejected'
          ? errorMessage(
              climateSettled.reason,
            )
          : climate
              ?.message ??
            climate
              ?.caution ??
            null,
    },

    context: {
      status:
        contextSettled.status ===
        'rejected'
          ? 'error'
          : context
            ? 'ready'
            : 'skipped',

      cropName:
        context?.cropName ??
        field?.cropName ??
        field?.crop ??
        null,

      cropCycle:
        context?.cropCycle ??
        (
          field?.cropCycle ===
            'annual' ||
          field?.crop_cycle ===
            'annual'
            ? 'annual'
            : field?.cropCycle ===
                'perennial' ||
              field?.crop_cycle ===
                'perennial'
              ? 'perennial'
              : 'unknown'
        ),

      actualPlantingDate:
        context
          ?.actualPlantingDate ??
        null,

      actualHarvestDate:
        context
          ?.actualHarvestDate ??
        null,

      plantingYear:
        context
          ?.plantingYear ??
        (
          Number.isFinite(
            Number(
              field?.plantingYear ??
              field?.planting_year,
            ),
          )
            ? Number(
                field?.plantingYear ??
                field?.planting_year,
              )
            : null
        ),

      bearing:
        context
          ?.bearing ??
        (
          typeof field?.bearing ===
          'boolean'
            ? field.bearing
            : null
        ),

      hasSeasonRecord:
        context
          ?.hasSeasonRecord ??
        false,

      message:
        contextSettled.status ===
        'rejected'
          ? errorMessage(
              contextSettled.reason,
            )
          : null,
    },

    nasaHarvest: {
      status:
        cropCycle === 'perennial'
          ? 'skipped'
          : ndviSettled.status === 'rejected'
            ? 'error'
            : nasaHarvest
              ? nasaHarvest.status === 'usable'
                ? 'ready'
                : 'skipped'
              : 'skipped',

      stageCode:
        nasaHarvest?.stageCode ??
        null,

      stageLabel:
        nasaHarvest?.stageLabel ??
        null,

      confidence:
        nasaHarvest?.confidence ??
        'low',

      observationCount:
        nasaHarvest?.observationCount ??
        0,

      dailyPointCount:
        nasaHarvest?.dailyPointCount ??
        0,

      spanDays:
        nasaHarvest?.spanDays ??
        null,

      peakDate:
        nasaHarvest?.peakDate ??
        null,

      daysSincePeak:
        nasaHarvest?.daysSincePeak ??
        null,

      latestDate:
        nasaHarvest?.latestDate ??
        null,

      message:
        cropCycle === 'perennial'
          ? 'Çok yıllık ürünlerde NASA Harvest genel A–E yıllık ürün modeli kullanılmadı.'
          : ndviSettled.status === 'rejected'
            ? errorMessage(ndviSettled.reason)
            : nasaHarvest?.status === 'usable'
              ? `${nasaHarvest.stageCode} · ${nasaHarvest.stageLabel}`
              : nasaHarvest?.warnings?.[0] ??
                'NASA Harvest evresi için yeterli güncel NDVI sezon eğrisi yok.',
    },

    pcseWofost: {
      status:
        pcse?.status ??
        (pcseSettled.status === 'rejected'
          ? 'error'
          : cropCycle === 'perennial'
            ? 'skipped'
            : 'missing'),

      stage:
        pcse?.rawStage ??
        null,

      canonicalStage:
        pcse?.canonicalStage ??
        null,

      dvs:
        pcse?.dvs ??
        null,

      model:
        pcse?.model ??
        null,

      completedAt:
        pcse?.completedAt ??
        null,

      missingInputs:
        pcse?.missingInputs ??
        [],

      message:
        pcse?.message ??
        (pcseSettled.status === 'rejected'
          ? errorMessage(pcseSettled.reason)
          : cropCycle === 'perennial'
            ? 'PCSE/WOFOST yıllık ürün pilotu çok yıllık üründe kullanılmıyor.'
            : null),
    },

    fieldObservation: {
      status: fieldObservationError
        ? 'error'
        : fieldObservation
          ? 'ready'
          : 'missing',
      evidence: fieldObservation,
      message: fieldObservationError ?? (
        fieldObservation?.authoritative
          ? `${fieldObservation.observedOn} tarihli saha gözlemi mevcut evrede öncelikli kanıt.`
          : fieldObservation?.status === 'context'
            ? 'Saha gözlemi geçmiş bağlam olarak tutuluyor; mevcut evreyi tek başına değiştirmiyor.'
            : fieldObservation?.status === 'stale'
              ? 'Saha gözlemi eski; güncel evreyi değiştirmiyor.'
              : fieldObservation?.status === 'future'
                ? 'Saha gözleminin tarihi gelecekte görünüyor.'
                : fieldObservation?.status === 'unsupported'
                  ? 'Saha gözlemindeki evre ortak fenoloji sözlüğüyle eşleştirilemedi.'
                  : null
      ),
    },

    evidence,
    warnings,

    cache: {
      hit:
        false,

      ttlMs,
    },
  };

  saveCache(
    key,
    snapshot,
    ttlMs,
  );

  return snapshot;
}
