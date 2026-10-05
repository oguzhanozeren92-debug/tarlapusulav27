import type { Field } from '../../../types';
import { useEntitlementStore } from '../../../entitlements/useEntitlementStore';
import { openPlanUpgrade } from '../../../entitlements/planAccess';
import { useOrchardChill } from '../hooks/useOrchardChill';
import PollinationWindowPanel from '../../orchard-pollination/components/PollinationWindowPanel';
import FruitLoadRadarPanel from '../../orchard-fruit-load/components/FruitLoadRadarPanel';
import HarvestReadinessPanel from '../../orchard-harvest-readiness/components/HarvestReadinessPanel';
import OrchardQualityPanel from '../../orchard-quality/components/OrchardQualityPanel';
import OrchardTrackingZonesPanel from '../../orchard-tracking-zones/components/OrchardTrackingZonesPanel';
import './OrchardChillPanel.css';

type Props = { field: Field | null | undefined };

function metric(value: number | null | undefined, suffix: string) {
  return value === null || value === undefined ? '—' : `${value.toLocaleString('tr-TR')} ${suffix}`;
}

export default function OrchardChillPanel({ field }: Props) {
  const entitlement = useEntitlementStore();

  const eligibleField =
    entitlement.isPremium &&
    field &&
    !field.demo &&
    (field.cropCycle ?? 'annual') === 'perennial'
      ? field
      : null;

  // Ücretsiz kullanıcıda Premium hesaplamayı arka planda çalıştırmıyoruz.
  const chill = useOrchardChill(eligibleField);
  const snapshot = chill.snapshot;

  if (!field) return null;
  if (field.demo) return null;
  if ((field.cropCycle ?? 'annual') !== 'perennial') return null;

  if (!entitlement.isPremium) {
    return (
      <section className="tp-chill-premium-preview" aria-label="Premium meyve soğuklama özelliği">
        <div className="tp-chill-premium-top">
          <div>
            <span className="tp-chill-premium-kicker">KIŞ DİNLENMESİ · MGM BİSİP REFERANSI</span>
            <h3>Ağaç yeterince soğuk gördü mü?</h3>
          </div>
          <span className="tp-chill-premium-badge">
            <span aria-hidden="true">◆</span>
            PREMIUM
          </span>
        </div>

        <p className="tp-chill-premium-intro">
          Badem, elma, kiraz, şeftali gibi çok yıllık meyveler ilkbaharda düzenli uyanabilmek
          için kış boyunca yeterli serinlik biriktirmelidir. TarlaPusula bu özelliği
          tarlanın saatlik sıcaklıkları ve MGM BİSİP referansıyla takip eder.
        </p>

        <div className="tp-chill-premium-mock" aria-hidden="true">
          <article>
            <span>Birikmiş soğuk</span>
            <strong>••• saat</strong>
            <small>Tarla konumundan hesaplanır</small>
          </article>
          <article>
            <span>Çeşit ihtiyacı</span>
            <strong>Resmî eşik</strong>
            <small>Doğrulanabilen çeşitle karşılaştırılır</small>
          </article>
          <article>
            <span>Kalan ihtiyaç</span>
            <strong>Takip edilir</strong>
            <small>Uyanma dönemine yaklaşırken yorumlanır</small>
          </article>
        </div>

        <div className="tp-chill-premium-why">
          <span>NE İŞE YARAR?</span>
          <strong>Kış dinlenmesinin yeterli olup olmadığını erkenden anlamana yardımcı olur.</strong>
          <p>
            Birikmiş soğuklama, seçili çeşit için doğrulanabilen ihtiyaç eşiği, MGM istasyon
            referansı ve teknik modeller tek yerde gösterilir.
          </p>
        </div>

        <div className="tp-chill-premium-footer">
          <div>
            <span>Premium ile açılır</span>
            <small>Soğuklama takibi · çeşit karşılaştırması · MGM BİSİP referansı</small>
          </div>
          <button
            type="button"
            onClick={() =>
              openPlanUpgrade({
                requiredPlan: 'premium',
                feature: 'Meyve Soğuklama Takibi · MGM BİSİP',
              })
            }
          >
            Premium'u İncele
          </button>
        </div>
      </section>
    );
  }

  if (snapshot && snapshot.status === 'not_applicable') return null;

  const classicHours = snapshot?.localMetrics?.classicHours ?? null;
  const hasVarietyRequirement = Boolean(
    snapshot?.variety &&
    (snapshot as any)?.officialReference?.requiredHours != null,
  );

  return (
    <div
      data-required-plan="premium"
      data-plan-feature="Bahçe / BİSİP Soğuklama"
      style={{ display: 'contents' }}
    >
      <section className="tp-chill-card" aria-label="Meyve soğuklama durumu">
        <div className="tp-chill-head">
          <div>
            <span>KIŞ DİNLENMESİ · MGM BİSİP REFERANSI</span>
            <strong>Ağaç yeterince soğuk gördü mü?</strong>
          </div>
          <button type="button" onClick={() => void chill.refresh()} disabled={chill.loading}>
            {chill.loading ? 'Hesaplanıyor…' : 'Yenile'}
          </button>
        </div>

        {!snapshot && chill.loading ? (
          <div className="tp-chill-state">Kış sıcaklıkları ve MGM istasyon referansı kontrol ediliyor…</div>
        ) : chill.error && !snapshot ? (
          <div className="tp-chill-state tp-chill-error">{chill.error}</div>
        ) : snapshot ? (
          <>
            <div className="tp-chill-farmer-summary">
              <span>BU KIŞ BİRİKEN SOĞUK</span>
              <strong>{metric(classicHours, 'saat')}</strong>
              <p>
                Meyve ağaçları ilkbaharda düzenli uyanabilmek için kışın belli süre serin havaya ihtiyaç duyar.
                Bu değer tarlanın saatlik sıcaklıklarından hesaplanan birikimi gösterir.
              </p>
            </div>

            <div className="tp-chill-simple-grid">
              <article>
                <span>Ürün / çeşit</span>
                <strong>{snapshot.crop}{snapshot.variety ? ` · ${snapshot.variety}` : ''}</strong>
              </article>
              <article>
                <span>MGM karşılaştırma istasyonu</span>
                <strong>{snapshot.officialReference.stationName || 'BİSİP referansı'}</strong>
                <small>{snapshot.officialReference.city || ''}{snapshot.officialReference.district ? ` · ${snapshot.officialReference.district}` : ''}</small>
              </article>
              <article>
                <span>İncelenen kış dönemi</span>
                <strong>{snapshot.windowStart} → {snapshot.windowEnd}</strong>
              </article>
              <article>
                <span>Veri tamamlığı</span>
                <strong>{snapshot.coveragePct === null ? '—' : `%${snapshot.coveragePct}`}</strong>
              </article>
            </div>

            <div className="tp-chill-meaning">
              <span>ÜRETİCİ İÇİN NE DEMEK?</span>
              <strong>{hasVarietyRequirement ? 'Çeşit ihtiyacıyla karşılaştırma yapılabilir' : 'Birikim var; çeşit eşiği doğrulanmadan “yeterli” demiyorum'}</strong>
              <p>
                {snapshot.variety
                  ? `${snapshot.variety} çeşidinin resmî soğuklama ihtiyacı otomatik doğrulanabildiğinde kalan ihtiyaç ayrıca gösterilir.`
                  : 'Çeşit bilgisi girilirse resmî kaynakta doğrulanabilen çeşit eşiğiyle karşılaştırma yapılabilir.'}
              </p>
            </div>

            <div className="tp-chill-mgm compact">
              <div>
                <span>MGM BİSİP</span>
                <strong>Resmî istasyon ekranıyla kontrol et</strong>
                <p>TarlaPusula tarla koordinatını hesaplar; MGM ekranı resmî istasyon referansıdır.</p>
              </div>
              <a href={snapshot.officialReference.officialUrl} target="_blank" rel="noreferrer">BİSİP’i aç</a>
            </div>

            <details className="tp-chill-details">
              <summary>Teknik karşılaştırmayı göster</summary>
              <div className="tp-chill-technical-grid">
                <article><span>Klasik 0–7,2 °C</span><strong>{metric(classicHours, 'saat')}</strong></article>
                <article><span>Utah</span><strong>{metric(snapshot.localMetrics?.utahUnits, 'CU')}</strong></article>
                <article><span>Dynamic Model</span><strong>{metric(snapshot.localMetrics?.chillPortions, 'CP')}</strong></article>
              </div>
              {snapshot.evidence.map((item) => <p key={item}>{item}</p>)}
              {snapshot.warnings.map((item) => <p key={`warning-${item}`} className="warning">{item}</p>)}
              <p>TarlaPusula’nın klasik saat değeri MGM yöntemindeki 0–7,2 °C aralığını kullanır; tarla koordinatındaki saatlik seri resmî MGM istasyon gözlemi değildir.</p>
            </details>
          </>
        ) : null}
      </section>
      <PollinationWindowPanel field={field} />
      <OrchardTrackingZonesPanel field={field} />
      <FruitLoadRadarPanel field={field} />
      <HarvestReadinessPanel field={field} />
      <OrchardQualityPanel field={field} />
    </div>
  );
}
