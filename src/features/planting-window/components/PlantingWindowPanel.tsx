import { useEffect, useMemo, useState } from 'react';
import type {
  PlantingWindowDecisionResult,
  PlantingWindowScenario,
  PlantingWindowScenarioDecision,
  WheatPlantingWindowResult,
} from '../types/plantingWindow';
import { fetchWheatPlantingWindowScenarios } from '../services/plantingWindow.service';
import { buildPlantingWindowDecision } from '../services/plantingWindowDecision.service';
import './PlantingWindowPanel.css';

type PlantingWindowPanelProps = {
  fieldId: string | number;
  crop?: string | null;
};

type PanelState = {
  source: WheatPlantingWindowResult | null;
  decision: PlantingWindowDecisionResult | null;
  loading: boolean;
  error: string;
};

const initialState: PanelState = {
  source: null,
  decision: null,
  loading: false,
  error: '',
};

function normalizeCrop(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ı/g, 'i')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ');
}

function isWheat(value: unknown) {
  const crop = normalizeCrop(value);
  return crop === 'bugday' || crop.includes('wheat');
}

function formatDate(value: string | null | undefined, withYear = false) {
  if (!value) return '—';
  const date = new Date(`${value}T12:00:00Z`);
  if (!Number.isFinite(date.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: 'short',
    ...(withYear ? { year: 'numeric' as const } : {}),
    timeZone: 'UTC',
  }).format(date);
}

function exposureLabel(value: PlantingWindowScenarioDecision['relativeExposure']) {
  if (value === 'lower') return 'Daha düşük maruziyet';
  if (value === 'higher') return 'Daha yüksek maruziyet';
  if (value === 'middle') return 'Orta maruziyet';
  if (value === 'similar') return 'Benzer maruziyet';
  return 'Veri sınırlı';
}

function exposureClass(value: PlantingWindowScenarioDecision['relativeExposure']) {
  if (value === 'lower') return 'is-lower';
  if (value === 'higher') return 'is-higher';
  if (value === 'middle') return 'is-middle';
  if (value === 'similar') return 'is-similar';
  return 'is-unknown';
}

function scenarioSource(
  source: WheatPlantingWindowResult | null,
  key: PlantingWindowScenarioDecision['key'],
): PlantingWindowScenario | null {
  return source?.scenarios.find((scenario) => scenario.key === key) ?? null;
}

function metricText(value: number | null | undefined, suffix: string) {
  return value == null ? '—' : `${value.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}${suffix}`;
}

function MissingDataCard({ source }: { source: WheatPlantingWindowResult }) {
  const plantingMissing = source.missingInputs.includes('planting_history_or_verified_crop_calendar');
  const durationMissing = source.missingInputs.includes('real_planting_harvest_duration');
  const climateMissing = source.missingInputs.includes('historical_climate');

  return (
    <section className="tp-planting-window-panel tp-planting-window-panel-muted">
      <div className="tp-planting-window-head">
        <div>
          <span>PUSULA · EKİM PENCERESİ</span>
          <strong>Tehlikeden kaçış takvimi</strong>
        </div>
      </div>
      <p className="tp-planting-window-empty-title">Karşılaştırma için gerçek tarla kaydı gerekiyor.</p>
      <div className="tp-planting-window-missing-list">
        {plantingMissing && <span>En az 1 gerçek buğday ekim tarihi</span>}
        {durationMissing && <span>Kritik evre takvimi için ekim + hasat tarihi bulunan sezon</span>}
        {climateMissing && <span>Geçmiş yerel iklim serisi</span>}
      </div>
      <small>{source.note}</small>
    </section>
  );
}

export default function PlantingWindowPanel({ fieldId, crop }: PlantingWindowPanelProps) {
  const supportedCrop = isWheat(crop);
  const [state, setState] = useState<PanelState>(initialState);
  const [refreshToken, setRefreshToken] = useState(0);

  useEffect(() => {
    if (!supportedCrop || !String(fieldId ?? '').trim()) {
      setState(initialState);
      return;
    }

    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: '' }));

    void fetchWheatPlantingWindowScenarios(fieldId, { forceRefresh: refreshToken > 0 })
      .then((source) => {
        if (cancelled) return;
        setState({
          source,
          decision: buildPlantingWindowDecision(source),
          loading: false,
          error: '',
        });
      })
      .catch((error) => {
        if (cancelled) return;
        setState({
          source: null,
          decision: null,
          loading: false,
          error: error instanceof Error ? error.message : 'Ekim penceresi karşılaştırması alınamadı.',
        });
      });

    return () => {
      cancelled = true;
    };
  }, [fieldId, supportedCrop, refreshToken]);

  const scenarioRows = useMemo(() => {
    if (!state.decision) return [];
    return state.decision.scenarios.map((decision) => ({
      decision,
      source: scenarioSource(state.source, decision.key),
    }));
  }, [state.decision, state.source]);

  if (!supportedCrop) return null;

  if (state.loading && !state.source) {
    return (
      <section className="tp-planting-window-panel tp-planting-window-loading" aria-busy="true">
        <div className="tp-planting-window-head">
          <div>
            <span>PUSULA · EKİM PENCERESİ</span>
            <strong>3 tarih senaryosu hazırlanıyor…</strong>
          </div>
        </div>
        <div className="tp-planting-window-loading-bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section className="tp-planting-window-panel tp-planting-window-panel-muted">
        <div className="tp-planting-window-head">
          <div>
            <span>PUSULA · EKİM PENCERESİ</span>
            <strong>Karşılaştırma alınamadı</strong>
          </div>
          <button type="button" onClick={() => setRefreshToken((value) => value + 1)}>Yenile</button>
        </div>
        <p className="tp-planting-window-error">{state.error}</p>
      </section>
    );
  }

  if (!state.source || !state.decision) return null;
  if (state.source.status === 'needs_data' || state.decision.status === 'needs_data') {
    return <MissingDataCard source={state.source} />;
  }
  if (state.source.status !== 'ready' || state.decision.status !== 'ready') return null;

  return (
    <section className="tp-planting-window-panel">
      <div className="tp-planting-window-head">
        <div>
          <span>PUSULA · EKİM PENCERESİ</span>
          <strong>3 tarih · kritik evre karşılaştırması</strong>
        </div>
        <button
          type="button"
          className="tp-planting-window-refresh"
          onClick={() => setRefreshToken((value) => value + 1)}
          disabled={state.loading}
        >
          {state.loading ? '…' : 'Yenile'}
        </button>
      </div>

      <div className="tp-planting-window-pusula-note">
        <span>Pusula yorumu</span>
        <p>{state.decision.summary}</p>
      </div>

      <div className="tp-planting-window-scenarios">
        {scenarioRows.map(({ decision, source }) => {
          const critical = source?.escapeCalendar.criticalStage ?? null;
          const stages = source?.escapeCalendar.stages ?? [];
          const lower = state.decision?.lowerHistoricalExposureScenarioKey === decision.key;

          return (
            <article
              key={decision.key}
              className={`tp-planting-window-scenario ${lower ? 'is-highlighted' : ''}`}
            >
              <div className="tp-planting-window-scenario-top">
                <div>
                  <span>{decision.label}</span>
                  <strong>{formatDate(decision.plantingDate, true)}</strong>
                </div>
                <em className={exposureClass(decision.relativeExposure)}>
                  {exposureLabel(decision.relativeExposure)}
                </em>
              </div>

              <div className="tp-planting-window-index">
                <span>Göreli maruziyet indeksi</span>
                <strong>{decision.relativeExposureIndex == null ? '—' : Math.round(decision.relativeExposureIndex)}</strong>
                <small>Risk olasılığı değildir</small>
              </div>

              {critical && (
                <div className="tp-planting-window-critical">
                  <span>Kritik evre · {critical.stageLabel}</span>
                  <div>
                    <b><small>Donlu sezon</small>{metricText(critical.frostSeasonFrequencyPercent, '%')}</b>
                    <b><small>Sıcak sezon</small>{metricText(critical.heatSeasonFrequencyPercent, '%')}</b>
                    <b><small>Kuru seri</small>{metricText(critical.meanLongestDrySpellDays, ' gün')}</b>
                  </div>
                </div>
              )}

              {stages.length > 0 && (
                <div className="tp-planting-window-stage-list">
                  <span>Kritik evre takvimi</span>
                  {stages.map((stage) => (
                    <div key={`${decision.key}-${stage.stage}`}>
                      <strong>{stage.stageLabel}</strong>
                      <small>
                        {formatDate(stage.earliestEstimatedStartDate)} – {formatDate(stage.latestEstimatedEndDate)}
                      </small>
                    </div>
                  ))}
                </div>
              )}

              <div className="tp-planting-window-tradeoffs">
                {decision.tradeoffs.slice(0, 3).map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </article>
          );
        })}
      </div>

      <div className="tp-planting-window-foot">
        <strong>Planlama karşılaştırması</strong>
        <span>{state.decision.actionContext}</span>
      </div>
    </section>
  );
}
