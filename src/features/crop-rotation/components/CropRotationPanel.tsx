import { useEffect, useMemo, useState } from 'react';
import type { Field } from '../../../types';
import { useCropRotationPlan } from '../hooks/useCropRotationPlan';
import type {
  CropRotationPreferences,
  CropRotationWaterPolicy,
} from '../types/cropRotation';
import './CropRotationPanel.css';

type Props = {
  field: Field;
};

function splitCrops(value: string) {
  return value
    .split(/[,;\n]/g)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function waterDemandLabel(value: string) {
  if (value === 'low') return 'Düşük su baskısı';
  if (value === 'medium') return 'Orta su baskısı';
  if (value === 'high') return 'Yüksek su baskısı';
  return 'Su baskısı bilinmiyor';
}

function familyLabel(value: string) {
  const labels: Record<string, string> = {
    cereal: 'Tahıl',
    legume: 'Baklagil',
    oilseed: 'Yağ bitkisi',
    fiber: 'Lif bitkisi',
    root_tuber: 'Kök / yumru',
    industrial: 'Endüstri bitkisi',
    forage: 'Yem bitkisi',
    rice: 'Çeltik',
    other: 'Diğer',
  };
  return labels[value] ?? value;
}

export default function CropRotationPanel({ field }: Props) {
  const rotation = useCropRotationPlan(field);
  const [editorOpen, setEditorOpen] = useState(false);
  const [horizonYears, setHorizonYears] = useState<3 | 4 | 5>(3);
  const [requiredCrops, setRequiredCrops] = useState('');
  const [excludedCrops, setExcludedCrops] = useState('');
  const [waterPolicy, setWaterPolicy] = useState<CropRotationWaterPolicy>('auto');
  const [maxHighWaterYears, setMaxHighWaterYears] = useState('');

  useEffect(() => {
    const preferences = rotation.plan?.preferences;
    if (!preferences) return;
    setHorizonYears(preferences.horizonYears);
    setRequiredCrops(preferences.requiredCrops.join(', '));
    setExcludedCrops(preferences.excludedCrops.join(', '));
    setWaterPolicy(preferences.waterPolicy);
    setMaxHighWaterYears(
      preferences.maxHighWaterYears === null ? '' : String(preferences.maxHighWaterYears),
    );
  }, [rotation.plan?.generatedAt]);

  const planLine = useMemo(
    () => rotation.plan?.plan.map((item) => `${item.year} ${item.cropLabel}`).join(' → ') ?? '',
    [rotation.plan],
  );

  if (field.demo) return null;

  const cropCycle = field.cropCycle ?? 'annual';
  const plan = rotation.plan;

  const save = async () => {
    const parsedMax = maxHighWaterYears.trim() === ''
      ? null
      : Math.max(0, Math.min(horizonYears, Math.round(Number(maxHighWaterYears))));

    const preferences: Partial<CropRotationPreferences> = {
      horizonYears,
      requiredCrops: splitCrops(requiredCrops),
      excludedCrops: splitCrops(excludedCrops),
      waterPolicy,
      maxHighWaterYears: Number.isFinite(parsedMax) ? parsedMax : null,
    };

    const next = await rotation.savePreferences(preferences);
    if (next) setEditorOpen(false);
  };

  return (
    <section className="tp-rotation-card" aria-label="Münavebe ve ekim nöbeti zekâsı" data-required-plan="premium" data-plan-feature="Münavebe / Ekim Nöbeti">
      <div className="tp-rotation-head">
        <div>
          <span>MÜNAVEBE · EKİM NÖBETİ</span>
          <strong>Gelecek sezonları birlikte planla</strong>
        </div>
        {cropCycle === 'annual' && (
          <button type="button" onClick={() => setEditorOpen((value) => !value)}>
            {editorOpen ? 'Kapat' : 'Planı düzenle'}
          </button>
        )}
      </div>

      {cropCycle === 'perennial' ? (
        <div className="tp-rotation-state">
          <strong>Yıllık münavebe bu tarlaya uygulanmıyor</strong>
          <p>Bu tarla çok yıllık ürün olarak kayıtlı. Ürün değiştirme planı yerine bahçe/ağaç yönetimi kullanılır.</p>
        </div>
      ) : rotation.loading && !plan ? (
        <div className="tp-rotation-state">
          <strong>Sezon geçmişi ve saha kayıtları değerlendiriliyor…</strong>
          <p>Ürün ailesi, su, hastalık baskısı, besin ve varsa gerçek ekonomi kanıtı birlikte okunuyor.</p>
        </div>
      ) : rotation.error && !plan ? (
        <div className="tp-rotation-state tp-rotation-state-error">
          <strong>Rotasyon planı alınamadı</strong>
          <p>{rotation.error}</p>
          <button type="button" onClick={() => void rotation.refresh()}>Tekrar dene</button>
        </div>
      ) : plan ? (
        <>
          <div className={`tp-rotation-summary ${plan.status === 'needs_history' ? 'is-caution' : ''}`}>
            <div>
              <span>{plan.status === 'needs_history' ? 'İLK TASLAK' : 'ÖNERİLEN PLAN'}</span>
              <strong>{planLine || plan.summary}</strong>
            </div>
            <small>{plan.historyYears} sezon kaydı · {plan.horizonYears} yıllık ufuk</small>
          </div>

          {plan.plan.length > 0 && (
            <div className="tp-rotation-years">
              {plan.plan.map((item, index) => (
                <article key={`${item.year}-${item.cropKey}`}>
                  <div className="tp-rotation-year-index">{index + 1}</div>
                  <div className="tp-rotation-year-main">
                    <div className="tp-rotation-year-title">
                      <div>
                        <span>{item.year}</span>
                        <strong>{item.cropLabel}</strong>
                      </div>
                      <small>{familyLabel(item.family)} · {waterDemandLabel(item.waterDemand)}</small>
                    </div>
                    <ul>
                      {item.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                    </ul>
                    {item.cautions.length > 0 && (
                      <div className="tp-rotation-caution">
                        {item.cautions.map((caution) => <p key={caution}>{caution}</p>)}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}

          <details className="tp-rotation-evidence">
            <summary>Bu plan neye göre oluştu?</summary>
            <div>
              {plan.evidence.map((item) => <p key={item}>{item}</p>)}
              {plan.warnings.map((item) => <p key={`warning-${item}`} className="warning">{item}</p>)}
              <p>{plan.solver.note}</p>
            </div>
          </details>
        </>
      ) : null}

      {editorOpen && cropCycle === 'annual' && (
        <div className="tp-rotation-editor">
          <label>
            <span>Plan süresi</span>
            <select value={horizonYears} onChange={(event) => setHorizonYears(Number(event.target.value) as 3 | 4 | 5)}>
              <option value={3}>3 yıl</option>
              <option value={4}>4 yıl</option>
              <option value={5}>5 yıl</option>
            </select>
          </label>

          <label>
            <span>Zorunlu ürünler</span>
            <input
              value={requiredCrops}
              onChange={(event) => setRequiredCrops(event.target.value)}
              placeholder="Örn. nohut, ayçiçeği"
            />
            <small>Virgülle ayır. Plan bu ürünlerin her birini en az bir kez içermek zorunda olur.</small>
          </label>

          <label>
            <span>Hariç tutulan ürünler</span>
            <input
              value={excludedCrops}
              onChange={(event) => setExcludedCrops(event.target.value)}
              placeholder="Örn. mısır, patates"
            />
          </label>

          <label>
            <span>Su önceliği</span>
            <select value={waterPolicy} onChange={(event) => setWaterPolicy(event.target.value as CropRotationWaterPolicy)}>
              <option value="auto">Otomatik · tarla kaydına göre</option>
              <option value="conservative">Su tasarruflu plan</option>
              <option value="unrestricted">Su baskısını sınırlama</option>
            </select>
          </label>

          <label>
            <span>Yüksek su isteyen ürün yılı üst sınırı</span>
            <input
              inputMode="numeric"
              value={maxHighWaterYears}
              onChange={(event) => setMaxHighWaterYears(event.target.value.replace(/[^0-9]/g, '').slice(0, 1))}
              placeholder="Sınır yok"
            />
          </label>

          <div className="tp-rotation-editor-actions">
            <button type="button" className="secondary" onClick={() => setEditorOpen(false)}>İptal</button>
            <button type="button" className="primary" disabled={rotation.saving} onClick={() => void save()}>
              {rotation.saving ? 'Kaydediliyor…' : 'Planı yeniden hesapla'}
            </button>
          </div>
          {rotation.error && <p className="tp-rotation-editor-error">{rotation.error}</p>}
        </div>
      )}

      <div className="tp-rotation-footnote">
        <strong>Planlama sınırı:</strong>
        <span>Bu ekran ürün sıralaması planlar; gübre dozu, sulama miktarı, hastalık teşhisi veya kâr garantisi üretmez.</span>
      </div>
    </section>
  );
}
