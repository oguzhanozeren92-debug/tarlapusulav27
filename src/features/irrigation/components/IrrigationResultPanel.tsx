import IrrigationEconomicsPanel from '../../irrigation-economics/components/IrrigationEconomicsPanel';
import QuickCalendarButton from '../../calendar/components/QuickCalendarButton';
import { calendarDateAfterDays } from '../../calendar/services/quickCalendar.service';
import type { IrrigationDecisionResult } from '../types/irrigationDecision';
import type { IrrigationWhatIfResult } from '../services/irrigationWhatIf.service';
import './IrrigationResultPanel.css';

type Props = {
  decision: IrrigationDecisionResult | null | undefined;
  whatIf?: IrrigationWhatIfResult | null;
  status?: string;
  error?: string | null;
  onOpenDataEntry?: () => void;
  onAddIrrigationRecord?: () => void;
};

function millimeters(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return 'Hesaplanamadı';
  return value.toLocaleString('tr-TR', { maximumFractionDigits: 1 }) + ' mm';
}
function num(value: number | null | undefined, digits = 1) {
  return value == null || !Number.isFinite(value) ? '—' :
    value.toLocaleString('tr-TR', { maximumFractionDigits: digits });
}
function dateTr(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value.slice(0, 10) + 'T12:00:00');
  return Number.isFinite(d.getTime())
    ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
    : '—';
}
function methodLabel(value: unknown) {
  const s = String(value ?? '').toLocaleLowerCase('tr-TR');
  if (s.includes('drip') || s.includes('damla')) return 'Damla sulama';
  if (s.includes('sprink') || s.includes('yağmur')) return 'Yağmurlama';
  if (s.includes('furrow') || s.includes('karık')) return 'Karık sulama';
  if (s.includes('flood') || s.includes('salma')) return 'Salma sulama';
  return value ? String(value) : 'Belirtilmedi';
}
function confidenceLabel(value: IrrigationDecisionResult['confidence']) {
  if (value === 'high') return 'Yüksek';
  if (value === 'medium') return 'Orta';
  return 'Düşük';
}
function presentation(decision: IrrigationDecisionResult) {
  switch (decision.decision) {
    case 'irrigate_now': return { label: 'Bugünkü karar', title: 'Sulamayı kontrol et', tag: 'Sulama öneriliyor', tone: 'attention' };
    case 'irrigation_approaching': return { label: 'Bugünkü karar', title: 'Sulama yaklaşıyor', tag: 'Hazırlık zamanı', tone: 'approaching' };
    case 'wait': return { label: 'Bugünkü karar', title: 'Şimdilik sulama yapma', tag: 'Bekle', tone: 'safe' };
    case 'rainfed_monitoring': return { label: 'Bugünkü karar', title: 'Yağışı ve su stresini izle', tag: 'Kuru tarım', tone: 'neutral' };
    default: return { label: 'Bugünkü karar', title: 'Önce eksik bilgiyi tamamla', tag: 'Veri eksik', tone: 'missing' };
  }
}
function decisionDate(result: IrrigationDecisionResult) {
  if (result.decision === 'irrigate_now') return calendarDateAfterDays(0);
  const days = result.waterBalance?.daysToStressThreshold;
  if (result.decision === 'irrigation_approaching' && days != null && Number.isFinite(days))
    return calendarDateAfterDays(Math.max(1, Math.ceil(days)));
  return null;
}
function moistureRisk(value: string | undefined) {
  return value === 'high' ? 'Yüksek' : value === 'elevated' ? 'Artıyor' :
    value === 'normal' ? 'Düşük' : 'Veri yetersiz';
}

export default function IrrigationResultPanel({
  decision, whatIf, status, error, onOpenDataEntry, onAddIrrigationRecord,
}: Props) {
  if (!decision) {
    return (
      <section className="tp-irrigation-result tp-irrigation-result--empty">
        <span className="tp-irrigation-result__eyebrow">SULAMA PLANI</span>
        <h3>{status === 'loading' ? 'Sulama hesabı hazırlanıyor…' : status === 'error' ? 'Sulama sonucu alınamadı' : 'Sulama için veri gerekiyor'}</h3>
        <p>{error || 'Ürün, hava ve saha kayıtları tamamlandığında sulama kararı bu ekranda gösterilir.'}</p>
        {onOpenDataEntry && <button type="button" className="tp-irrigation-result__action" onClick={onOpenDataEntry}>Veri Girişi’ni aç</button>}
      </section>
    );
  }

  const needsData = decision.decision === 'needs_data';
  const isRainfed = decision.irrigationStatus === 'rainfed';
  const missing = new Set(decision.missing || []);
  const missingIrrigation = !isRainfed && (missing.has('last_irrigation') || missing.has('last_irrigation_amount'));
  const nextDate = needsData || isRainfed ? null : decisionDate(decision);
  const recommendation = decision.recommendation?.netWaterMm;
  const showWater = !needsData && !isRainfed && recommendation != null && Number.isFinite(recommendation);
  const nextControl = nextDate ? dateTr(nextDate) : needsData ? 'Veri gerekli' :
    isRainfed ? 'Hava durumuna göre' : 'Şu an belirlenmedi';
  const outlook = (decision.forecast || []).slice(0, 5);
  const rain = decision.rainSummary;
  const balance = decision.waterBalance;
  const stress = decision.rainfedStress;
  const colors = presentation(decision);
  const scenario = whatIf?.status === 'ready'
    ? whatIf.metrics.find((item) => item.key === 'deficit_after_2d') : null;
  const reasons = (decision.reasons || []).filter(Boolean).slice(0, 5);
  const model = decision.modelEvidence;
  const seasonModel = decision.seasonModelEvidence;
  const validation = model?.promotionGate?.validationHistory;

  return (
    <div className="tp-irrigation-result">
      <section className={`tp-irrigation-result__hero tp-irrigation-result__hero--${colors.tone}`}>
        <div className="tp-irrigation-result__hero-top">
          <span className="tp-irrigation-result__eyebrow">{colors.label}</span>
          <span className="tp-irrigation-result__pill">{colors.tag}</span>
        </div>
        <h2>{colors.title}</h2>
        <p>{needsData
          ? 'Güvenilir sulama kararı için birkaç saha kaydı eksik.'
          : decision.display?.summary || 'Tarlanın su dengesi ve yakın dönem hava verileri değerlendirildi.'}</p>
        {!needsData && decision.display?.action && (
          <div className="tp-irrigation-result__instruction">{decision.display.action}</div>
        )}
        {needsData && (
          <button
            type="button"
            className="tp-irrigation-result__action"
            onClick={missingIrrigation && onAddIrrigationRecord ? onAddIrrigationRecord : onOpenDataEntry}
            disabled={!onOpenDataEntry && !(missingIrrigation && onAddIrrigationRecord)}
          >
            {missingIrrigation ? 'Son sulama tarihi ve miktarını ekle' : 'Eksik verileri tamamla'}
          </button>
        )}
      </section>

      {!needsData && (
        <>
          <div className="tp-irrigation-result__answer-grid">
            <article>
              <span>SONRAKİ SULAMA / KONTROL</span>
              <strong>{nextControl}</strong>
              <small>{nextDate
                ? decision.decision === 'irrigate_now' ? 'Bugünkü saha kontrolü' : 'Tahmini eşik tarihi; sahada doğrula'
                : 'Güvenilir bir tarih hesaplanmadı'}</small>
            </article>
            <article>
              <span>ÖNERİLEN NET SU</span>
              <strong>{showWater ? millimeters(recommendation) : 'Hesaplanamadı'}</strong>
              <small>{showWater ? `${num(recommendation)} m³/da net su eşdeğeri` : 'Veri olmadan miktar önerilmez'}</small>
            </article>
          </div>

          {nextDate && (
            <QuickCalendarButton
              className="tp-irrigation-result__calendar-action"
              fieldId={decision.fieldId}
              reminderType="Sulama"
              title={decision.decision === 'irrigate_now' ? 'Sulama kontrolü' : 'Tahmini sulama kontrolü'}
              reminderDate={nextDate}
              notes={[
                'Tahmini karar: ' + colors.tag,
                'Kesin uygulama öncesi toprak ve hava koşullarını kontrol et.',
                showWater ? 'Net su ihtiyacı: ' + millimeters(recommendation) + ' (brüt uygulama miktarı değildir).' : '',
              ].filter(Boolean).join(' · ')}
              label="Sulama kontrolünü takvime ekle"
            />
          )}

          <section className="tp-irrigation-result__schedule">
            <div className="tp-irrigation-result__section-heading">
              <div>
                <span className="tp-irrigation-result__eyebrow">SULAMA TAKVİMİ</span>
                <h3>Önümüzdeki 5 gün</h3>
              </div>
              <span className="tp-irrigation-result__forecast-label">Günlük hava tahmini</span>
            </div>
            {outlook.length ? (
              <div className="tp-irrigation-result__timeline">
                {outlook.map((day) => (
                  <div className="tp-irrigation-result__day" key={day.date}>
                    <div className="tp-irrigation-result__day-marker" aria-hidden="true" />
                    <div className="tp-irrigation-result__day-content">
                      <span>{dateTr(day.date)}</span>
                      <strong>{day.thresholdReached ? 'Sulama eşiğini kontrol et' : 'Su dengesini izle'}</strong>
                      <small>Beklenen yağış: {millimeters(day.precipitationMm)}</small>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="tp-irrigation-result__schedule-empty">Günlük hava tahmini mevcut değil. İleri tarihli yağış miktarı uydurulmaz.</p>
            )}
            <p className="tp-irrigation-result__disclaimer">Bu bir saha kontrol planıdır. Beş günün ötesi için günlük yağış veya kesin sulama tarihi tahmin edilmez.</p>
          </section>

          <details className="tp-irrigation-result__advanced">
            <summary>Hesap ayrıntıları ve teknik veriler <span>Göster</span></summary>
            <div className="tp-irrigation-result__advanced-body">
              <div className="tp-irrigation-result__metrics">
                <article><span>Mevcut su açığı</span><strong>{millimeters(balance?.currentDeficitMm)}</strong></article>
                <article><span>5 gün sonraki açık</span><strong>{millimeters(balance?.projected5DayDeficitMm)}</strong></article>
                <article><span>Sulama eşiği</span><strong>{millimeters(balance?.stressThresholdMm)}</strong></article>
                <article><span>Son 7 gün yağış</span><strong>{millimeters(rain?.past7DayPrecipitationMm)}</strong></article>
                <article><span>5 günlük yağış tahmini</span><strong>{millimeters(rain?.forecast5DayPrecipitationMm)}</strong></article>
                <article><span>Bitki su katsayısı</span><strong>{num(decision.currentKc, 2)}</strong></article>
              </div>
              <div className="tp-irrigation-result__facts">
                <p><span>Sulama yöntemi</span><strong>{methodLabel(decision.irrigationMethod)}</strong></p>
                <p><span>Son sulama kaydı</span><strong>{balance?.lastIrrigationDate ? dateTr(balance.lastIrrigationDate) : 'Kayıt yok'}</strong></p>
                <p><span>Su stresi</span><strong>{moistureRisk(stress?.riskLevel)}</strong></p>
                <p><span>Karar güveni</span><strong>{confidenceLabel(decision.confidence)}</strong></p>
                {rain?.nextMeaningfulRain && <p><span>Anlamlı yağış</span><strong>{dateTr(rain.nextMeaningfulRain.date)} · {millimeters(rain.nextMeaningfulRain.precipitationMm)}</strong></p>}
              </div>
              {scenario && (
                <div className="tp-irrigation-result__comparison">
                  <strong>İki günlük karşılaştırma</strong>
                  <p>Bugün sularsam: {millimeters(scenario.irrigateToday)}</p>
                  <p>2 gün beklersem: {millimeters(scenario.waitTwoDays)}</p>
                </div>
              )}
              {!isRainfed && <IrrigationEconomicsPanel fieldId={decision.fieldId} decision={decision} />}
              <div className="tp-irrigation-result__evidence">
                <strong>Kararın dayanakları</strong>
                {reasons.length ? <ul>{reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul> : <p>Ek teknik açıklama yok.</p>}
                <p>pyfao56 · Dual-Kc: {model?.status === 'ready'
                  ? model.agreement === 'supportive' ? 'Kararı destekliyor' : model.agreement === 'divergent' ? 'Farklı sonuç; saha kontrolü gerekli' : 'Kanıt mevcut'
                  : 'Ek kanıt bekleniyor'}</p>
                <p>AquaCrop sezon modeli: {seasonModel?.status === 'ready' ? 'Kanıt mevcut' : 'Veri/kanıt bekleniyor'}</p>
                {validation && <p>Saha doğrulaması: {validation.consecutiveSupportiveRuns}/{validation.requiredSupportiveRuns} gün · {validation.hasVerifiedSoilWaterEvidence ? 'Nem kanıtı var' : 'Nem ölçümü gerekli'}</p>}
              </div>
              <p className="tp-irrigation-result__disclaimer">Gösterilen mm, kök bölgesi için tahmini net su ihtiyacıdır; sulama sistemi kayıpları bu değere dahil değildir. Ölçüm ve sulama kayıtlarıyla doğrulanmalıdır.</p>
            </div>
          </details>
        </>
      )}

      {decision.missing?.length && onOpenDataEntry && !needsData && (
        <button type="button" className="tp-irrigation-result__text-action" onClick={onOpenDataEntry}>Eksik saha kayıtlarını Veri Girişi’nde tamamla</button>
      )}
      {needsData && <p className="tp-irrigation-result__disclaimer">Eksik veriye rağmen kesin sulama tarihi veya miktarı gösterilmez.</p>}
    </div>
  );
}
