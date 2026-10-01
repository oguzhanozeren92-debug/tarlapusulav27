import { useMemo, useState } from 'react';
import { saveFieldSensorDevice } from '../services/microclimateSensor.service';
import { useMicroclimateSensorContext } from '../hooks/useMicroclimateSensorContext';

const CSS = String.raw`
.tp-micro-sensor{margin-top:12px;border:1px solid #d9dde1;border-radius:18px;background:#fff;color:#111;overflow:hidden;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.tp-micro-sensor-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;padding:14px 15px;border-bottom:1px solid #e7e9ec;background:#0b0b0b;color:#fff}
.tp-micro-sensor-head small{display:block;font-size:8px;font-weight:900;letter-spacing:.08em;color:#c8c8c8}.tp-micro-sensor-head strong{display:block;margin-top:3px;font-size:14px}.tp-micro-sensor-head span{font-size:9px;color:#c7c7c7}
.tp-micro-sensor-body{padding:12px 14px}.tp-micro-sensor-summary{margin:0;color:#42474d;font-size:10px;line-height:1.45}
.tp-micro-sensor-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin-top:10px}.tp-micro-sensor-grid article{padding:9px;border:1px solid #e1e4e7;border-radius:12px;background:#f8f9fa}.tp-micro-sensor-grid small{display:block;font-size:7px;font-weight:850;color:#737a82;letter-spacing:.04em}.tp-micro-sensor-grid strong{display:block;margin-top:4px;font-size:12px;color:#17191b}.tp-micro-sensor-grid em{display:block;margin-top:2px;font-style:normal;font-size:7px;color:#8a9097}
.tp-micro-sensor-alert{margin-top:9px;padding:9px 10px;border:1px solid #111;border-radius:11px;background:#111;color:#fff;font-size:9px;line-height:1.4}.tp-micro-sensor-devices{margin-top:10px;display:grid;gap:6px}.tp-micro-sensor-device{display:flex;justify-content:space-between;gap:8px;padding:8px 9px;border:1px solid #e2e5e8;border-radius:10px;background:#fff}.tp-micro-sensor-device b{font-size:9px}.tp-micro-sensor-device span{font-size:8px;color:#747b82}
.tp-micro-sensor details{margin-top:10px;border-top:1px solid #eceef0;padding-top:9px}.tp-micro-sensor summary{cursor:pointer;font-size:9px;font-weight:850;color:#202326}.tp-micro-sensor-form{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.tp-micro-sensor-form label{display:grid;gap:3px;font-size:7px;font-weight:800;color:#6d747b}.tp-micro-sensor-form input,.tp-micro-sensor-form select{height:32px;border:1px solid #d9dde1;border-radius:8px;background:#fff;color:#111;padding:0 8px;font-size:9px}.tp-micro-sensor-form .wide{grid-column:1/-1}.tp-micro-sensor-save{grid-column:1/-1;height:34px;border:0;border-radius:9px;background:#111;color:#fff;font-size:9px;font-weight:900;cursor:pointer}.tp-micro-sensor-note{margin-top:7px;color:#8a9097;font-size:7px;line-height:1.35}.tp-micro-sensor-error{margin-top:7px;color:#9b2e2e;font-size:8px}
@media(max-width:560px){.tp-micro-sensor-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.tp-micro-sensor-form{grid-template-columns:1fr}.tp-micro-sensor-form .wide,.tp-micro-sensor-save{grid-column:1}}
`;

function numberLabel(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(value) ? '—' : `${Number(value).toFixed(1)}${suffix}`;
}

function freshnessLabel(value: string) {
  if (value === 'fresh') return 'Canlı';
  if (value === 'stale') return 'Eski';
  if (value === 'offline') return 'Çevrimdışı';
  return 'Veri yok';
}

export default function MicroclimateSensorPanel({ fieldId }: { fieldId: string | number | null | undefined }) {
  const normalizedFieldId = String(fieldId ?? '').trim();
  const sensor = useMicroclimateSensorContext(normalizedFieldId);
  const [name, setName] = useState('Tarla sensörü');
  const [uid, setUid] = useState('');
  const [protocol, setProtocol] = useState<'mqtt' | 'http' | 'manual'>('mqtt');
  const [depthFrom, setDepthFrom] = useState('');
  const [depthTo, setDepthTo] = useState('');
  const [pressureMin, setPressureMin] = useState('');
  const [pressureMax, setPressureMax] = useState('');
  const [flowMin, setFlowMin] = useState('');
  const [flowMax, setFlowMax] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const latest = sensor.snapshot?.latest ?? null;
  const topic = useMemo(() => uid.trim() ? `tarlapusula/${uid.trim()}/telemetry` : 'tarlapusula/<cihaz-kimliği>/telemetry', [uid]);

  const toNumber = (value: string) => value.trim() === '' ? null : Number(value);

  const save = async () => {
    if (!normalizedFieldId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await saveFieldSensorDevice(normalizedFieldId, {
        deviceUid: uid,
        name,
        protocol,
        soilDepthFromCm: toNumber(depthFrom),
        soilDepthToCm: toNumber(depthTo),
        expectedPressureMinKpa: toNumber(pressureMin),
        expectedPressureMaxKpa: toNumber(pressureMax),
        expectedFlowMinLMin: toNumber(flowMin),
        expectedFlowMaxLMin: toNumber(flowMax),
      });
      setUid('');
      await sensor.refresh();
    } catch (reason) {
      setSaveError(reason instanceof Error ? reason.message : 'Sensör kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  if (!normalizedFieldId) return null;

  return (
    <section className="tp-micro-sensor">
      <style>{CSS}</style>
      <div className="tp-micro-sensor-head">
        <div>
          <small>MİKROİKLİM + SENSÖR</small>
          <strong>{sensor.snapshot?.headline ?? (sensor.loading ? 'Sensörler okunuyor…' : 'Sensör bağlı değil')}</strong>
        </div>
        <span>{sensor.snapshot ? `${sensor.snapshot.liveDeviceCount}/${sensor.snapshot.deviceCount} canlı` : 'Opsiyonel'}</span>
      </div>

      <div className="tp-micro-sensor-body">
        <p className="tp-micro-sensor-summary">
          {sensor.snapshot?.summary ?? 'Sensör bağlanırsa gerçek saha sıcaklığı, nem, toprak nemi, debi ve basınç Pusula kararlarına ek kanıt olur. Sensör yoksa sistem mevcut veri kaynaklarıyla çalışmaya devam eder.'}
        </p>

        {latest ? (
          <div className="tp-micro-sensor-grid">
            <article><small>SAHA SICAKLIĞI</small><strong>{numberLabel(latest.airTemperatureC, ' °C')}</strong><em>{new Date(latest.observedAt).toLocaleString('tr-TR')}</em></article>
            <article><small>BAĞIL NEM</small><strong>{numberLabel(latest.relativeHumidityPct, '%')}</strong><em>Gerçek sensör</em></article>
            <article><small>TOPRAK NEMİ</small><strong>{latest.soilMoistureVwc == null ? '—' : `${(latest.soilMoistureVwc * 100).toFixed(1)}% VWC`}</strong><em>Sulama motoruna aynalanır</em></article>
            <article><small>YAPRAK ISLAKLIĞI</small><strong>{numberLabel(latest.leafWetnessPct, '%')}</strong><em>Mikroiklim kanıtı</em></article>
            <article><small>HAT BASINCI</small><strong>{numberLabel(latest.pressureKpa, ' kPa')}</strong><em>22. maddeyi destekler</em></article>
            <article><small>DEBİ</small><strong>{numberLabel(latest.flowLMin, ' L/dk')}</strong><em>22. maddeyi destekler</em></article>
          </div>
        ) : null}

        {sensor.snapshot?.rangeAlerts.length ? (
          <div className="tp-micro-sensor-alert">
            {sensor.snapshot.rangeAlerts.length} debi/basınç ölçümü cihaz için tanımlanan beklenen aralığın dışında. Pusula bunu arıza teşhisi değil, saha kontrol kanıtı olarak kullanır.
          </div>
        ) : null}

        {sensor.snapshot?.devices.length ? (
          <div className="tp-micro-sensor-devices">
            {sensor.snapshot.devices.map((state) => (
              <div key={state.device.id} className="tp-micro-sensor-device">
                <b>{state.device.name}</b>
                <span>{freshnessLabel(state.freshness)}{state.ageMinutes != null ? ` · ${Math.round(state.ageMinutes)} dk` : ''}</span>
              </div>
            ))}
          </div>
        ) : null}

        <details>
          <summary>Sensör / MQTT cihazı tanımla</summary>
          <div className="tp-micro-sensor-form">
            <label>Ad<input value={name} onChange={(e) => setName(e.target.value)} /></label>
            <label>Cihaz kimliği<input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="örn. esp32-tarla-01" /></label>
            <label>Protokol<select value={protocol} onChange={(e) => setProtocol(e.target.value as any)}><option value="mqtt">MQTT</option><option value="http">HTTP</option><option value="manual">Manuel/Test</option></select></label>
            <label>Toprak derinliği başlangıç (cm)<input inputMode="decimal" value={depthFrom} onChange={(e) => setDepthFrom(e.target.value)} /></label>
            <label>Toprak derinliği bitiş (cm)<input inputMode="decimal" value={depthTo} onChange={(e) => setDepthTo(e.target.value)} /></label>
            <label>Min. basınç kPa<input inputMode="decimal" value={pressureMin} onChange={(e) => setPressureMin(e.target.value)} /></label>
            <label>Maks. basınç kPa<input inputMode="decimal" value={pressureMax} onChange={(e) => setPressureMax(e.target.value)} /></label>
            <label>Min. debi L/dk<input inputMode="decimal" value={flowMin} onChange={(e) => setFlowMin(e.target.value)} /></label>
            <label>Maks. debi L/dk<input inputMode="decimal" value={flowMax} onChange={(e) => setFlowMax(e.target.value)} /></label>
            <label className="wide">MQTT topic<input readOnly value={topic} /></label>
            <button type="button" className="tp-micro-sensor-save" disabled={saving || !uid.trim()} onClick={save}>{saving ? 'Kaydediliyor…' : 'CİHAZI KAYDET'}</button>
          </div>
          <p className="tp-micro-sensor-note">MQTT kullanıcı adı/şifresi uygulamada tutulmaz. Worker/broker tarafında environment secret olarak kalır.</p>
          {saveError ? <p className="tp-micro-sensor-error">{saveError}</p> : null}
        </details>

        {sensor.error ? <p className="tp-micro-sensor-error">{sensor.error}</p> : null}
      </div>
    </section>
  );
}
