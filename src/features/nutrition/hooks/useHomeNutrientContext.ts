import { useEffect, useState } from 'react';
import { listSoilAnalyses, type SoilAnalysisRecord } from '../../../lib/soilAnalysisService';
import {
  fetchSoilGridsProfile,
  type SoilGridsProfile,
} from '../../../services/soilGridsService';
import { fetchNutritionIntelligence } from '../services/nutritionIntelligence.service';
import { loadFieldScientificSignals } from '../../../services/fieldScientificSignals.service';
import { probePysticsRuntime } from '../services/pysticsRuntime.service';
import {
  buildLocalNutrientContext,
  type LocalNutrientContextResult,
} from '../services/localNutrientContext.service';
import {
  buildServerSoilIntelligence,
  buildSoilIntelligence,
  type SoilIntelligenceResult,
} from '../services/soilIntelligence.service';

type SoilGridsState = 'idle' | 'loading' | 'ready' | 'error';

type NutrientContextState = {
  fieldId: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
  latestAnalysis: SoilAnalysisRecord | null;
  soilGridsStatus: SoilGridsState;
  soilGridsProfile: SoilGridsProfile | null;
  soilIntelligence: SoilIntelligenceResult | null;
  serverAuthority: boolean;
  serverError: string | null;
  localContext: LocalNutrientContextResult | null;
};

const EMPTY: NutrientContextState = {
  fieldId: '',
  status: 'idle',
  latestAnalysis: null,
  soilGridsStatus: 'idle',
  soilGridsProfile: null,
  soilIntelligence: null,
  serverAuthority: false,
  serverError: null,
  localContext: null,
};

function fieldIdOf(fieldOrId: any) {
  if (fieldOrId == null) return '';
  if (typeof fieldOrId === 'string' || typeof fieldOrId === 'number') {
    return String(fieldOrId).trim();
  }
  return String(fieldOrId?.id ?? '').trim();
}

function fieldCoordinate(field: any, primary: string, fallback: string) {
  if (!field || typeof field !== 'object') return null;
  const value = Number(field?.[primary] ?? field?.[fallback]);
  return Number.isFinite(value) ? value : null;
}

function shouldRefresh(changedFields: string[] | undefined) {
  if (!changedFields?.length) return true;
  const watched = new Set([
    'soil_analysis',
    'soil_context',
    'nutrition_context',
    'fertilization_history',
    'soil_nutrition_decision',
    'phenology_context',
    'crop_context',
    'field_memory',
    'biophysical_context',
    'satellite_biophysics',
    'scientific_signals',
  ]);
  return changedFields.some((key) => watched.has(String(key)));
}

export function useHomeNutrientContext(fieldOrId: any) {
  const fieldId = fieldIdOf(fieldOrId);
  const latitude = fieldCoordinate(fieldOrId, 'parcelCentroidLat', 'latitude');
  const longitude = fieldCoordinate(fieldOrId, 'parcelCentroidLng', 'longitude');
  const crop = String(
    fieldOrId?.crop ?? fieldOrId?.cropName ?? fieldOrId?.product ?? '',
  ).trim();
  const [state, setState] = useState<NutrientContextState>(EMPTY);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!fieldId) return;
    const onContextChange = (event: Event) => {
      const detail = (
        event as CustomEvent<{ fieldId?: string; changedFields?: string[] }>
      ).detail;
      if (
        String(detail?.fieldId ?? '') === fieldId &&
        shouldRefresh(detail?.changedFields)
      ) {
        setRevision((current) => current + 1);
      }
    };
    window.addEventListener('tp:field-context-updated', onContextChange);
    return () => window.removeEventListener('tp:field-context-updated', onContextChange);
  }, [fieldId]);

  useEffect(() => {
    if (!fieldId || fieldId.startsWith('demo')) return;

    let cancelled = false;
    const controller = new AbortController();
    const hasCoordinates = latitude != null && longitude != null;

    setState({
      fieldId,
      status: 'loading',
      latestAnalysis: null,
      soilGridsStatus: 'idle',
      soilGridsProfile: null,
      soilIntelligence: null,
      serverAuthority: false,
      serverError: null,
      localContext: null,
    });

    void (async () => {
      const [serverResult, analysisResult, scientificResult, pysticsResult] = await Promise.allSettled([
        fetchNutritionIntelligence(fieldId),
        listSoilAnalyses(fieldId),
        loadFieldScientificSignals(fieldId),
        probePysticsRuntime(controller.signal),
      ]);
      if (cancelled) return;

      const analyses = analysisResult.status === 'fulfilled' ? analysisResult.value : [];
      const latestAnalysis = analyses[0] ?? null;

      const scientificSignals =
        scientificResult.status === 'fulfilled' ? scientificResult.value : null;
      const pysticsRuntime =
        pysticsResult.status === 'fulfilled' ? pysticsResult.value : null;
      if (scientificResult.status === 'rejected') {
        console.warn(
          '[TarlaPusula] Yerel besin bağlamı için SL2P/biyofizik sinyalleri okunamadı:',
          scientificResult.reason,
        );
      }

      if (serverResult.status === 'fulfilled') {
        const soilIntelligence = buildServerSoilIntelligence(
          serverResult.value,
          latestAnalysis,
        );
        const localContext = buildLocalNutrientContext({
          fieldId,
          crop,
          laboratoryAvailable: Boolean(latestAnalysis),
          soilGridsAvailable: soilIntelligence.soilGridsContextAvailable,
          serverProductionAuthority: true,
          recentFertilizationCount: soilIntelligence.recentFertilizationCount ?? 0,
          phenologyStageLabel: soilIntelligence.phenologyStageLabel ?? null,
          scientificSignals,
          pysticsRuntime,
        });

        setState({
          fieldId,
          status: 'ready',
          latestAnalysis,
          soilGridsStatus: serverResult.value.soilgrids.available ? 'ready' : 'idle',
          soilGridsProfile: null,
          soilIntelligence,
          serverAuthority: true,
          serverError: null,
          localContext,
        });
        return;
      }

      const serverError =
        serverResult.reason instanceof Error
          ? serverResult.reason.message
          : String(serverResult.reason ?? 'Toprak & Besin Zekâsı sunucu kararı alınamadı.');

      console.warn(
        '[TarlaPusula] Server-side Toprak & Besin Zekâsı alınamadı; güvenli yerel bağlama dönülüyor:',
        serverResult.reason,
      );

      const soilResult = hasCoordinates
        ? await Promise.resolve(
            fetchSoilGridsProfile(latitude!, longitude!, {
              signal: controller.signal,
            }),
          ).then(
            (value) => ({ status: 'fulfilled' as const, value }),
            (reason) => ({ status: 'rejected' as const, reason }),
          )
        : ({ status: 'fulfilled' as const, value: null });

      if (cancelled) return;

      const soilGridsProfile =
        soilResult.status === 'fulfilled' ? soilResult.value : null;
      const soilGridsStatus: SoilGridsState = !hasCoordinates
        ? 'idle'
        : soilResult.status === 'fulfilled' && soilGridsProfile
          ? 'ready'
          : 'error';

      if (analysisResult.status === 'rejected') {
        console.warn(
          '[TarlaPusula] Besin bağlamı için toprak analizi okunamadı:',
          analysisResult.reason,
        );
      }
      if (soilResult.status === 'rejected' && !controller.signal.aborted) {
        console.warn(
          '[TarlaPusula] Soil Intelligence için SoilGrids okunamadı:',
          soilResult.reason,
        );
      }

      const soilIntelligence = buildSoilIntelligence({
        latestAnalysis,
        soilGridsProfile,
        soilGridsStatus,
      });
      const localContext = buildLocalNutrientContext({
        fieldId,
        crop,
        laboratoryAvailable: Boolean(latestAnalysis),
        soilGridsAvailable: soilIntelligence.soilGridsContextAvailable,
        serverProductionAuthority: false,
        recentFertilizationCount: soilIntelligence.recentFertilizationCount ?? 0,
        phenologyStageLabel: soilIntelligence.phenologyStageLabel ?? null,
        scientificSignals,
        pysticsRuntime,
      });

      setState({
        fieldId,
        status: analysisResult.status === 'fulfilled' ? 'ready' : 'error',
        latestAnalysis,
        soilGridsStatus,
        soilGridsProfile,
        soilIntelligence,
        serverAuthority: false,
        serverError,
        localContext,
      });
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [fieldId, latitude, longitude, crop, revision]);

  return state.fieldId === fieldId && !fieldId.startsWith('demo')
    ? state
    : { ...EMPTY, fieldId };
}
