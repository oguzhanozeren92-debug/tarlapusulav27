import type { Field } from '../../../types';
import { useFruitLoadRadar } from '../hooks/useFruitLoadRadar';
import type { FruitLoadRadarLevel } from '../types/fruitLoadRadar';
import './FruitLoadRadarPanel.css';

type Props = { field: Field };

const LABEL: Record<FruitLoadRadarLevel, string> = {
  none: 'Meyve yükü yok',
  low: 'Düşük meyve yükü',
  medium: 'Orta meyve yükü',
  high: 'Yüksek meyve yükü',
  very_high: 'Çok yüksek meyve yükü',
  unknown: 'Meyve yükü henüz bilinmiyor',
};

function whole(value: number | null) {
  return value === null ? '—' : Math.round(value).toLocaleString('tr-TR');
}

export default function FruitLoadRadarPanel({ field }: Props) {
  const radar = useFruitLoadRadar(field);
  const data = radar.snapshot;

  if (data.status === 'not_applicable') return null;

  return (
    <section className="tp-fruit-load" aria-label="Meyve sayımı ve hasat yükü radarı">
      <header className="tp-fruit-load-head">
        <div>
          <span>MEYVE YÜKÜ · MADDE 13</span>
          <strong>{LABEL[data.level]}</strong>
        </div>
        <button type="button" onClick={() => void radar.refresh()} disabled={radar.loading}>
          {radar.loading ? 'Yenileniyor…' : 'Yenile'}
        </button>
      </header>

      {data.status === 'empty' ? (
        <div className="tp-fruit-load-empty">
          <strong>Önce ağaç kaydı gerekli</strong>
          <p>Ağaç bazlı Pusula'ya ağaç eklenmeden bahçe yükü üretmiyorum.</p>
        </div>
      ) : data.status === 'insufficient' ? (
        <div className="tp-fruit-load-empty">
          <strong>Meyve yükü için saha kaydı bekleniyor</strong>
          <p>Ağaç gözleminde meyve yükünü seç veya gerçek sayılmış meyve adedini gir. Tek uydu görüntüsünden ağaç başına meyve sayısı üretmiyorum.</p>
        </div>
      ) : (
        <>
          <div className="tp-fruit-load-metrics">
            <article>
              <span>MEYVE BAĞLAMI</span>
              <strong>{data.fruitContextTreeCount}/{data.treeCount}</strong>
              <small>gözlemli / toplam ağaç</small>
            </article>
            <article>
              <span>GERÇEK SAYIM</span>
              <strong>{data.measuredFruitCountTreeCount}</strong>
              <small>ağaçta adet sayılmış</small>
            </article>
            <article>
              <span>ÖRNEKLEM KAPSAMI</span>
              <strong>%{data.sampleCoveragePct}</strong>
              <small>toplam ağaçların</small>
            </article>
          </div>

          <div className="tp-fruit-load-distribution">
            <div><span>Yok</span><strong>{data.distribution.none}</strong></div>
            <div><span>Düşük</span><strong>{data.distribution.low}</strong></div>
            <div><span>Orta</span><strong>{data.distribution.medium}</strong></div>
            <div><span>Yüksek</span><strong>{data.distribution.high}</strong></div>
            <div><span>Çok yüksek</span><strong>{data.distribution.very_high}</strong></div>
          </div>

          <div className="tp-fruit-load-counts">
            <div>
              <span>Sayılmış toplam</span>
              <strong>{whole(data.measuredFruitCountSum)}</strong>
            </div>
            <div>
              <span>Sayılmış ağaç ortalaması</span>
              <strong>{whole(data.measuredFruitCountMean)}</strong>
            </div>
            <div>
              <span>Kaba bahçe projeksiyonu</span>
              <strong>{data.projectionEligible ? `≈ ${whole(data.projectedFruitCount)}` : '—'}</strong>
              <small>{data.projectionReason}</small>
            </div>
          </div>

          {(data.stressTreeCount || data.waterStressTreeCount || data.alternancePossible) ? (
            <div className="tp-fruit-load-risk">
              <strong>Hasada kadar korunacak yükü ayrıca izle</strong>
              <span>
                {data.stressTreeCount ? `${data.stressTreeCount} stresli ağaç. ` : ''}
                {data.waterStressTreeCount ? `${data.waterStressTreeCount} su stresi kaydı. ` : ''}
                {data.alternancePossible ? 'Olası alternans örüntüsü var.' : ''}
              </span>
            </div>
          ) : null}

          <details className="tp-fruit-load-details">
            <summary>Kanıt ve sınırlar</summary>
            {data.evidence.map((item) => <p key={item}>{item}</p>)}
            {data.warnings.map((item) => <p className="warning" key={item}>{item}</p>)}
          </details>
        </>
      )}

      {radar.error ? <p className="tp-fruit-load-error">{radar.error}</p> : null}
    </section>
  );
}
