import type { Field } from '../../../types';
import { useHarvestReadiness } from '../hooks/useHarvestReadiness';
import './HarvestReadinessPanel.css';

type Props = { field: Field | null | undefined };

function dayLabel(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }).format(date);
}

function workLabel(value: 'uygun' | 'temkinli' | 'uygun_degil') {
  if (value === 'uygun') return 'Saha uygun';
  if (value === 'temkinli') return 'Kontrol et';
  return 'Uygun değil';
}

export default function HarvestReadinessPanel({ field }: Props) {
  const state = useHarvestReadiness(field);
  const data = state.snapshot;

  if (!field || field.demo || (field.cropCycle ?? 'annual') !== 'perennial') return null;

  return (
    <section className="tp-harvest-ready" aria-label="Hasat olgunluk penceresi">
      <header>
        <div>
          <span>HASAT ZAMANI</span>
          <strong>Hasada ne kadar yakınız?</strong>
        </div>
        <button type="button" onClick={() => void state.refresh()} disabled={state.loading}>
          {state.loading ? 'Bakılıyor…' : 'Yenile'}
        </button>
      </header>

      {!data && state.loading ? (
        <div className="tp-harvest-ready-state">Fenoloji, hasat geçmişi ve saha havası birlikte kontrol ediliyor…</div>
      ) : state.error && !data ? (
        <div className="tp-harvest-ready-state">{state.error}</div>
      ) : data ? (
        <>
          <div className={`tp-harvest-ready-summary is-${data.status}`}>
            <span>BUGÜNÜN YORUMU</span>
            <strong>{data.headline}</strong>
            <p>{data.meaning}</p>
          </div>

          <div className="tp-harvest-ready-facts">
            <article>
              <span>Beklenen dönem</span>
              <strong>{data.expectedHarvestDate ?? 'Henüz net değil'}</strong>
              <small>{data.daysToExpectedHarvest === null ? 'Takvim oluşmadı' : data.daysToExpectedHarvest >= 0 ? `Yaklaşık ${data.daysToExpectedHarvest} gün` : 'Beklenen tarih geçti'}</small>
            </article>
            <article>
              <span>Saha gözlemi</span>
              <strong>{data.orchardStage ?? data.phenologyStage ?? 'Kayıt yok'}</strong>
              <small>Fenoloji/ağaç kaydı</small>
            </article>
          </div>

          <div className="tp-harvest-ready-weather">
            <div className="tp-harvest-ready-weather-head">
              <div>
                <span>SAHA ÇALIŞMA HAVASI</span>
                <strong>{data.workWeather.bestDay ? `${dayLabel(data.workWeather.bestDay.date)} öne çıkıyor` : 'Hava verisi yok'}</strong>
              </div>
              <small>Olgunluk değil, çalışma koşulu</small>
            </div>
            {data.workWeather.days.length ? (
              <div className="tp-harvest-ready-days">
                {data.workWeather.days.map((day) => (
                  <article key={day.date} className={`is-${day.label}`}>
                    <span>{dayLabel(day.date)}</span>
                    <strong>{workLabel(day.label)}</strong>
                    <small>{day.precipitationMm === null ? 'Yağış —' : `Yağış ${day.precipitationMm} mm`}</small>
                  </article>
                ))}
              </div>
            ) : null}
            <p>{data.workWeather.note}</p>
          </div>

          <details>
            <summary>Neye göre?</summary>
            {data.evidence.map((item) => <p key={item}>{item}</p>)}
            {data.warnings.map((item) => <p key={`w-${item}`} className="warning">{item}</p>)}
          </details>
        </>
      ) : null}
    </section>
  );
}
