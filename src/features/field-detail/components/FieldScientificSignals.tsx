import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, RefreshCw, Satellite, ShieldCheck } from 'lucide-react';

import {
  loadFieldScientificSignals,
  refreshFieldScientificSignals,
  type FieldScientificSignals,
  type ScientificMetric,
} from '../../../services/fieldScientificSignals.service';

import './FieldScientificSignals.css';

type Props = {
  fieldId: string;
};

const EMPTY: FieldScientificSignals = {
  biophysics: { latest: null, historyCount: 0 },
  rscm: null,
  dataConfidence: null,
};

function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function metricValue(metric: ScientificMetric | undefined) {
  return finite(metric?.value);
}

function formatMetric(key: string, metric: ScientificMetric | undefined) {
  const value = metricValue(metric);
  if (value === null) return '—';
  if (key === 'fCOVER' || key === 'fAPAR') return `%${Math.round(value * 100)}`;
  if (key === 'LAI') return value.toFixed(2);
  if (key === 'Albedo') return value.toFixed(3);
  return value.toFixed(2);
}

function qualityLabel(value: unknown) {
  const label = String(value ?? '').toLowerCase();
  if (label === 'high') return 'Yüksek';
  if (label === 'medium') return 'Orta';
  if (label === 'low') return 'Düşük';
  return 'Bekleniyor';
}

function confidenceLabel(value: unknown) {
  const label = String(value ?? '').toLowerCase();
  if (label === 'high') return 'Yüksek';
  if (label === 'medium') return 'Orta';
  if (label === 'insufficient') return 'Eksik veri';
  return 'Düşük';
}

function shortDate(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return '—';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' }).format(new Date(value));
}

export default function FieldScientificSignals({ fieldId }: Props) {
  const [signals, setSignals] = useState<FieldScientificSignals>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState('');
  const autoRefreshStarted = useRef(false);

  const load = useCallback(async () => {
    if (!fieldId) return EMPTY;
    const next = await loadFieldScientificSignals(fieldId);
    setSignals(next);
    return next;
  }, [fieldId]);

  const refresh = useCallback(async (manual = false) => {
    if (!fieldId || refreshing) return;
    setRefreshing(true);
    if (manual) setMessage('Uydu ve model verileri yenileniyor…');
    try {
      const result = await refreshFieldScientificSignals(fieldId);
      setSignals(result.signals);
      const successful = result.steps.filter((step) => step.ok && !step.blocked).length;
      const blocked = result.steps.filter((step) => step.blocked).length;
      setMessage(
        successful > 0
          ? `${successful} bilimsel katman güncellendi${blocked ? ` · ${blocked} katman yeterli veri bekliyor` : ''}.`
          : 'Bilimsel katmanlar yeterli gerçek veri birikmesini bekliyor.',
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bilimsel katmanlar yenilenemedi.');
    } finally {
      setRefreshing(false);
    }
  }, [fieldId, refreshing]);

  useEffect(() => {
    let alive = true;
    autoRefreshStarted.current = false;
    setLoading(true);
    setMessage('');

    void (async () => {
      try {
        const current = await loadFieldScientificSignals(fieldId);
        if (!alive) return;
        setSignals(current);
        if (!current.biophysics.latest && !autoRefreshStarted.current) {
          autoRefreshStarted.current = true;
          void refresh(false);
        }
      } catch (error) {
        if (alive) setMessage(error instanceof Error ? error.message : 'Bilimsel sinyaller okunamadı.');
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [fieldId]); // refresh intentionally excluded: one auto-attempt per field change

  const latest = signals.biophysics.latest;
  const metrics = latest?.metrics ?? {};
  const rscm = signals.rscm?.assimilation ?? null;
  const confidence = signals.dataConfidence?.data_confidence ?? null;

  const cards = useMemo(() => [
    { key: 'LAI', label: 'Yaprak alanı', helper: 'LAI' },
    { key: 'fCOVER', label: 'Bitki örtüsü', helper: 'fCOVER' },
    { key: 'fAPAR', label: 'Işık kullanımı', helper: 'fAPAR' },
    { key: 'CCC', label: 'Klorofil', helper: 'CCC' },
    { key: 'CWC', label: 'Bitki suyu', helper: 'CWC' },
    { key: 'Albedo', label: 'Albedo', helper: 'Yansıtım' },
  ], []);

  return (
    <section className="tp-scientific-signals" aria-label="Bitki özellikleri ve bilimsel veri güveni">
      <header className="tp-scientific-signals-head">
        <div>
          <span>BİTKİ ÖZELLİKLERİ</span>
          <strong>Uydu + model gerçeklik katmanı</strong>
          <p>Sentinel-2 biyofizik özellikleri, model kalibrasyonu ve veri kalitesi birlikte izlenir.</p>
        </div>
        <button
          type="button"
          className="tp-scientific-refresh"
          disabled={refreshing}
          onClick={() => void refresh(true)}
          aria-label="Bilimsel verileri yenile"
        >
          <RefreshCw size={17} className={refreshing ? 'is-spinning' : ''} />
          <span>{refreshing ? 'Yenileniyor' : 'Yenile'}</span>
        </button>
      </header>

      {loading && !latest ? (
        <div className="tp-scientific-empty">Bilimsel sinyaller yükleniyor…</div>
      ) : latest ? (
        <>
          <div className="tp-scientific-source-line">
            <Satellite size={15} />
            <span>SL2P · Sentinel-2 · {shortDate(latest.acquiredAt)}</span>
            <b>Kalite: {qualityLabel(latest.qc?.quality)}</b>
          </div>

          <div className="tp-scientific-metric-grid">
            {cards.map((item) => (
              <div className="tp-scientific-metric" key={item.key}>
                <span>{item.label}</span>
                <strong>{formatMetric(item.key, metrics[item.key])}</strong>
                <small>{item.helper}</small>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="tp-scientific-empty">
          Sentinel-2 biyofizik sonucu henüz yok. Sistem ilk uygun görüntüleri bulduğunda LAI, örtü, klorofil ve bitki suyu burada görünecek.
        </div>
      )}

      <div className="tp-scientific-model-list">
        <div className="tp-scientific-model-row">
          <div className="tp-scientific-model-icon"><Activity size={17} /></div>
          <div className="tp-scientific-model-copy">
            <span>RSCM · MODEL–GERÇEKLİK</span>
            {rscm ? (
              <>
                <strong>Uyum {Math.round(Number(rscm.model_reality_alignment_score ?? 0))}/100</strong>
                <small>{rscm.observation_count ?? 0} gerçek LAI tarihi · RMSE {finite(rscm.rmse_lai)?.toFixed(2) ?? '—'}</small>
              </>
            ) : (
              <>
                <strong>Kalibrasyon için gerçek gözlem birikiyor</strong>
                <small>{signals.biophysics.historyCount}/4+ uydu tarihi · yalnız buğday, mısır ve çeltik pilotu</small>
              </>
            )}
          </div>
        </div>

        <div className="tp-scientific-model-row">
          <div className="tp-scientific-model-icon"><ShieldCheck size={17} /></div>
          <div className="tp-scientific-model-copy">
            <span>VERİ GÜVENİ · HARMONİZASYON</span>
            {confidence ? (
              <>
                <strong>{Math.round(Number(confidence.score ?? 0))}/100 · {confidenceLabel(confidence.class)}</strong>
                <small>
                  {Array.isArray(confidence.missing_required) && confidence.missing_required.length
                    ? `Eksik: ${confidence.missing_required.join(', ')}`
                    : 'Uydu, hava, toprak, sezon ve model kanıtları birlikte kontrol edildi.'}
                </small>
              </>
            ) : (
              <>
                <strong>Veri güveni hesaplanıyor</strong>
                <small>Uydu, hava, toprak, sezon ve model kaynakları tek kalite katmanında birleşecek.</small>
              </>
            )}
          </div>
        </div>
      </div>

      {message ? <p className="tp-scientific-message">{message}</p> : null}
    </section>
  );
}
