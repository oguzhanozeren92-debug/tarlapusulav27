import { useEffect, useMemo, useState } from 'react';
import { MapPinned, RefreshCw, Trash2 } from 'lucide-react';
import type { Field } from '../../../types';
import { useEarthSearchNdvi } from '../../home-map/hooks/useEarthSearchNdvi';
import { useOrchardTrackingZones } from '../hooks/useOrchardTrackingZones';
import {
  buildOrchardTrackingZoneInsight,
  deleteOrchardTrackingZone,
  dispatchOrchardTrackingZonesChanged,
  ORCHARD_TRACKING_ZONE_SELECT_EVENT,
} from '../services/orchardTrackingZone.service';
import type { OrchardTrackingZoneRecord } from '../types/orchardTrackingZone';
import './OrchardTrackingZonesPanel.css';

type Props = { field: Field };

function areaLabel(areaM2: number) {
  const da = Number(areaM2) / 1000;
  return `${da.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} da`;
}

function treeSourceLabel(zone: OrchardTrackingZoneRecord) {
  if (zone.estimatedTreeCount == null) return 'Ağaç sayısı girilmedi';
  if (zone.treeCountSource === 'manual') return `≈ ${zone.estimatedTreeCount.toLocaleString('tr-TR')} ağaç · kullanıcı tahmini`;
  if (zone.treeCountSource === 'spacing') return `≈ ${zone.estimatedTreeCount.toLocaleString('tr-TR')} ağaç · alan + dikim aralığı`;
  if (zone.treeCountSource === 'image') return `≈ ${zone.estimatedTreeCount.toLocaleString('tr-TR')} ağaç · görüntü tahmini`;
  return `≈ ${zone.estimatedTreeCount.toLocaleString('tr-TR')} ağaç`;
}

function shortDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value.slice(0, 10);
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function statusLabel(status: string) {
  if (status === 'attention') return 'Önce kontrol et';
  if (status === 'watch') return 'Takip et';
  if (status === 'stronger') return 'Tarla ortalamasının üzerinde';
  if (status === 'similar') return 'Tarla geneline yakın';
  return 'Uydu yorumu bekleniyor';
}

export default function OrchardTrackingZonesPanel({ field }: Props) {
  const fieldId = String(field?.id ?? '').trim();
  const enabled = Boolean(
    fieldId &&
    !field?.demo &&
    (field?.cropCycle ?? 'annual') === 'perennial',
  );
  const zonesState = useOrchardTrackingZones(fieldId, enabled);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!zonesState.zones.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !zonesState.zones.some((item) => item.id === selectedId)) {
      setSelectedId(zonesState.zones[0].id);
    }
  }, [zonesState.zones, selectedId]);

  useEffect(() => {
    const onSelectZone = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      const requestedFieldId = String(detail.fieldId ?? '').trim();
      const zoneId = String(detail.zoneId ?? '').trim();
      if (requestedFieldId && requestedFieldId !== fieldId) return;
      if (zoneId) setSelectedId(zoneId);
    };
    window.addEventListener(
      ORCHARD_TRACKING_ZONE_SELECT_EVENT,
      onSelectZone as EventListener,
    );
    return () => {
      window.removeEventListener(
        ORCHARD_TRACKING_ZONE_SELECT_EVENT,
        onSelectZone as EventListener,
      );
    };
  }, [fieldId]);

  const selectedZone = useMemo(
    () => zonesState.zones.find((item) => item.id === selectedId) ?? null,
    [zonesState.zones, selectedId],
  );

  const fieldNdvi = useEarthSearchNdvi({
    fieldKey: enabled ? `orchard-zone-field:${fieldId}` : '',
    parcelGeometry: field?.parcelGeometry,
    imageDate: null,
    enabled: Boolean(enabled && zonesState.zones.length),
  });

  const zoneNdvi = useEarthSearchNdvi({
    fieldKey: selectedZone ? `orchard-zone:${fieldId}:${selectedZone.id}` : '',
    parcelGeometry: selectedZone?.geometry,
    imageDate: fieldNdvi.data?.datetime ?? null,
    enabled: Boolean(enabled && selectedZone),
  });

  const insight = useMemo(
    () => selectedZone
      ? buildOrchardTrackingZoneInsight({
          zone: selectedZone,
          zoneNdvi: zoneNdvi.data,
          fieldNdvi: fieldNdvi.data,
        })
      : null,
    [selectedZone, zoneNdvi.data, fieldNdvi.data],
  );

  if (!enabled) return null;

  const focusOnMap = (zone: OrchardTrackingZoneRecord) => {
    window.dispatchEvent(
      new CustomEvent('tp:home-map-show-pusula-area', {
        detail: {
          fieldId,
          layer: 'vegetation',
          importantArea: {
            area: zone.name,
            geometry: zone.geometry,
          },
          spatial: null,
        },
      }),
    );
  };

  const removeZone = async (zone: OrchardTrackingZoneRecord) => {
    if (!window.confirm(`“${zone.name}” takip alanını silmek istiyor musun?`)) return;
    setDeletingId(zone.id);
    try {
      await deleteOrchardTrackingZone(zone);
      dispatchOrchardTrackingZonesChanged(fieldId);
      await zonesState.refresh();
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Takip alanı silinemedi.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="tp-orchard-zones-card" aria-label="Bahçe takip alanları">
      <header className="tp-orchard-zones-head">
        <div>
          <span>BAHÇE TAKİP ALANLARI</span>
          <strong>Bahçede önce nereye bakmalısın?</strong>
          <small>Haritadaki + / − düğmelerinin altındaki çokgen ikonundan istediğin bölgeyi serbestçe çiz.</small>
        </div>
        <button type="button" onClick={() => void zonesState.refresh()} disabled={zonesState.loading} aria-label="Takip alanlarını yenile">
          <RefreshCw size={16} />
        </button>
      </header>

      {zonesState.error ? (
        <div className="tp-orchard-zones-state error">{zonesState.error}</div>
      ) : zonesState.loading && !zonesState.zones.length ? (
        <div className="tp-orchard-zones-state">Takip alanları yükleniyor…</div>
      ) : !zonesState.zones.length ? (
        <div className="tp-orchard-zones-empty">
          <MapPinned size={23} />
          <div>
            <strong>Henüz takip alanı çizmedin</strong>
            <p>Haritadan çokgen şeklinde bir bölge seç, “Dere Kenarı” veya “Güneybatı” gibi isim ver. Pusula yorumu yalnız o poligonun gerçek uydu piksellerinden üretilecek.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="tp-orchard-zones-list" role="list">
            {zonesState.zones.map((zone) => (
              <button
                type="button"
                role="listitem"
                key={zone.id}
                className={selectedId === zone.id ? 'active' : ''}
                onClick={() => setSelectedId(zone.id)}
              >
                <span>{zone.name}</span>
                <strong>{areaLabel(zone.areaM2)}</strong>
                <small>{treeSourceLabel(zone)}</small>
              </button>
            ))}
          </div>

          {selectedZone ? (
            <div className="tp-orchard-zone-detail">
              <div className="tp-orchard-zone-detail-head">
                <div>
                  <span>SEÇİLİ BÖLGE</span>
                  <strong>{selectedZone.name}</strong>
                  <small>{areaLabel(selectedZone.areaM2)} · {treeSourceLabel(selectedZone)}</small>
                </div>
                <div className="tp-orchard-zone-actions">
                  <button type="button" onClick={() => focusOnMap(selectedZone)} title="Haritada göster"><MapPinned size={16} /></button>
                  <button type="button" onClick={() => void removeZone(selectedZone)} disabled={deletingId === selectedZone.id} title="Takip alanını sil"><Trash2 size={16} /></button>
                </div>
              </div>

              <div className={`tp-orchard-zone-pusula ${insight?.status ?? 'insufficient'}`}>
                <span>PUSULA YORUMU · {insight ? statusLabel(insight.status) : 'Hazırlanıyor'}</span>
                <strong>{insight?.headline ?? `${selectedZone.name} analiz ediliyor…`}</strong>
                <p>
                  {zoneNdvi.status === 'loading' || fieldNdvi.status === 'loading'
                    ? 'Seçili poligon ile tarla geneli aynı Sentinel-2 görüntüsü üzerinde karşılaştırılıyor…'
                    : insight?.summary ?? 'Bölgesel analiz hazırlanıyor.'}
                </p>
              </div>

              {insight ? (
                <div className="tp-orchard-zone-metrics">
                  <article><span>Bölge NDVI</span><strong>{insight.zoneNdviMean == null ? '—' : insight.zoneNdviMean.toFixed(2)}</strong></article>
                  <article><span>Tarla NDVI</span><strong>{insight.fieldNdviMean == null ? '—' : insight.fieldNdviMean.toFixed(2)}</strong></article>
                  <article><span>Fark</span><strong>{insight.difference == null ? '—' : `${insight.difference >= 0 ? '+' : ''}${insight.difference.toFixed(2)}`}</strong></article>
                  <article><span>Uydu tarihi</span><strong>{shortDate(insight.satelliteDate)}</strong></article>
                </div>
              ) : null}

              <details className="tp-orchard-zone-evidence">
                <summary>Bu yorumu neye göre yaptı?</summary>
                {insight?.evidence.map((item) => <p key={item}>{item}</p>)}
                {insight?.warnings.map((item) => <p className="warning" key={item}>{item}</p>)}
                <p>Bu yorum yalnız seçtiğin poligonun uydu ölçümünü tarla geneliyle karşılaştırır; hastalık veya besin eksikliği teşhisi değildir.</p>
              </details>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
