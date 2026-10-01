import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

import {
  listFieldObservationPoints,
  updateObservationPointStatus,
} from '../services/fieldObservation.service';

import type {
  FieldObservationPoint,
  FieldObservationPointOverview,
  FieldObservationPointStatus,
  NdviObservationTarget,
} from '../types/fieldObservation';
import type { EarthSearchNdviRelativeZone } from '../../home-map/services/earthSearchNdvi.service';

type Props = {
  open: boolean;
  fieldId: string | null | undefined;
  fieldName: string;
  relativeZones?: EarthSearchNdviRelativeZone[];
  satelliteDate?: string | null;
  onClose: () => void;
  onOpenOnMap: (target: NdviObservationTarget) => void;
  onOpenRelativeArea?: (area: EarthSearchNdviRelativeZone['area']) => void;
  onOpenHistory: (target: NdviObservationTarget) => void;
  onStatusChanged?: (point: FieldObservationPoint) => void;
};

const CSS = String.raw`
.tp-field-tracking-portal{position:fixed!important;inset:0!important;z-index:2147483632!important;width:100vw!important;height:100dvh!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom))!important;box-sizing:border-box!important;isolation:isolate!important}
.tp-field-tracking-backdrop{position:absolute!important;inset:0!important;z-index:0!important;border:0!important;background:rgba(0,0,0,.62)!important;backdrop-filter:blur(5px)!important;-webkit-backdrop-filter:blur(5px)!important}
.tp-field-tracking-sheet{position:relative!important;z-index:1!important;width:min(94vw,620px)!important;max-height:min(88dvh,780px)!important;display:flex!important;flex-direction:column!important;overflow:hidden!important;border:1px solid #d8d8d8!important;border-radius:22px!important;background:#fff!important;color:#111!important;box-shadow:0 30px 90px rgba(0,0,0,.35)!important}
.tp-field-tracking-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:16px;border-bottom:1px solid #e8e8e8;background:#fff}
.tp-field-tracking-kicker{color:#111;font-size:8px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
.tp-field-tracking-head h3{margin:5px 0 0;color:#111;font-size:15px}
.tp-field-tracking-head p{margin:6px 0 0;color:#555;font-size:9px;line-height:1.45}
.tp-field-tracking-close{width:32px;height:32px;flex:0 0 32px;border:1px solid #ddd;border-radius:10px;background:#f7f7f7;color:#111;font-size:19px;cursor:pointer}
.tp-field-tracking-body{min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:14px 16px 16px;background:#fff}
.tp-relative-zone-title{margin:0 0 8px;color:#111;font-size:10px;font-weight:900}
.tp-relative-zone-list{display:grid;gap:8px;margin-bottom:12px}
.tp-relative-zone-card{width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:11px 12px;border:1px solid #dedede;border-radius:13px;background:#fafafa;color:#111;text-align:left;cursor:pointer}
.tp-relative-zone-card:hover{background:#f3f3f3}
.tp-relative-zone-copy{min-width:0;display:grid;gap:3px}
.tp-relative-zone-copy strong{color:#111;font-size:11px}
.tp-relative-zone-copy span{color:#555;font-size:8px;line-height:1.35}
.tp-relative-zone-action{flex:0 0 auto;color:#111;font-size:8px;font-weight:900}
.tp-field-tracking-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px;margin-bottom:11px}
.tp-field-tracking-stat{padding:8px;border:1px solid #e3e3e3;border-radius:11px;background:#fafafa}.tp-field-tracking-stat small{display:block;color:#666;font-size:6.5px;font-weight:850;text-transform:uppercase;letter-spacing:.04em}.tp-field-tracking-stat strong{display:block;margin-top:4px;color:#111;font-size:10px}
.tp-field-tracking-tabs{display:flex;gap:6px;margin:0 0 10px;overflow-x:auto;scrollbar-width:none}.tp-field-tracking-tabs::-webkit-scrollbar{display:none}.tp-field-tracking-tab{min-height:29px;padding:0 9px;border:1px solid #ddd;border-radius:999px;background:#fff;color:#555;font-size:6.8px;font-weight:850;white-space:nowrap;cursor:pointer}.tp-field-tracking-tab.active{border-color:#111;background:#111;color:#fff}
.tp-field-tracking-list{display:grid;gap:8px}.tp-field-tracking-card{display:grid;grid-template-columns:84px minmax(0,1fr);gap:10px;padding:9px;border:1px solid #e1e1e1;border-radius:14px;background:#fff;color:#111}.tp-field-tracking-card.paused{opacity:.82}.tp-field-tracking-card.resolved{opacity:.72}
.tp-field-tracking-thumb{width:84px;height:82px;overflow:hidden;border-radius:10px;border:1px solid #e1e1e1;background:#f5f5f5}.tp-field-tracking-thumb img{width:100%;height:100%;display:block;object-fit:cover}.tp-field-tracking-thumb-empty{width:100%;height:100%;display:grid;place-items:center;padding:8px;box-sizing:border-box;color:#777;font-size:7px;text-align:center}.tp-field-tracking-copy{min-width:0}.tp-field-tracking-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.tp-field-tracking-title{color:#111;font-size:10px;font-weight:900}.tp-field-tracking-state{min-height:18px;display:inline-flex;align-items:center;padding:0 6px;border:1px solid #ddd;border-radius:999px;color:#444;background:#fafafa;font-size:6px;font-weight:850;white-space:nowrap}.tp-field-tracking-state.due,.tp-field-tracking-state.worsening{border-color:#f0b4b4;background:#fff2f2;color:#8f1f1f}.tp-field-tracking-state.improving{border-color:#a8d5b2;background:#f1faf3;color:#1e6a31}.tp-field-tracking-state.stable{border-color:#b8d8df;background:#f3fbfc;color:#225f69}
.tp-field-tracking-meta{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.tp-field-tracking-chip{min-height:18px;display:inline-flex;align-items:center;padding:0 6px;border:1px solid #e0e0e0;border-radius:999px;color:#555;background:#fafafa;font-size:6.4px;font-weight:800}.tp-field-tracking-summary{margin:7px 0 0;color:#444;font-size:7.5px;line-height:1.38}.tp-field-tracking-actions{display:flex;justify-content:flex-end;gap:6px;margin-top:8px}.tp-field-tracking-actions button{min-height:29px;padding:0 8px;border-radius:9px;font-size:7px;font-weight:850;cursor:pointer}.tp-field-tracking-map{border:1px solid #111;background:#111;color:#fff}.tp-field-tracking-history{border:1px solid #ccc;background:#fff;color:#111}.tp-field-tracking-pause{border:1px solid #d7b06f;background:#fff9ef;color:#6f4a0c}.tp-field-tracking-resolve{border:1px solid #ccc;background:#f7f7f7;color:#222}.tp-field-tracking-reactivate{border:1px solid #111;background:#111;color:#fff}.tp-field-tracking-actions button:disabled{opacity:.45;cursor:default}
.tp-field-tracking-loading,.tp-field-tracking-empty,.tp-field-tracking-error{min-height:90px;display:grid;place-items:center;padding:20px;border:1px dashed #d5d5d5;border-radius:12px;color:#555;background:#fafafa;font-size:8.5px;text-align:center}.tp-field-tracking-error{color:#a11}
@media(max-width:520px){.tp-field-tracking-stats{grid-template-columns:1fr 1fr}.tp-field-tracking-card{grid-template-columns:72px minmax(0,1fr)}.tp-field-tracking-thumb{width:72px;height:74px}}
`

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function directionLabel(value: string | null | undefined) {
  const text = String(value ?? '').trim();
  if (!text) return 'Takip noktası';
  return text.charAt(0).toLocaleUpperCase('tr-TR') + text.slice(1);
}

function normalizeAreaKey(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-');
}

function healthText(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return '—';
  return Number(value).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pointStatusLabel(status: FieldObservationPointStatus) {
  if (status === 'paused') return 'Duraklatıldı';
  if (status === 'resolved') return 'Takip tamamlandı';
  return 'Aktif';
}

function comparisonLabel(item: FieldObservationPointOverview) {
  const status = item.latestComparison?.status;
  if (status === 'improving') return 'Toparlanıyor';
  if (status === 'worsening') return 'Zayıflıyor';
  if (status === 'stable') return 'Stabil';
  return item.photoCount > 0 ? 'Takipte' : 'Fotoğraf bekliyor';
}

function isDue(item: FieldObservationPointOverview) {
  if (item.point.status !== 'active') return false;
  if (!item.point.lastPhotoAt || !item.point.nextPhotoDueAt) return false;
  const due = new Date(item.point.nextPhotoDueAt).getTime();
  return Number.isFinite(due) && due <= Date.now();
}

function targetFromItem(item: FieldObservationPointOverview, fieldName: string): NdviObservationTarget {
  return {
    point: item.point,
    fieldName,
    direction: item.point.direction,
    centroid: [item.point.centroidLng, item.point.centroidLat],
    relativeHealth: item.point.latestRelativeHealth,
    ndviValue: item.point.latestNdvi,
    satelliteDate: item.point.latestSatelliteDate,
  };
}

export default function FieldObservationPointsModal({
  open,
  fieldId,
  fieldName,
  relativeZones = [],
  satelliteDate = null,
  onClose,
  onOpenOnMap,
  onOpenRelativeArea,
  onOpenHistory,
  onStatusChanged,
}: Props) {
  const [items, setItems] = useState<FieldObservationPointOverview[]>([]);
  const [filter, setFilter] = useState<FieldObservationPointStatus>('active');
  const [busyPointId, setBusyPointId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) setFilter('active');
  }, [open, fieldId]);

  useEffect(() => {
    if (!open || !fieldId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listFieldObservationPoints(String(fieldId))
      .then((result) => { if (!cancelled) setItems(result); })
      .catch((value) => { if (!cancelled) setError(value instanceof Error ? value.message : 'Takip noktaları yüklenemedi.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, fieldId]);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);

  const weakerZones = useMemo(
    () => relativeZones.filter((zone) => zone?.status === 'weaker'),
    [relativeZones],
  );

  const weakerAreaKeys = useMemo(
    () =>
      new Set(
        relativeZones
          .filter((zone) => zone?.status === 'weaker')
          .map((zone) => normalizeAreaKey(zone?.area))
          .filter(Boolean),
      ),
    [relativeZones],
  );

  /*
   * Bu ekranın aktif noktaları artık veritabanındaki eski aday listesinden
   * değil, güncel "Göreli fark" analizindeki weaker alanlardan seçilir.
   * Böylece haritada 1 göreli alan varsa burada da 1 alan; hiç yoksa 0 alan görünür.
   */
  const currentRelativeItems = useMemo(
    () =>
      items.filter((item) =>
        weakerAreaKeys.has(normalizeAreaKey(item.point.direction)),
      ),
    [items, weakerAreaKeys],
  );

  const stats = useMemo(() => {
    let active = 0;
    let paused = 0;
    let resolved = 0;
    let due = 0;

    for (const item of currentRelativeItems) {
      if (item.point.status === 'active') active += 1;
      if (item.point.status === 'paused') paused += 1;
      if (item.point.status === 'resolved') resolved += 1;
      if (isDue(item)) due += 1;
    }

    return { active, paused, resolved, due };
  }, [currentRelativeItems]);

  const filteredItems = useMemo(
    () => currentRelativeItems.filter((item) => item.point.status === filter),
    [currentRelativeItems, filter],
  );

  const changeStatus = async (
    item: FieldObservationPointOverview,
    status: FieldObservationPointStatus,
  ) => {
    if (busyPointId) return;

    if (
      status === 'resolved' &&
      typeof window !== 'undefined' &&
      !window.confirm(
        `${directionLabel(item.point.direction)} bölgesindeki takibi tamamlamak istiyor musun? Geçmiş silinmeyecek.`,
      )
    ) {
      return;
    }

    setBusyPointId(item.point.id);
    setError(null);

    try {
      const point = await updateObservationPointStatus(item.point.id, status);
      setItems((current) =>
        current.map((entry) =>
          entry.point.id === point.id
            ? { ...entry, point }
            : entry,
        ),
      );
      onStatusChanged?.(point);
    } catch (value) {
      setError(
        value instanceof Error
          ? value.message
          : 'Takip durumu güncellenemedi.',
      );
    } finally {
      setBusyPointId(null);
    }
  };

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <style>{CSS}</style>
      <div className="tp-field-tracking-portal">
        <button type="button" className="tp-field-tracking-backdrop" aria-label="Takip noktalarını kapat" onClick={onClose} />
        <section className="tp-field-tracking-sheet" role="dialog" aria-modal="true" aria-label="Tarladaki NDVI takip noktaları">
          <header className="tp-field-tracking-head">
            <div>
              <div className="tp-field-tracking-kicker">🧭 PUSULA · GÖRELİ FARK TAKİBİ</div>
              <h3>{fieldName} · Güncel zayıf alanlar</h3>
              <p>
                Güncel uydu görüntüsünde parsel ortalamasından anlamlı derecede düşük ayrışan alanlar.
                {satelliteDate ? ` · ${formatDate(satelliteDate)}` : ''}
              </p>
            </div>
            <button type="button" className="tp-field-tracking-close" onClick={onClose} aria-label="Kapat">×</button>
          </header>

          <div className="tp-field-tracking-body">
            {!loading && !error && weakerZones.length > 0 ? (
              <>
                <div className="tp-relative-zone-title">Göreli farkta görünen alanlar · {weakerZones.length}</div>
                <div className="tp-relative-zone-list">
                  {weakerZones.map((zone) => {
                    const delta = Number(zone.deltaFromFieldMean);
                    const deltaText = Number.isFinite(delta)
                      ? `Parsel ortalamasından ${Math.abs(delta).toFixed(2)} NDVI daha düşük.`
                      : 'Parsel ortalamasından anlamlı derecede düşük.';
                    return (
                      <button
                        key={zone.area}
                        type="button"
                        className="tp-relative-zone-card"
                        onClick={() => onOpenRelativeArea?.(zone.area)}
                      >
                        <span className="tp-relative-zone-copy">
                          <strong>{directionLabel(zone.area)}</strong>
                          <span>{deltaText}</span>
                        </span>
                        <span className="tp-relative-zone-action">Haritada →</span>
                      </button>
                    );
                  })}
                </div>
              </>
            ) : null}

            {!loading && !error && currentRelativeItems.length > 0 ? (
              <>
                <div className="tp-field-tracking-stats">
                  <div className="tp-field-tracking-stat"><small>Aktif</small><strong>{stats.active}</strong></div>
                  <div className="tp-field-tracking-stat"><small>Fotoğraf zamanı</small><strong>{stats.due}</strong></div>
                  <div className="tp-field-tracking-stat"><small>Duraklatıldı</small><strong>{stats.paused}</strong></div>
                  <div className="tp-field-tracking-stat"><small>Tamamlandı</small><strong>{stats.resolved}</strong></div>
                </div>

                <div className="tp-field-tracking-tabs" role="tablist" aria-label="Takip durumu">
                  <button type="button" className={`tp-field-tracking-tab ${filter === 'active' ? 'active' : ''}`} onClick={() => setFilter('active')}>Aktif · {stats.active}</button>
                  <button type="button" className={`tp-field-tracking-tab ${filter === 'paused' ? 'active' : ''}`} onClick={() => setFilter('paused')}>Duraklatıldı · {stats.paused}</button>
                  <button type="button" className={`tp-field-tracking-tab ${filter === 'resolved' ? 'active' : ''}`} onClick={() => setFilter('resolved')}>Tamamlandı · {stats.resolved}</button>
                </div>
              </>
            ) : null}

            {loading ? <div className="tp-field-tracking-loading">Takip noktaları hazırlanıyor…</div> : error ? <div className="tp-field-tracking-error">{error}</div> : weakerZones.length > 0 && currentRelativeItems.length === 0 ? <div className="tp-field-tracking-empty">Göreli fark alanları yukarıda gösteriliyor. Bu alanlarda henüz kayıtlı saha fotoğrafı / kalıcı takip noktası yok.</div> : items.length === 0 ? <div className="tp-field-tracking-empty">Güncel göreli fark alanı yok ve kayıtlı kalıcı takip noktası bulunmuyor.</div> : filteredItems.length === 0 ? <div className="tp-field-tracking-empty">Bu durumda kayıtlı takip noktası yok.</div> : (
              <div className="tp-field-tracking-list">
                {filteredItems.map((item) => {
                  const due = isDue(item);
                  const lifecycleStatus = item.point.status;
                  const stateClass =
                    lifecycleStatus !== 'active'
                      ? lifecycleStatus
                      : due
                        ? 'due'
                        : (item.latestComparison?.status ?? '');
                  const busy = busyPointId === item.point.id;
                  return (
                    <article key={item.point.id} className={`tp-field-tracking-card ${lifecycleStatus}`}>
                      <div className="tp-field-tracking-thumb">
                        {item.latestPhoto?.signedUrl ? <img src={item.latestPhoto.signedUrl} alt={`${directionLabel(item.point.direction)} son takip fotoğrafı`} loading="lazy" /> : <div className="tp-field-tracking-thumb-empty">Henüz fotoğraf yok</div>}
                      </div>
                      <div className="tp-field-tracking-copy">
                        <div className="tp-field-tracking-top">
                          <div className="tp-field-tracking-title">{directionLabel(item.point.direction)}</div>
                          <span className={`tp-field-tracking-state ${stateClass}`}>
                            {lifecycleStatus !== 'active'
                              ? pointStatusLabel(lifecycleStatus)
                              : due
                                ? 'Yeni fotoğraf zamanı'
                                : comparisonLabel(item)}
                          </span>
                        </div>
                        <div className="tp-field-tracking-meta">
                          <span className="tp-field-tracking-chip">Son uydu {formatDate(item.point.latestSatelliteDate)}</span>
                          <span className="tp-field-tracking-chip">Sağlık {healthText(item.point.latestRelativeHealth)}</span>
                          <span className="tp-field-tracking-chip">{item.photoCount} fotoğraf</span>
                        </div>
                        {item.latestComparison?.summary ? <p className="tp-field-tracking-summary">{item.latestComparison.summary}</p> : item.point.lastPhotoAt ? <p className="tp-field-tracking-summary">Son fotoğraf {formatDate(item.point.lastPhotoAt)} tarihinde kaydedildi.</p> : <p className="tp-field-tracking-summary">Bu noktanın ilk saha fotoğrafı henüz eklenmedi.</p>}
                        <div className="tp-field-tracking-actions">
                          {item.photoCount > 0 ? <button type="button" className="tp-field-tracking-history" disabled={busy} onClick={() => onOpenHistory(targetFromItem(item, fieldName))}>◷ Geçmiş</button> : null}
                          <button type="button" className="tp-field-tracking-map" disabled={busy} onClick={() => onOpenOnMap(targetFromItem(item, fieldName))}>⌖ Haritada aç</button>

                          {lifecycleStatus === 'active' ? (
                            <>
                              <button type="button" className="tp-field-tracking-pause" disabled={busy} onClick={() => void changeStatus(item, 'paused')}>Ⅱ Duraklat</button>
                              <button type="button" className="tp-field-tracking-resolve" disabled={busy} onClick={() => void changeStatus(item, 'resolved')}>✓ Takibi tamamla</button>
                            </>
                          ) : (
                            <button type="button" className="tp-field-tracking-reactivate" disabled={busy} onClick={() => void changeStatus(item, 'active')}>↻ Yeniden başlat</button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </>,
    document.body,
  );
}
