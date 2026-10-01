import { useEffect, useMemo, useState } from 'react';
import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import { useWaterScarcityPlanContext } from '../hooks/useWaterScarcityPlanContext';
import { saveFieldWaterBudget } from '../services/waterScarcityPlan.service';
import type { WaterSourceType } from '../types/waterScarcity';

const CSS = String.raw`
.tp-water-scarcity{margin-top:10px;padding:14px;border:1px solid rgba(255,255,255,.12);border-radius:18px;background:#0b0b0b;color:#fff}
.tp-water-scarcity-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}
.tp-water-scarcity-head small,.tp-water-scarcity-grid small,.tp-water-scarcity-form label{color:#b9b9b9;font-size:9px;font-weight:850;letter-spacing:.09em}
.tp-water-scarcity-head h4{margin:5px 0 0;font-size:15px;color:#fff}
.tp-water-scarcity-badge{flex:0 0 auto;padding:6px 9px;border:1px solid rgba(255,255,255,.20);border-radius:999px;background:#151515;color:#fff;font-size:9px;font-weight:900}
.tp-water-scarcity p{margin:9px 0 0;color:#a5a5a5;font-size:10px;line-height:1.45}
.tp-water-scarcity-action{padding:10px 11px;border-radius:13px;background:#151515;color:#f3f3f3!important}
.tp-water-scarcity-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:10px}
.tp-water-scarcity-grid article{padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:13px;background:#101010}
.tp-water-scarcity-grid span{display:block;margin-top:4px;color:#858585;font-size:9px}
.tp-water-scarcity-grid strong{display:block;margin-top:4px;font-size:14px;color:#fff}
.tp-water-scarcity-evidence{margin:10px 0 0;padding:0;list-style:none;display:grid;gap:5px}
.tp-water-scarcity-evidence li{color:#8f8f8f;font-size:9.5px;line-height:1.4;padding-left:12px;position:relative}
.tp-water-scarcity-evidence li:before{content:'•';position:absolute;left:0;color:#fff}
.tp-water-scarcity-toggle{margin-top:10px;width:100%;min-height:38px;border:1px solid rgba(255,255,255,.16);border-radius:12px;background:#151515;color:#fff;font-weight:800;cursor:pointer}
.tp-water-scarcity-form{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}
.tp-water-scarcity-form label{display:grid;gap:5px;letter-spacing:0}
.tp-water-scarcity-form label.wide{grid-column:1/-1}
.tp-water-scarcity-form input,.tp-water-scarcity-form select,.tp-water-scarcity-form textarea{width:100%;border:1px solid rgba(255,255,255,.14);border-radius:10px;background:#111;color:#fff;padding:9px 10px;font:inherit;font-size:11px}
.tp-water-scarcity-form textarea{min-height:58px;resize:vertical}
.tp-water-scarcity-save{grid-column:1/-1;min-height:40px;border:0;border-radius:12px;background:#fff;color:#000;font-weight:900;cursor:pointer}
.tp-water-scarcity-save:disabled{opacity:.5;cursor:not-allowed}
.tp-water-scarcity-error{color:#ffb3b3!important}
@media(max-width:560px){.tp-water-scarcity-form,.tp-water-scarcity-grid{grid-template-columns:1fr}}
`;

function isoDayOffset(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function numberLabel(value: number | null | undefined, suffix = '') {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${Math.round(value).toLocaleString('tr-TR')}${suffix}`;
}

function stateLabel(value: string) {
  if (value === 'scarcity_plan') return 'SU KITLIĞI PLANI';
  if (value === 'protect_water') return 'SUYU KORU';
  if (value === 'controlled_reduce') return 'KONTROLLÜ AZALT';
  if (value === 'normal') return 'NORMAL';
  if (value === 'not_applicable') return 'UYGULANMIYOR';
  return 'SU BÜTÇESİ GEREKLİ';
}

export default function WaterScarcityPlanPanel({
  fieldId,
  decision,
}: {
  fieldId: string;
  decision: IrrigationDecisionResult;
}) {
  const plan = useWaterScarcityPlanContext({ fieldId, irrigationDecision: decision });
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState({
    periodStart: isoDayOffset(0),
    periodEnd: isoDayOffset(30),
    availableWaterM3: '',
    sourceLabel: '',
    sourceType: 'other' as WaterSourceType,
    maxDailyWaterM3: '',
    notes: '',
  });

  const profile = plan.snapshot?.budget.profile ?? null;

  useEffect(() => {
    if (!profile) return;
    setForm({
      periodStart: profile.periodStart,
      periodEnd: profile.periodEnd,
      availableWaterM3: String(profile.availableWaterM3),
      sourceLabel: profile.sourceLabel ?? '',
      sourceType: profile.sourceType,
      maxDailyWaterM3: profile.maxDailyWaterM3 == null ? '' : String(profile.maxDailyWaterM3),
      notes: profile.notes ?? '',
    });
  }, [profile?.id, profile?.updatedAt]);

  useEffect(() => {
    if (!profile && plan.snapshot?.state === 'needs_data') setEditing(true);
  }, [profile, plan.snapshot?.state]);

  const coverage = plan.snapshot?.irrigation.physicalCoverageRatio;
  const coverageLabel = useMemo(
    () => coverage == null ? '—' : `%${Math.round(Math.max(0, coverage) * 100)}`,
    [coverage],
  );

  async function save() {
    const available = Number(form.availableWaterM3);
    const daily = form.maxDailyWaterM3.trim() ? Number(form.maxDailyWaterM3) : null;
    if (!Number.isFinite(available) || available < 0) {
      setSaveError('Kullanılabilir suyu m³ olarak gir.');
      return;
    }
    if (daily != null && (!Number.isFinite(daily) || daily < 0)) {
      setSaveError('Günlük azami su negatif olamaz.');
      return;
    }

    setSaving(true);
    setSaveError(null);
    try {
      await saveFieldWaterBudget(fieldId, {
        periodStart: form.periodStart,
        periodEnd: form.periodEnd,
        availableWaterM3: available,
        sourceLabel: form.sourceLabel,
        sourceType: form.sourceType,
        maxDailyWaterM3: daily,
        notes: form.notes,
      });
      setEditing(false);
      plan.refresh();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Su bütçesi kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  }

  const snapshot = plan.snapshot;

  return (
    <>
      <style>{CSS}</style>
      <section className="tp-water-scarcity">
        <div className="tp-water-scarcity-head">
          <div>
            <small>23 · SU KAYNAĞI ÖNCELİĞİ</small>
            <h4>{snapshot?.headline ?? (plan.loading ? 'Su planı hazırlanıyor' : 'Su Kıtlığı Planı')}</h4>
          </div>
          <span className="tp-water-scarcity-badge">
            {plan.loading ? 'HESAPLANIYOR' : stateLabel(snapshot?.state ?? 'needs_data')}
          </span>
        </div>

        {plan.error ? <p className="tp-water-scarcity-error">{plan.error}</p> : null}
        {snapshot ? <p>{snapshot.summary}</p> : null}
        {snapshot?.action ? <p className="tp-water-scarcity-action">{snapshot.action}</p> : null}

        {snapshot ? (
          <div className="tp-water-scarcity-grid">
            <article>
              <small>KALAN SU</small>
              <strong>{numberLabel(snapshot.budget.remainingWaterM3, ' m³')}</strong>
              <span>{profile ? `${profile.periodStart} → ${profile.periodEnd}` : 'Su bütçesi kayıtlı değil'}</span>
            </article>
            <article>
              <small>PLANLANAN İHTİYAÇ</small>
              <strong>{numberLabel(snapshot.irrigation.grossNeedM3, ' m³')}</strong>
              <span>Kaynakta brüt · randıman biliniyorsa</span>
            </article>
            <article>
              <small>KARŞILAMA</small>
              <strong>{coverageLabel}</strong>
              <span>Optimum eksik sulama yüzdesi değildir</span>
            </article>
            <article>
              <small>FENOLOJİ</small>
              <strong>{snapshot.phenology.stageLabel ?? '—'}</strong>
              <span>Su hassasiyeti: {snapshot.phenology.sensitivity}</span>
            </article>
          </div>
        ) : null}

        {snapshot?.evidence?.length ? (
          <ul className="tp-water-scarcity-evidence">
            {snapshot.evidence.slice(0, 5).map((item) => <li key={item}>{item}</li>)}
          </ul>
        ) : null}

        <button type="button" className="tp-water-scarcity-toggle" onClick={() => setEditing((value) => !value)}>
          {editing ? 'Su bütçesi formunu kapat' : profile ? 'Su bütçesini güncelle' : 'Kullanılabilir suyu gir'}
        </button>

        {editing ? (
          <div className="tp-water-scarcity-form">
            <label>
              Başlangıç
              <input type="date" value={form.periodStart} onChange={(e) => setForm((v) => ({ ...v, periodStart: e.target.value }))} />
            </label>
            <label>
              Bitiş
              <input type="date" value={form.periodEnd} onChange={(e) => setForm((v) => ({ ...v, periodEnd: e.target.value }))} />
            </label>
            <label>
              Kullanılabilir su (m³)
              <input inputMode="decimal" value={form.availableWaterM3} onChange={(e) => setForm((v) => ({ ...v, availableWaterM3: e.target.value }))} placeholder="Örn. 2500" />
            </label>
            <label>
              Günlük azami (m³) · opsiyonel
              <input inputMode="decimal" value={form.maxDailyWaterM3} onChange={(e) => setForm((v) => ({ ...v, maxDailyWaterM3: e.target.value }))} placeholder="Örn. 400" />
            </label>
            <label>
              Kaynak türü
              <select value={form.sourceType} onChange={(e) => setForm((v) => ({ ...v, sourceType: e.target.value as WaterSourceType }))}>
                <option value="well">Kuyu</option>
                <option value="canal">Kanal / şebeke</option>
                <option value="reservoir">Gölet / rezervuar</option>
                <option value="tank">Depo / tank</option>
                <option value="allocation">Tahsis / kota</option>
                <option value="other">Diğer</option>
              </select>
            </label>
            <label>
              Kaynak adı · opsiyonel
              <input value={form.sourceLabel} onChange={(e) => setForm((v) => ({ ...v, sourceLabel: e.target.value }))} placeholder="Örn. 2 no'lu kuyu" />
            </label>
            <label className="wide">
              Not · opsiyonel
              <textarea value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} placeholder="Kota, pompa çalışma sınırı vb." />
            </label>
            {saveError ? <p className="tp-water-scarcity-error wide">{saveError}</p> : null}
            <button type="button" className="tp-water-scarcity-save" disabled={saving} onClick={save}>
              {saving ? 'Kaydediliyor…' : 'SU BÜTÇESİNİ KAYDET'}
            </button>
          </div>
        ) : null}

        <p>
          Kullanılabilir su işletme kaydıdır. Pusula su miktarını tahmin etmez; kayıtlı bütçeyi Production Sulama Motoru ve fenolojiyle birlikte önceliklendirir.
        </p>
      </section>
    </>
  );
}
