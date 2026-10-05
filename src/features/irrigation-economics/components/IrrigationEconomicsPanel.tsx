import { useEffect, useState } from 'react';
import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import {
  loadIrrigationEconomicsSnapshot,
  saveIrrigationEconomicsProfile,
} from '../services/irrigationEconomics.service';
import type { IrrigationEconomicsSnapshot } from '../types/irrigationEconomics';

const CSS = String.raw`
.tp-irrigation-economics-card{margin-top:12px;padding:16px;border:1px solid #dfe3e7;border-radius:20px;background:#fff;color:#15171a;box-shadow:0 6px 22px rgba(27,34,40,.04)}
.tp-irrigation-economics-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.tp-irrigation-economics-kicker{display:block;margin-bottom:4px;color:#7d848d;font-size:9px;font-weight:850;letter-spacing:.11em;text-transform:uppercase}
.tp-irrigation-economics-title{margin:0;color:#111315;font-size:17px;line-height:1.15;font-weight:850}
.tp-irrigation-economics-status{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;min-height:28px;padding:0 10px;border-radius:999px;background:#f1f3f5;color:#34383d;font-size:9px;font-weight:800;white-space:nowrap}
.tp-irrigation-economics-status.is-ready{background:#111315;color:#fff}
.tp-irrigation-economics-summary{display:grid;gap:8px;margin-top:14px}
.tp-irrigation-economics-row{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:14px;min-height:48px;padding:10px 12px;border:1px solid #e4e7ea;border-radius:13px;background:#f7f8f9}
.tp-irrigation-economics-row span{color:#5d646c;font-size:10px;font-weight:700}
.tp-irrigation-economics-row strong{max-width:210px;color:#111315;font-size:11px;line-height:1.25;font-weight:850;text-align:right}
.tp-irrigation-economics-row strong.is-muted{color:#767d85;font-weight:750}
.tp-irrigation-economics-action,.tp-irrigation-economics-save{width:100%;min-height:44px;border:1px solid #050607;border-radius:13px;background:#050607;color:#fff;-webkit-text-fill-color:#fff;font-size:10px;font-weight:850;cursor:pointer}
.tp-irrigation-economics-action{margin-top:12px}
.tp-irrigation-economics-action:disabled,.tp-irrigation-economics-save:disabled{opacity:.55;cursor:default}
.tp-irrigation-economics-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:12px;border-top:1px solid #e6e8eb}
.tp-irrigation-economics-field{display:grid;gap:5px}
.tp-irrigation-economics-field span{color:#697078;font-size:8px;font-weight:800}
.tp-irrigation-economics-field input{width:100%;min-height:39px;padding:0 10px;border:1px solid #d7dce1;border-radius:10px;outline:none;background:#f2f4f6;color:#111315;-webkit-text-fill-color:#111315;font-size:10px;font-weight:750}
.tp-irrigation-economics-field input:focus{border-color:#111315;background:#fff}
.tp-irrigation-economics-save{grid-column:1/-1;min-height:42px;border-radius:11px}
.tp-irrigation-economics-note{margin:10px 2px 0;color:#7a8189;font-size:8.5px;line-height:1.45}
.tp-irrigation-economics-message{margin:8px 0 0;padding:8px 10px;border-radius:10px;background:#f1f3f5;color:#33383d;font-size:8.5px;font-weight:750}
@media(max-width:430px){.tp-irrigation-economics-card{padding:14px;border-radius:18px}.tp-irrigation-economics-form{grid-template-columns:1fr}.tp-irrigation-economics-save{grid-column:1}.tp-irrigation-economics-row strong{max-width:160px}}
`;

function numberOrNull(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function trNumber(value: number, maximumFractionDigits = 1) {
  return value.toLocaleString('tr-TR', { maximumFractionDigits });
}

export default function IrrigationEconomicsPanel({
  fieldId,
  decision,
}: {
  fieldId: string;
  decision: IrrigationDecisionResult;
}) {
  const [snapshot, setSnapshot] = useState<IrrigationEconomicsSnapshot | null>(null);
  const [efficiency, setEfficiency] = useState('');
  const [power, setPower] = useState('');
  const [flow, setFlow] = useState('');
  const [price, setPrice] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = async () => {
    const next = await loadIrrigationEconomicsSnapshot(fieldId, decision);
    setSnapshot(next);
    setEfficiency(next.profile.irrigationEfficiencyPct?.toString() ?? '');
    setPower(next.profile.pumpPowerKw?.toString() ?? '');
    setFlow(next.profile.pumpFlowM3Hour?.toString() ?? '');
    setPrice(next.profile.energyPriceTryKwh?.toString() ?? '');
  };

  useEffect(() => {
    void refresh();
  }, [fieldId, decision.generatedAt]);

  const hasCompletePumpProfile = Boolean(
    snapshot?.profile.irrigationEfficiencyPct &&
      snapshot?.profile.pumpPowerKw &&
      snapshot?.profile.pumpFlowM3Hour &&
      snapshot?.profile.energyPriceTryKwh != null,
  );

  const totalWater = snapshot?.recommended.totalGrossWaterM3;
  const energyCost = snapshot?.recommended.energyCostTry;
  const waterProductivity = snapshot?.season.waterProductivityKgM3;
  const statusLabel =
    snapshot?.status === 'ready'
      ? 'Hazır'
      : snapshot?.status === 'not_applicable'
        ? 'Uygulanmaz'
        : 'Bilgi gerekli';

  const saveProfile = async () => {
    setSaving(true);
    setMessage('');
    try {
      await saveIrrigationEconomicsProfile(fieldId, {
        irrigationEfficiencyPct: numberOrNull(efficiency),
        pumpPowerKw: numberOrNull(power),
        pumpFlowM3Hour: numberOrNull(flow),
        energyPriceTryKwh: numberOrNull(price),
        cropPriceTryKg: null,
      });
      await refresh();
      setMessage('Pompa bilgileri kaydedildi.');
      setExpanded(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Bilgiler kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <style>{CSS}</style>
      <section className="tp-irrigation-economics-card" aria-label="Sulama maliyeti">
        <div className="tp-irrigation-economics-head">
          <div>
            <small className="tp-irrigation-economics-kicker">SULAMA EKONOMİSİ</small>
            <h4 className="tp-irrigation-economics-title">Sulama maliyeti</h4>
          </div>
          <span className={`tp-irrigation-economics-status ${snapshot?.status === 'ready' ? 'is-ready' : ''}`}>
            {statusLabel}
          </span>
        </div>

        <div className="tp-irrigation-economics-summary">
          <div className="tp-irrigation-economics-row">
            <span>Toplam su ihtiyacı</span>
            <strong className={totalWater == null ? 'is-muted' : ''}>
              {totalWater != null ? `${trNumber(totalWater, 0)} m³` : 'Pompa bilgilerini tamamla'}
            </strong>
          </div>
          <div className="tp-irrigation-economics-row">
            <span>Enerji maliyeti</span>
            <strong className={energyCost == null ? 'is-muted' : ''}>
              {energyCost != null ? `${trNumber(energyCost, 0)} TL` : 'Henüz hesaplanmadı'}
            </strong>
          </div>
          <div className="tp-irrigation-economics-row">
            <span>Su verimliliği</span>
            <strong className={waterProductivity == null ? 'is-muted' : ''}>
              {waterProductivity != null ? `${trNumber(waterProductivity, 2)} kg/m³` : 'Sezon sonunda hesaplanır'}
            </strong>
          </div>
        </div>

        <button
          type="button"
          className="tp-irrigation-economics-action"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded
            ? 'Bilgileri Kapat'
            : hasCompletePumpProfile
              ? 'Pompa Bilgilerini Düzenle'
              : 'Pompa Bilgilerini Tamamla'}
        </button>

        {expanded ? (
          <div className="tp-irrigation-economics-form">
            <label className="tp-irrigation-economics-field">
              <span>Sulama randımanı (%)</span>
              <input inputMode="decimal" placeholder="Örn. 80" value={efficiency} onChange={(event) => setEfficiency(event.target.value)} />
            </label>
            <label className="tp-irrigation-economics-field">
              <span>Pompa gücü (kW)</span>
              <input inputMode="decimal" placeholder="Örn. 15" value={power} onChange={(event) => setPower(event.target.value)} />
            </label>
            <label className="tp-irrigation-economics-field">
              <span>Pompa debisi (m³/saat)</span>
              <input inputMode="decimal" placeholder="Örn. 45" value={flow} onChange={(event) => setFlow(event.target.value)} />
            </label>
            <label className="tp-irrigation-economics-field">
              <span>Elektrik fiyatı (TL/kWh)</span>
              <input inputMode="decimal" placeholder="Örn. 3,25" value={price} onChange={(event) => setPrice(event.target.value)} />
            </label>
            <button type="button" className="tp-irrigation-economics-save" disabled={saving} onClick={() => void saveProfile()}>
              {saving ? 'Kaydediliyor…' : 'Bilgileri Kaydet'}
            </button>
          </div>
        ) : null}

        <p className="tp-irrigation-economics-note">
          Su verimliliği, gerçek sulama ve hasat kayıtları oluştuğunda otomatik hesaplanır.
        </p>
        {message ? <p className="tp-irrigation-economics-message">{message}</p> : null}
      </section>
    </>
  );
}
