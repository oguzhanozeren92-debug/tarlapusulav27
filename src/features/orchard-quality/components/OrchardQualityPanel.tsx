import type { Field } from '../../../types';
import { useFieldYieldHarvestQuality } from '../../yield-quality/hooks/useFieldYieldHarvestQuality';
import { buildOrchardQualitySummary } from '../services/orchardQualitySummary.service';
import './OrchardQualityPanel.css';

type Props = { field: Field | null | undefined };

export default function OrchardQualityPanel({ field }: Props) {
  const qualityState = useFieldYieldHarvestQuality(field);
  const summary = buildOrchardQualitySummary(qualityState.snapshot);

  if (!field || field.demo || (field.cropCycle ?? 'annual') !== 'perennial') return null;

  return (
    <section className="tp-orchard-quality" aria-label="Hasat kalite kaydı">
      <header>
        <div>
          <span>HASAT KALİTESİ</span>
          <strong>Ürünün ölçülen kalitesi ne durumda?</strong>
        </div>
        <button type="button" onClick={() => void qualityState.refresh()} disabled={qualityState.loading}>
          {qualityState.loading ? 'Bakılıyor…' : 'Yenile'}
        </button>
      </header>

      {qualityState.error && !qualityState.snapshot ? (
        <div className="tp-orchard-quality-state">{qualityState.error}</div>
      ) : qualityState.loading && !qualityState.snapshot ? (
        <div className="tp-orchard-quality-state">Gerçek hasat ve kalite kayıtları kontrol ediliyor…</div>
      ) : (
        <>
          <div className={`tp-orchard-quality-summary is-${summary.status}`}>
            <span>ÜRETİCİ İÇİN ÖZET</span>
            <strong>{summary.headline}</strong>
            <p>{summary.meaning}</p>
          </div>

          {summary.metrics.length ? (
            <div className="tp-orchard-quality-metrics">
              {summary.metrics.map((metric) => (
                <article key={metric.key}>
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                  <small>{metric.explanation}</small>
                </article>
              ))}
            </div>
          ) : (
            <div className="tp-orchard-quality-empty">
              <strong>Burada tahmin göstermiyorum.</strong>
              <p>Kalite ölçümü girildiğinde gerçek değer burada görünecek ve aynı kayıt PusulaPDF/satış geçmişinde kullanılabilecek.</p>
            </div>
          )}

          <details>
            <summary>Kayıt ayrıntıları</summary>
            {summary.harvestDate ? <p>Hasat tarihi: {summary.harvestDate}</p> : null}
            {summary.evidence.map((item) => <p key={item}>{item}</p>)}
            {summary.warnings.map((item) => <p key={`w-${item}`} className="warning">{item}</p>)}
          </details>
        </>
      )}
    </section>
  );
}
