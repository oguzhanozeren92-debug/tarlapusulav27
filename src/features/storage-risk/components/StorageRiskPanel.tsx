import { useEffect, useMemo, useState } from 'react';
import type { Field } from '../../../types';
import {
  addStorageObservation,
  createStorageLot,
  loadStorageRiskSnapshot,
} from '../services/storageRisk.service';
import type {
  StorageRiskLevel,
  StorageRiskSnapshot,
} from '../types/storageRisk';

function today() {
  return new Date().toISOString().slice(0, 10);
}

function num(value: string) {
  if (!value.trim()) return null;
  const n = Number(value.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

function riskLabel(level: StorageRiskLevel) {
  if (level === 'high') return 'Yüksek';
  if (level === 'attention') return 'Dikkat';
  if (level === 'low') return 'Düşük';
  return 'Ölçüm gerekli';
}

function riskTone(level: StorageRiskLevel) {
  if (level === 'high') return 'danger';
  if (level === 'attention') return 'warning';
  if (level === 'low') return 'good';
  return 'neutral';
}

export default function StorageRiskPanel({ fields }: { fields: Field[] }) {
  const [snapshot, setSnapshot] = useState<StorageRiskSnapshot | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAddLot, setShowAddLot] = useState(false);
  const [showMeasurement, setShowMeasurement] = useState(false);

  const [crop, setCrop] = useState('');
  const [fieldId, setFieldId] = useState('');
  const [storedAt, setStoredAt] = useState(today());
  const [quantityKg, setQuantityKg] = useState('');
  const [moisture, setMoisture] = useState('');

  const [selectedLot, setSelectedLot] = useState('');
  const [temperature, setTemperature] = useState('');
  const [humidity, setHumidity] = useState('');
  const [obsMoisture, setObsMoisture] = useState('');

  const refresh = async () => {
    try {
      setSnapshot(await loadStorageRiskSnapshot(null));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Depo riski alınamadı.',
      );
    }
  };

  useEffect(() => {
    void refresh();

    const handleUpdated = () => void refresh();
    window.addEventListener('tp:storage-risk-updated', handleUpdated);
    return () => {
      window.removeEventListener('tp:storage-risk-updated', handleUpdated);
    };
  }, []);

  const lots = snapshot?.lots ?? [];

  useEffect(() => {
    if (!selectedLot && lots[0]?.lot.id) {
      setSelectedLot(lots[0].lot.id);
    }
  }, [selectedLot, lots]);

  const summary = useMemo(() => {
    if (!snapshot || snapshot.status === 'no_lots') {
      return {
        label: 'Henüz hasat ürünü yok',
        detail: 'Kayıtlı hasadı aktar veya yeni parti ekle.',
      };
    }

    if (snapshot.riskLevel === 'high') {
      return {
        label: `${snapshot.highRiskLotCount} parti kontrol istiyor`,
        detail: 'Nem ve sıcaklık kayıtlarını aynı gün doğrula.',
      };
    }

    if (snapshot.riskLevel === 'attention') {
      return {
        label: `${snapshot.attentionLotCount} partide dikkat`,
        detail: 'Ölçümleri daha yakın aralıkla takip et.',
      };
    }

    if (snapshot.riskLevel === 'low') {
      return {
        label: 'Depolama koşulları normal',
        detail: `${snapshot.lotCount} aktif parti izleniyor.`,
      };
    }

    return {
      label: 'Ölçüm gerekli',
      detail: 'Ürün nemi veya depo sıcaklık/nem kaydı ekle.',
    };
  }, [snapshot]);

  const handleCreateLot = async () => {
    if (!crop.trim()) return;

    setBusy(true);
    setMessage('');
    try {
      await createStorageLot({
        fieldId: fieldId || null,
        crop,
        storedAt,
        quantityKg: num(quantityKg),
        productMoisturePct: num(moisture),
      });
      setCrop('');
      setQuantityKg('');
      setMoisture('');
      setShowAddLot(false);
      await refresh();
      setMessage('Hasat ürünü depoya eklendi.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Kayıt yapılamadı.');
    } finally {
      setBusy(false);
    }
  };

  const handleAddObservation = async () => {
    if (!selectedLot) return;

    setBusy(true);
    setMessage('');
    try {
      await addStorageObservation({
        lotId: selectedLot,
        temperatureC: num(temperature),
        relativeHumidityPct: num(humidity),
        productMoisturePct: num(obsMoisture),
      });
      setTemperature('');
      setHumidity('');
      setObsMoisture('');
      setShowMeasurement(false);
      await refresh();
      setMessage('Depo ölçümü kaydedildi.');
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : 'Ölçüm kaydedilemedi.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="tp-storage-risk-v4" data-required-plan="premium" data-plan-feature="Depo / Mikotoksin Riski">
      <div className="tp-storage-risk-v4-head">
        <div>
          <span>HASAT ÜRÜNLERİ</span>
          <h2>Depolama güvenliği</h2>
          <p>Nem, sıcaklık ve depolama süresini birlikte takip eder.</p>
        </div>
        <div className={`tp-storage-risk-v4-status ${riskTone(snapshot?.riskLevel ?? 'unknown')}`}>
          <i />
          {riskLabel(snapshot?.riskLevel ?? 'unknown')}
        </div>
      </div>

      <div className="tp-storage-risk-v4-summary">
        <div>
          <strong>{summary.label}</strong>
          <span>{summary.detail}</span>
        </div>
        <button type="button" onClick={() => setShowAddLot((value) => !value)}>
          {showAddLot ? 'Kapat' : '+ Parti ekle'}
        </button>
      </div>

      {showAddLot && (
        <div className="tp-storage-risk-v4-form">
          <label className="wide">
            <span>Ürün</span>
            <input
              placeholder="Örn. buğday"
              value={crop}
              onChange={(event) => setCrop(event.target.value)}
            />
          </label>
          <label>
            <span>Tarla</span>
            <select value={fieldId} onChange={(event) => setFieldId(event.target.value)}>
              <option value="">Tarla bağlantısı yok</option>
              {fields
                .filter((field) => !field.demo)
                .map((field) => (
                  <option key={String(field.id)} value={String(field.id)}>
                    {field.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            <span>Depoya giriş</span>
            <input type="date" value={storedAt} onChange={(event) => setStoredAt(event.target.value)} />
          </label>
          <label>
            <span>Miktar (kg)</span>
            <input inputMode="decimal" placeholder="Örn. 2450" value={quantityKg} onChange={(event) => setQuantityKg(event.target.value)} />
          </label>
          <label>
            <span>İlk ürün nemi (%)</span>
            <input inputMode="decimal" placeholder="Örn. 13,2" value={moisture} onChange={(event) => setMoisture(event.target.value)} />
          </label>
          <button type="button" className="primary" disabled={busy || !crop.trim()} onClick={() => void handleCreateLot()}>
            {busy ? 'Kaydediliyor...' : 'Partiyi Kaydet'}
          </button>
        </div>
      )}

      {lots.length > 0 ? (
        <div className="tp-storage-risk-v4-lots">
          {lots.map((item) => (
            <article key={item.lot.id}>
              <div className="tp-storage-risk-v4-lot-top">
                <div>
                  <small>{item.lot.fieldId ? 'TARLAYA BAĞLI' : 'DEPO PARTİSİ'}</small>
                  <strong>{item.lot.crop}</strong>
                </div>
                <span className={riskTone(item.riskLevel)}>{riskLabel(item.riskLevel)}</span>
              </div>

              <div className="tp-storage-risk-v4-lot-metrics">
                <div>
                  <small>Miktar</small>
                  <strong>{item.lot.quantityKg != null ? `${new Intl.NumberFormat('tr-TR').format(item.lot.quantityKg)} kg` : '—'}</strong>
                </div>
                <div>
                  <small>Ürün nemi</small>
                  <strong>
                    {(item.latestObservation?.productMoisturePct ?? item.lot.productMoisturePct) != null
                      ? `%${(item.latestObservation?.productMoisturePct ?? item.lot.productMoisturePct)?.toFixed(1)}`
                      : 'Ölçülmedi'}
                  </strong>
                </div>
                <div>
                  <small>Depoda</small>
                  <strong>{item.durationDays} gün</strong>
                </div>
              </div>

              <p>{item.action}</p>
            </article>
          ))}

          <button
            type="button"
            className="tp-storage-risk-v4-measure-toggle"
            onClick={() => setShowMeasurement((value) => !value)}
          >
            {showMeasurement ? 'Ölçüm formunu kapat' : '+ Yeni ölçüm ekle'}
          </button>
        </div>
      ) : (
        <div className="tp-storage-risk-v4-empty">
          <strong>Hasat ürünü depolama kaydı yok</strong>
          <span>“Hasattan Getir” ile kayıtlı hasadın buraya otomatik aktarılabilir.</span>
        </div>
      )}

      {showMeasurement && lots.length > 0 && (
        <div className="tp-storage-risk-v4-form measurement">
          <label className="wide">
            <span>Parti</span>
            <select value={selectedLot} onChange={(event) => setSelectedLot(event.target.value)}>
              {lots.map((item) => (
                <option key={item.lot.id} value={item.lot.id}>
                  {item.lot.crop} · {item.lot.storedAt}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Sıcaklık (°C)</span>
            <input inputMode="decimal" value={temperature} onChange={(event) => setTemperature(event.target.value)} />
          </label>
          <label>
            <span>Bağıl nem (%)</span>
            <input inputMode="decimal" value={humidity} onChange={(event) => setHumidity(event.target.value)} />
          </label>
          <label>
            <span>Ürün nemi (%)</span>
            <input inputMode="decimal" value={obsMoisture} onChange={(event) => setObsMoisture(event.target.value)} />
          </label>
          <button type="button" className="primary" disabled={busy || !selectedLot} onClick={() => void handleAddObservation()}>
            {busy ? 'Kaydediliyor...' : 'Ölçümü Kaydet'}
          </button>
        </div>
      )}

      {message && <p className="tp-storage-risk-v4-message">{message}</p>}
      <p className="tp-storage-risk-v4-footnote">
        Çevresel tarama mikotoksin teşhisi değildir; şüpheli üründe laboratuvar doğrulaması gerekir.
      </p>
    </section>
  );
}
