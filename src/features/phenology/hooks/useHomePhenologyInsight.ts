import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useFieldNdviTimeSeries,
} from '../../satellite/hooks/useFieldNdviTimeSeries';

import {
  useFieldPhenology,
} from './useFieldPhenology';

import {
  loadFieldPhenologyContext,
  type FieldPhenologyContext,
} from '../services/fieldPhenologyContext.service';

import {
  fetchPhenologyClimateShift,
} from '../services/phenologyClimateShift.service';

import type {
  PhenologyClimateShiftResult,
} from '../types/phenologyClimateShift';

import {
  estimateNasaHarvestCropStage,
  fusePhenologyWithNasaHarvest,
} from '../services/nasaHarvestCropStage.service';

import {
  fetchPcsePhenologyEvidence,
  fusePhenologyWithPcse,
  type PcsePhenologyEvidence,
  type PcsePhenologyEvidenceStatus,
} from '../services/pcsePhenologyEvidence.service';

import { supabase } from '../../../supabaseClient';

import {
  fetchLatestFieldGrowthObservation,
  fusePhenologyWithFieldObservation,
  type FieldGrowthObservationEvidence,
} from '../services/fieldGrowthObservationAuthority.service';

import {
  clearFieldPhenologySnapshotCache,
} from '../services/fieldPhenologySnapshot.service';

type ContextState = {
  status:
    | 'idle'
    | 'loading'
    | 'ready'
    | 'error';

  data:
    | FieldPhenologyContext
    | null;

  message:
    | string
    | null;
};

type ClimateShiftState = {
  status:
    | 'idle'
    | 'loading'
    | 'ready'
    | 'error';

  data:
    | PhenologyClimateShiftResult
    | null;

  message:
    | string
    | null;
};

type PcseState = {
  status: PcsePhenologyEvidenceStatus;
  data: PcsePhenologyEvidence | null;
  message: string | null;
};

type FieldObservationState = {
  status: 'idle' | 'loading' | 'ready' | 'missing' | 'error';
  data: FieldGrowthObservationEvidence | null;
  message: string | null;
};

export function useHomePhenologyInsight(
  field:
    | any
    | null
    | undefined,
) {
  const {
    stateByField,
    load,
  } =
    useFieldNdviTimeSeries();

  const requestedNdviFieldRef =
    useRef<string>('');

  const requestedContextRef =
    useRef<string>('');

  const requestedClimateRef =
    useRef<string>('');

  const requestedPcseRef =
    useRef<string>('');

  const requestedFieldObservationRef =
    useRef<string>('');

  const [
    contextState,
    setContextState,
  ] =
    useState<ContextState>({
      status: 'idle',
      data: null,
      message: null,
    });

  const [
    climateShiftState,
    setClimateShiftState,
  ] =
    useState<ClimateShiftState>({
      status: 'idle',
      data: null,
      message: null,
    });

  const [
    pcseState,
    setPcseState,
  ] =
    useState<PcseState>({
      status: 'idle',
      data: null,
      message: null,
    });

  const [
    fieldObservationRevision,
    setFieldObservationRevision,
  ] = useState(0);

  const [
    fieldObservationState,
    setFieldObservationState,
  ] = useState<FieldObservationState>({
    status: 'idle',
    data: null,
    message: null,
  });

  const fieldKey =
    field?.id != null
      ? String(field.id)
      : '';

  const seriesState =
    fieldKey
      ? stateByField[
          fieldKey
        ]
      : undefined;

  const rawTrend =
    seriesState?.data
      ?.trend ??
    null;

  const ndviTrend =
    useMemo(
      () => {
        if (!rawTrend) {
          return null;
        }

        return {
          direction:
            rawTrend.quality ===
            'usable'
              ? rawTrend.direction
              : 'unknown',

          quality:
            rawTrend.quality,

          latestAverage:
            rawTrend.latestAverage ??
            null,

          changeFromPrevious:
            rawTrend.changeFromPrevious ??
            null,

          changeFromFirst:
            rawTrend.changeFromFirst ??
            null,
        };
      },
      [
        rawTrend?.direction,
        rawTrend?.quality,
        rawTrend?.latestAverage,
        rawTrend?.changeFromPrevious,
        rawTrend?.changeFromFirst,
      ],
    );

  const climateShiftDays =
    climateShiftState.data
      ?.status === 'ready'
      ? climateShiftState.data
          .shiftDays
      : 0;

  /*
    Fenoloji motoruna verilen normalize tarla:
    - çok yıllık dikim yılı sezon başlangıcı olmaz
    - gerçek hasat yalnızca context'ten gelir
    - ERA5-Land iklim düzeltmesi ayrı bir shift alanı olarak verilir
  */
  const phenologyField =
    useMemo(
      () => {
        if (!field) {
          return null;
        }

        const context =
          contextState.data;

        return {
          ...field,

          cropName:
            context?.cropName ??
            field.cropName ??
            field.crop ??
            null,

          cropCycle:
            context?.cropCycle ??
            field.cropCycle ??
            field.crop_cycle ??
            null,

          actualHarvestDate:
            context?.actualHarvestDate ??
            field.actualHarvestDate ??
            field.actual_harvest_date ??
            null,

          sowingDate:
            context?.actualPlantingDate ??
            field.sowingDate ??
            field.sowing_date ??
            field.plantingDate ??
            field.planting_date ??
            null,

          phenologySeasonShiftDays:
            climateShiftDays,
        };
      },
      [
        field,
        contextState.data,
        climateShiftDays,
      ],
    );

  const basePhenology =
    useFieldPhenology(
      phenologyField,
      ndviTrend,
    );

  const timeSeriesPoints =
    seriesState?.data?.points ??
    [];

  const nasaHarvestStage =
    useMemo(
      () => {
        const cropCycle =
          String(
            contextState.data
              ?.cropCycle ??
            phenologyField
              ?.cropCycle ??
            phenologyField
              ?.crop_cycle ??
            '',
          )
            .trim()
            .toLocaleLowerCase(
              'tr-TR',
            );

        if (
          cropCycle ===
            'perennial' ||
          !timeSeriesPoints.length
        ) {
          return null;
        }

        return estimateNasaHarvestCropStage(
          timeSeriesPoints,
        );
      },
      [
        contextState.data
          ?.cropCycle,
        phenologyField
          ?.cropCycle,
        phenologyField
          ?.crop_cycle,
        timeSeriesPoints,
      ],
    );

  const nasaFusedPhenology =
    useMemo(
      () =>
        fusePhenologyWithNasaHarvest(
          basePhenology,
          nasaHarvestStage,
        ) ??
        basePhenology,
      [
        basePhenology,
        nasaHarvestStage,
      ],
    );

  const pcseFusedPhenology =
    useMemo(
      () =>
        fusePhenologyWithPcse(
          nasaFusedPhenology,
          pcseState.data,
        ) ??
        nasaFusedPhenology,
      [
        nasaFusedPhenology,
        pcseState.data,
      ],
    );

  const activeFieldObservation =
    fieldObservationState.data?.fieldId === fieldKey
      ? fieldObservationState.data
      : null;

  const phenology =
    useMemo(
      () =>
        fusePhenologyWithFieldObservation(
          pcseFusedPhenology,
          activeFieldObservation,
        ) ??
        pcseFusedPhenology,
      [
        pcseFusedPhenology,
        activeFieldObservation,
      ],
    );

  useEffect(
    () => {
      if (!fieldKey) {
        requestedContextRef.current =
          '';

        setContextState({
          status: 'idle',
          data: null,
          message: null,
        });

        return;
      }

      if (
        requestedContextRef.current ===
        fieldKey
      ) {
        return;
      }

      requestedContextRef.current =
        fieldKey;

      setContextState({
        status: 'loading',
        data: null,
        message: null,
      });

      let cancelled =
        false;

      void loadFieldPhenologyContext(
        field,
      )
        .then(
          (data) => {
            if (cancelled) {
              return;
            }

            setContextState({
              status: 'ready',
              data,
              message:
                data.needsCropCalendar
                  ? 'Ürün evresi kaynak tabanlı ürün takvimiyle hesaplanacak.'
                  : null,
            });
          },
        )
        .catch(
          (error) => {
            if (cancelled) {
              return;
            }

            if (
              requestedContextRef.current ===
              fieldKey
            ) {
              requestedContextRef.current =
                '';
            }

            setContextState({
              status: 'error',
              data: null,
              message:
                error instanceof
                Error
                  ? error.message
                  : 'Fenoloji bağlamı alınamadı.',
            });
          },
        );

      return () => {
        cancelled =
          true;
      };
    },
    [
      fieldKey,
      field,
    ],
  );

  useEffect(
    () => {
      if (
        !fieldKey
      ) {
        requestedClimateRef.current =
          '';

        setClimateShiftState({
          status: 'idle',
          data: null,
          message: null,
        });

        return;
      }

      if (
        requestedClimateRef.current ===
        fieldKey
      ) {
        return;
      }

      requestedClimateRef.current =
        fieldKey;

      setClimateShiftState({
        status: 'loading',
        data: null,
        message: null,
      });

      let cancelled =
        false;

      void fetchPhenologyClimateShift(
        field,
      )
        .then(
          (data) => {
            if (cancelled) {
              return;
            }

            setClimateShiftState({
              status: 'ready',
              data,
              message:
                data.message ??
                data.caution,
            });
          },
        )
        .catch(
          (error) => {
            if (cancelled) {
              return;
            }

            if (
              requestedClimateRef.current ===
              fieldKey
            ) {
              requestedClimateRef.current =
                '';
            }

            /*
              İklim düzeltmesi opsiyoneldir.
              Hata olursa fenoloji motoru baz takvimle çalışmaya devam eder.
            */
            setClimateShiftState({
              status: 'error',
              data: null,
              message:
                error instanceof
                Error
                  ? error.message
                  : 'Fenoloji iklim düzeltmesi alınamadı.',
            });
          },
        );

      return () => {
        cancelled =
          true;
      };
    },
    [
      fieldKey,
      field,
    ],
  );

  useEffect(
    () => {
      if (!fieldKey || field?.demo) {
        requestedFieldObservationRef.current = '';
        setFieldObservationState({
          status: 'idle',
          data: null,
          message: null,
        });
        return;
      }

      const requestKey = `${fieldKey}:${fieldObservationRevision}`;
      if (requestedFieldObservationRef.current === requestKey) return;
      requestedFieldObservationRef.current = requestKey;

      let cancelled = false;
      setFieldObservationState((current) => ({
        status: 'loading',
        data: current.data?.fieldId === fieldKey ? current.data : null,
        message: null,
      }));

      void fetchLatestFieldGrowthObservation(fieldKey)
        .then((data) => {
          if (cancelled) return;
          setFieldObservationState({
            status: data ? 'ready' : 'missing',
            data,
            message: data
              ? data.authoritative
                ? `${data.observedOn} tarihli saha gelişim gözlemi güncel evre için öncelikli kanıt.`
                : data.status === 'context'
                  ? 'Saha gelişim gözlemi geçmiş bağlam olarak kullanılıyor.'
                  : data.status === 'stale'
                    ? 'Saha gelişim gözlemi eski; mevcut evreyi değiştirmiyor.'
                    : data.status === 'future'
                      ? 'Saha gelişim gözleminin tarihi gelecekte görünüyor.'
                      : 'Saha gelişim evresi ortak evre sözlüğüyle eşleştirilemedi.'
              : null,
          });
        })
        .catch((error) => {
          if (cancelled) return;
          if (requestedFieldObservationRef.current === requestKey) {
            requestedFieldObservationRef.current = '';
          }
          setFieldObservationState({
            status: 'error',
            data: null,
            message:
              error instanceof Error
                ? error.message
                : 'Saha gelişim gözlemi okunamadı.',
          });
        });

      return () => {
        cancelled = true;
      };
    },
    [
      fieldKey,
      field?.demo,
      fieldObservationRevision,
    ],
  );

  useEffect(
    () => {
      if (!fieldKey || field?.demo || typeof window === 'undefined') return;

      const refreshFieldObservation = () => {
        requestedFieldObservationRef.current = '';
        clearFieldPhenologySnapshotCache(fieldKey);
        setFieldObservationRevision((current) => current + 1);
      };

      const onFieldContextUpdated = (event: Event) => {
        const detail = (event as CustomEvent)?.detail ?? {};
        if (String(detail?.fieldId ?? '') !== fieldKey) return;
        const changedFields = Array.isArray(detail?.changedFields)
          ? detail.changedFields.map((item: unknown) => String(item))
          : [];
        if (
          changedFields.length > 0 &&
          !changedFields.some((item: string) =>
            [
              'field_observation_history',
              'phenology_context',
              'crop_stage',
              'nasa_harvest_validation',
            ].includes(item),
          )
        ) {
          return;
        }
        refreshFieldObservation();
      };

      const onFocus = () => refreshFieldObservation();
      const onVisibility = () => {
        if (document.visibilityState === 'visible') refreshFieldObservation();
      };

      window.addEventListener('tp:field-context-updated', onFieldContextUpdated as EventListener);
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onVisibility);

      const channel = supabase
        .channel(`tp-phenology-observation-${fieldKey}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'field_growth_observations',
            filter: `field_id=eq.${fieldKey}`,
          },
          refreshFieldObservation,
        )
        .subscribe();

      return () => {
        window.removeEventListener('tp:field-context-updated', onFieldContextUpdated as EventListener);
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onVisibility);
        void supabase.removeChannel(channel);
      };
    },
    [
      fieldKey,
      field?.demo,
    ],
  );

  useEffect(
    () => {
      if (!fieldKey || field?.demo) {
        requestedPcseRef.current =
          '';

        setPcseState({
          status: 'idle',
          data: null,
          message: null,
        });

        return;
      }

      const cropCycle =
        String(
          contextState.data
            ?.cropCycle ??
          phenologyField
            ?.cropCycle ??
          phenologyField
            ?.crop_cycle ??
          '',
        )
          .trim()
          .toLocaleLowerCase(
            'tr-TR',
          );

      if (cropCycle === 'perennial') {
        requestedPcseRef.current =
          `${fieldKey}:perennial`;

        setPcseState({
          status: 'skipped',
          data: null,
          message:
            'PCSE/WOFOST yıllık ürün pilotu çok yıllık üründe kullanılmıyor.',
        });

        return;
      }

      /*
        Context yüklenirken yanlış ürün döngüsüyle erken PCSE isteği atmayalım.
      */
      if (
        contextState.status ===
          'loading'
      ) {
        return;
      }

      const requestKey =
        `${fieldKey}:${cropCycle || 'unknown'}`;

      if (
        requestedPcseRef.current ===
        requestKey
      ) {
        return;
      }

      requestedPcseRef.current =
        requestKey;

      setPcseState({
        status: 'loading',
        data: null,
        message: null,
      });

      let cancelled =
        false;

      void fetchPcsePhenologyEvidence(
        fieldKey,
      )
        .then(
          (data) => {
            if (cancelled) {
              return;
            }

            setPcseState({
              status: data.status,
              data,
              message: data.message,
            });
          },
        )
        .catch(
          (error) => {
            if (cancelled) {
              return;
            }

            if (
              requestedPcseRef.current ===
              requestKey
            ) {
              requestedPcseRef.current =
                '';
            }

            /*
              PCSE supporting pilot olduğu için hata ana fenoloji motorunu düşürmez.
            */
            setPcseState({
              status: 'error',
              data: null,
              message:
                error instanceof Error
                  ? error.message
                  : 'PCSE/WOFOST fenoloji kanıtı alınamadı.',
            });
          },
        );

      return () => {
        cancelled =
          true;
      };
    },
    [
      fieldKey,
      field?.demo,
      contextState.status,
      contextState.data
        ?.cropCycle,
      phenologyField
        ?.cropCycle,
      phenologyField
        ?.crop_cycle,
    ],
  );

  const parcelGeometry =
    field?.parcelGeometry ??
    field?.parcel_geometry ??
    null;

  const parcelGeometrySignature =
    useMemo(
      () => {
        if (!parcelGeometry) return '';
        try {
          return JSON.stringify(parcelGeometry);
        } catch {
          return String(parcelGeometry);
        }
      },
      [parcelGeometry],
    );

  useEffect(
    () => {
      if (
        !field?.id ||
        !parcelGeometry
      ) {
        requestedNdviFieldRef.current =
          '';

        return;
      }

      const key =
        `${String(field.id)}:${parcelGeometrySignature}`;

      if (
        requestedNdviFieldRef.current ===
        key
      ) {
        return;
      }

      requestedNdviFieldRef.current =
        key;

      void load(
        {
          ...field,
          parcelGeometry,
        },
        {
          daysBack: 180,
        },
      ).catch(
        (error) => {
          if (
            requestedNdviFieldRef.current ===
            key
          ) {
            requestedNdviFieldRef.current =
              '';
          }

          console.warn(
            '[TarlaPusula] NDVI zaman serisi hazırlanamadı:',
            error,
          );
        },
      );

      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [
      fieldKey,
      parcelGeometrySignature,
    ],
  );

  const trendUsable =
    rawTrend?.quality ===
      'usable' &&
    rawTrend?.direction !==
      'unknown';

  return {
    phenology,

    phenologyContext:
      contextState.data,

    phenologyContextStatus:
      contextState.status,

    phenologyContextMessage:
      contextState.message,

    climateShift:
      climateShiftState.data,

    climateShiftStatus:
      climateShiftState.status,

    climateShiftMessage:
      climateShiftState.message,

    climateShiftDays,

    ndviTrend,
    trendUsable,

    nasaHarvestStage,

    pcseEvidence:
      pcseState.data,

    pcseEvidenceStatus:
      pcseState.status,

    pcseEvidenceMessage:
      pcseState.message,

    fieldObservation:
      activeFieldObservation,

    fieldObservationStatus:
      fieldObservationState.status,

    fieldObservationMessage:
      fieldObservationState.message,

    timeSeriesPoints,

    timeSeriesLatestDate:
      timeSeriesPoints.length
        ? timeSeriesPoints[
            timeSeriesPoints.length -
              1
          ]?.date ??
          null
        : null,

    timeSeriesSource:
      seriesState?.data
        ?.source ??
      null,

    timeSeriesStatus:
      seriesState?.status ??
      'idle',

    timeSeriesMessage:
      seriesState?.message ??
      seriesState?.data
        ?.message ??
      null,

    timeSeriesObservationCount:
      rawTrend?.observationCount ??
      0,

    timeSeriesSpanDays:
      rawTrend?.spanDays ??
      null,

    phenologyDataStatus:
      phenology?.dataStatus ??
      'insufficient_data',

    hasUsablePhenology:
      Boolean(
        phenology &&
        phenology.stage !==
          'unknown' &&
        phenology.dataStatus ===
          'usable',
      ),

    needsCropCalendar:
      contextState.data
        ?.needsCropCalendar ??
      true,
  };
}
