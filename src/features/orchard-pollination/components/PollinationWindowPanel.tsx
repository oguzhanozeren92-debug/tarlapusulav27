import type { Field } from '../../../types';
import { useOrchardTreeContext } from '../../orchard/hooks/useOrchardTreeContext';
import { formatPollinationHour, resolvePollinationMode } from '../services/pollinationWindow.service';
import { usePollinationWindow } from '../hooks/usePollinationWindow';
import './PollinationWindowPanel.css';

type Props = { field: Field };

function dayLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  if (!Number.isFinite(value.getTime())) return date;
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' }).format(value);
}

function simpleStatus(status: 'good' | 'watch' | 'poor') {
  if (status === 'good') return 'Hava uygun';
  if (status === 'watch') return 'Hava sınırlı';
  return 'Hava uygun değil';
}

export default function PollinationWindowPanel({ field }: Props) {
  const mode = resolvePollinationMode(field.crop);
  const orchard = useOrchardTreeContext(field.id, field.crop, mode !== 'unsupported' && !field.demo);
  const floweringCount = orchard.snapshot.floweringTreeCount;
  const pollination = usePollinationWindow(field, floweringCount);
  const snapshot = pollination.snapshot;

  if (field.demo || mode === 'unsupported' || (field.cropCycle ?? 'annual') !== 'perennial') return null;

  const today = snapshot?.today ?? null;
  const hasFloweringRecord = floweringCount > 0;
  const bestWindow = snapshot?.windows
    .filter((window) => window.to >= Date.now())
    .sort((a, b) => b.averageScore - a.averageScore)[0] ?? null;

  return (
    <section className="tp-pollination-card" aria-label="Çiçeklenme hava penceresi">
      <header className="tp-pollination-head">
        <div>
          <span>{hasFloweringRecord ? 'TOZLAŞMA HAVA PENCERESİ' : 'ÇİÇEKLENME HAVA KONTROLÜ'}</span>
          <strong>{hasFloweringRecord ? 'Çiçekteki ağaçlar için hava uygun mu?' : 'Ağaç çiçekteyse hava yardımcı olur mu?'}</strong>
          <small>{hasFloweringRecord ? `${floweringCount} ağaçta çiçeklenme saha kaydı var` : 'Bahçede güncel çiçeklenme kaydı yok'}</small>
        </div>
        <button type="button" onClick={() => void pollination.refresh()} disabled={pollination.loading}>
          {pollination.loading ? 'Taranıyor…' : 'Yenile'}
        </button>
      </header>

      {pollination.error && !snapshot ? (
        <div className="tp-pollination-state error">{pollination.error}</div>
      ) : !snapshot ? (
        <div className="tp-pollination-state">Sıcaklık, yağış ve rüzgâr kontrol ediliyor…</div>
      ) : (
        <>
          <div className={`tp-pollination-today ${today?.bestStatus ?? 'poor'}`}>
            <div>
              <span>BUGÜN</span>
              <strong>{today ? simpleStatus(today.bestStatus) : 'Veri yok'}</strong>
              <small>{today?.limitingFactor || 'Belirgin hava engeli görünmüyor'}</small>
            </div>
          </div>

          <div className="tp-pollination-meaning">
            <span>ÜRETİCİ İÇİN NE DEMEK?</span>
            {hasFloweringRecord ? (
              <>
                <strong>{today?.bestStatus === 'good' ? 'Çiçekteki ağaçlarda tozlayıcı hareketi için hava elverişli olabilir.' : 'Çiçekteki ağaçlarda hava koşullarını takip et.'}</strong>
                <p>Bu kart döllenmenin gerçekleştiğini söylemez; yalnız arı/böcek veya rüzgârla tozlaşmayı etkileyen hava koşullarını değerlendirir.</p>
              </>
            ) : (
              <>
                <strong>Şu an işlem önerisi yok.</strong>
                <p>Ağaçlarda çiçeklenme görürsen saha gözlemi kaydet. O zaman bu hava penceresi gerçek çiçeklenme dönemiyle birlikte yorumlanır.</p>
              </>
            )}
          </div>

          {hasFloweringRecord && bestWindow ? (
            <div className="tp-pollination-best-window">
              <span>En yakın elverişli saat</span>
              <strong>{formatPollinationHour(bestWindow.from, snapshot.timezone)}–{formatPollinationHour(bestWindow.to, snapshot.timezone)}</strong>
            </div>
          ) : null}

          <details className="tp-pollination-details">
            <summary>5 günlük hava ayrıntısını göster</summary>
            <div className="tp-pollination-days compact">
              {snapshot.days.slice(0, 5).map((day) => (
                <article key={day.date} className={day.bestStatus}>
                  <span>{dayLabel(day.date)}</span>
                  <strong>{simpleStatus(day.bestStatus)}</strong>
                  <small>{day.bestWindow ? `${formatPollinationHour(day.bestWindow.from, snapshot.timezone)}–${formatPollinationHour(day.bestWindow.to, snapshot.timezone)}` : day.limitingFactor || 'Uygun pencere yok'}</small>
                </article>
              ))}
            </div>
            {snapshot.evidence.map((item) => <p key={item}>{item}</p>)}
            {snapshot.warnings.map((item) => <p className="warning" key={item}>{item}</p>)}
          </details>
        </>
      )}
    </section>
  );
}
