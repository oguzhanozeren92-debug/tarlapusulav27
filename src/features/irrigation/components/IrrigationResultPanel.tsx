import IrrigationEconomicsPanel from '../../irrigation-economics/components/IrrigationEconomicsPanel';
import WaterScarcityPlanPanel from '../../water-scarcity/components/WaterScarcityPlanPanel';
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

function mm(value: unknown) {
  if (value === null || value === undefined || value === '') return 'Veri yok';
  const n = Number(value);
  return Number.isFinite(n)
    ? `${n.toLocaleString('tr-TR', { maximumFractionDigits: 1 })} mm`
    : 'Veri yok';
}
function trDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' }).format(d) : value;
}
function methodLabel(value: unknown) {
  const text = String(value ?? '').toLocaleLowerCase('tr-TR');
  if (text.includes('drip') || text.includes('damla')) return 'Damla';
  if (text.includes('sprink') || text.includes('yağmur')) return 'Yağmurlama';
  if (text.includes('furrow') || text.includes('karık')) return 'Karık';
  if (text.includes('flood') || text.includes('salma')) return 'Salma';
  return value ? String(value) : 'Belirtilmedi';
}
function riskLabel(value: unknown) {
  if (value === 'high') return 'Yüksek';
  if (value === 'elevated') return 'Artıyor';
  if (value === 'normal') return 'Düşük';
  return 'Hesaplanamadı';
}

export default function IrrigationResultPanel({
  decision,
  whatIf,
  status,
  error,
  onOpenDataEntry,
  onAddIrrigationRecord,
}: Props) {
  if (!decision) {
    return (
      <section className="tp-irrigation-result empty">
        <strong>{status === 'loading' ? 'Sulama hesabı hazırlanıyor…' : status === 'error' ? 'Sulama sonucu alınamadı' : 'Sulama sonucu için veri gerekiyor'}</strong>
        <p>{error || 'Hava, ürün ve saha kayıtları yeterli olduğunda karar burada tek ekranda oluşur.'}</p>
        {onOpenDataEntry ? <button type="button" onClick={onOpenDataEntry}>Eksik bilgileri Veri Girişi’nde tamamla</button> : null}
      </section>
    );
  }

  const balance = decision.waterBalance;
  const missing = new Set(Array.isArray(decision.missing) ? decision.missing : []);
  const needsIrrigationRecord =
    decision.irrigationStatus !== 'rainfed' &&
    (missing.has('last_irrigation') || missing.has('last_irrigation_amount'));
  const needsData = decision.decision === 'needs_data';

  const stress = decision.rainfedStress;
  const rain = decision.rainSummary;
  const forecast = Array.isArray(decision.forecast) ? decision.forecast.slice(0, 5) : [];
  const reasons = Array.isArray(decision.reasons) ? decision.reasons.filter(Boolean).slice(0, 5) : [];
  const model = decision.modelEvidence;
  const seasonModel = decision.seasonModelEvidence;
  const validation = model?.promotionGate?.validationHistory;
  const todayScenario = whatIf?.status === 'ready' ? whatIf.metrics.find((item) => item.key === 'deficit_after_2d') : null;
  const irrigationCalendarDate =
    decision.decision === 'irrigate_now'
      ? calendarDateAfterDays(0)
      : decision.decision === 'irrigation_approaching' &&
          Number.isFinite(Number(balance?.daysToStressThreshold))
        ? calendarDateAfterDays(Math.max(1, Math.ceil(Number(balance?.daysToStressThreshold))))
        : null;

  return (
    <div className="tp-irrigation-result">
      <section className="tp-irrigation-result-hero">
        <span>BUGÜNKÜ SULAMA KARARI</span>
        <strong>{decision.display?.headline || 'Sulama durumu hazır'}</strong>
        <p>{decision.display?.summary || 'Su dengesi, yağış ve bitki ihtiyacı birlikte değerlendirildi.'}</p>
        {decision.display?.action ? <em>{decision.display.action}</em> : null}

        {needsData && needsIrrigationRecord && onAddIrrigationRecord ? (
          <button
            type="button"
            className="tp-irrigation-result-missing-action"
            onClick={onAddIrrigationRecord}
          >
            <span>Eksik kayıt</span>
            <strong>Son sulama tarihini ve verilen su miktarını ekle</strong>
            <small>Kayıt sonrası su açığı ve önerilen su otomatik yeniden hesaplanır.</small>
          </button>
        ) : needsData && onOpenDataEntry ? (
          <button
            type="button"
            className="tp-irrigation-result-missing-action"
            onClick={onOpenDataEntry}
          >
            <span>Eksik veri</span>
            <strong>Sulama için gerekli saha bilgilerini tamamla</strong>
            <small>Eksik kayıtları Veri Girişi sekmesinde göstereceğim.</small>
          </button>
        ) : null}

        {irrigationCalendarDate ? (
          <QuickCalendarButton
            className="tp-irrigation-calendar-action"
            fieldId={decision.fieldId}
            reminderType="Sulama"
            title={decision.decision === 'irrigate_now' ? 'Sulama planı' : 'Yaklaşan sulama kontrolü'}
            reminderDate={irrigationCalendarDate}
            notes={[
              decision.display?.headline,
              decision.display?.summary,
              decision.display?.action,
            ].filter(Boolean).join(' · ')}
            label={decision.decision === 'irrigate_now' ? 'Sulamayı takvime ekle' : 'Sulama kontrolünü takvime ekle'}
          />
        ) : null}
      </section>

      <section className="tp-irrigation-result-kpis">
        <article><span>Mevcut su açığı</span><strong>{mm(balance?.currentDeficitMm)}</strong></article>
        <article><span>5 gün sonra</span><strong>{mm(balance?.projected5DayDeficitMm)}</strong></article>
        <article><span>Önerilen net su</span><strong>{mm(decision.recommendation?.netWaterMm)}</strong></article>
      </section>

      <section className="tp-irrigation-result-facts">
        <div><span>Sulama yöntemi</span><strong>{methodLabel(decision.irrigationMethod)}</strong></div>
        <div><span>Son kayıtlı sulama</span><strong>{balance?.lastIrrigationDate ? trDate(balance.lastIrrigationDate) : 'Kayıt yok'}</strong></div>
        <div><span>Bitki su katsayısı</span><strong>{Number.isFinite(Number(decision.currentKc)) ? Number(decision.currentKc).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) : '—'}</strong></div>
      </section>

      {forecast.length ? (
        <section className="tp-irrigation-result-block">
          <div className="tp-irrigation-result-title"><span>5 GÜNLÜK GİDİŞAT</span><strong>Su açığı ve beklenen yağış</strong></div>
          <div className="tp-irrigation-result-forecast">
            {forecast.map((day) => <article key={day.date}><span>{trDate(day.date)}</span><strong>{mm(day.estimatedDeficitMm)}</strong><small>Yağış {mm(day.precipitationMm)}</small></article>)}
          </div>
        </section>
      ) : null}

      <section className="tp-irrigation-result-two-col">
        <article>
          <span>SON 7 GÜN</span>
          <strong>{mm(rain?.past7DayPrecipitationMm)}</strong>
          <small>Toplam yağış</small>
          <p>{rain?.past7DayCropWaterUseMm != null ? `Tahmini bitki tüketimi ${mm(rain.past7DayCropWaterUseMm)}` : `${rain?.validPastDayCount ?? 0}/7 gün hava verisi`}</p>
        </article>
        <article>
          <span>ÖNÜMÜZDEKİ 5 GÜN</span>
          <strong>{mm(rain?.forecast5DayPrecipitationMm)}</strong>
          <small>Beklenen yağış</small>
          <p>{rain?.forecast5DayCropWaterUseMm != null ? `Tahmini bitki tüketimi ${mm(rain.forecast5DayCropWaterUseMm)}` : `${rain?.validForecastDayCount ?? 0}/5 gün tahmin verisi`}</p>
        </article>
      </section>

      <section className="tp-irrigation-result-status">
        <div>
          <span>SU STRESİ RİSKİ</span>
          <strong>{riskLabel(
            stress?.riskLevel ??
              (balance?.currentDeficitRatio != null
                ? balance.currentDeficitRatio >= 1
                  ? 'high'
                  : balance.currentDeficitRatio >= 0.8
                    ? 'elevated'
                    : 'normal'
                : undefined),
          )}</strong>
        </div>
        {rain?.nextMeaningfulRain ? <div><span>ANLAMLI YAĞIŞ</span><strong>{trDate(rain.nextMeaningfulRain.date)} · {mm(rain.nextMeaningfulRain.precipitationMm)}</strong></div> : null}
      </section>

      <section className="tp-irrigation-result-whatif">
        <span>2 GÜNLÜK KARŞILAŞTIRMA</span>
        {todayScenario ? (
          <div><article><small>Bugün sularsam</small><strong>{mm(todayScenario.irrigateToday)}</strong></article><article><small>2 gün beklersem</small><strong>{mm(todayScenario.waitTwoDays)}</strong></article></div>
        ) : <p>Karşılaştırma için gerçek sulama miktarı / iki günlük tahmin henüz yeterli değil.</p>}
      </section>

      {decision.irrigationStatus !== 'rainfed' ? <IrrigationEconomicsPanel fieldId={decision.fieldId} decision={decision} /> : null}
      {decision.irrigationStatus !== 'rainfed' ? <WaterScarcityPlanPanel fieldId={decision.fieldId} decision={decision} /> : null}

      <details className="tp-irrigation-result-details">
        <summary>Neden böyle söylüyor? · teknik doğrulamayı göster</summary>
        {reasons.length ? <ul>{reasons.map((reason, index) => <li key={`${index}-${reason}`}>{reason}</li>)}</ul> : null}
        <div className="tp-irrigation-result-model-row"><span>pyfao56 · Dual-Kc</span><strong>{model?.status === 'ready' ? (model.agreement === 'supportive' ? 'Kararla uyumlu' : model.agreement === 'divergent' ? 'Farklı sonuç · saha kontrolü' : 'Kanıt hazır') : 'Kanıt bekleniyor'}</strong></div>
        <div className="tp-irrigation-result-model-row"><span>AquaCrop · sezon</span><strong>{seasonModel?.status === 'ready' ? 'Kanıt hazır' : seasonModel?.status === 'blocked' ? 'Gerçek veri eksik' : 'Kanıt bekleniyor'}</strong></div>
        {validation ? <div className="tp-irrigation-result-model-row"><span>Saha doğrulaması</span><strong>{validation.consecutiveSupportiveRuns}/{validation.requiredSupportiveRuns} gün · {validation.hasVerifiedSoilWaterEvidence ? 'nem ölçümü var' : 'nem ölçümü gerekli'}</strong></div> : null}
      </details>

      {decision.missing?.length && onOpenDataEntry ? (
        <button className="tp-irrigation-result-entry-link" type="button" onClick={onOpenDataEntry}>Eksik saha bilgilerini Veri Girişi’nde tamamla</button>
      ) : null}
      <p className="tp-irrigation-result-note">Bu ekran sonuç ekranıdır. Sulama yöntemi, nem ölçümü ve sulama kaydı girişleri Veri Girişi sekmesindedir.</p>
    </div>
  );
}
