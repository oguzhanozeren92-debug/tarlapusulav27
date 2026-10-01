import { AlertTriangle, MapPinned, ShieldCheck } from 'lucide-react';
import type { TaskMapSnapshot, TaskMapZone } from '../types/taskMap';
import './TaskMapPanel.css';

type Props = {
  snapshot: TaskMapSnapshot;
  onOpenMap?: () => void;
};

function zoneLabel(zone: TaskMapZone) {
  if (zone.prescriptionState === 'verified') return 'DOĞRULANMIŞ UYGULAMA';
  if (zone.prescriptionState === 'blocked') return 'REÇETE KAPALI';
  if (zone.kind === 'photo-check') return 'FOTOĞRAF / SAHA';
  if (zone.kind === 'irrigation-check') return 'SULAMA KONTROLÜ';
  if (zone.kind === 'sampling') return 'ÖRNEKLEME';
  return 'SAHA KONTROLÜ';
}


function shortReason(zone: TaskMapZone) {
  const haystack = `${zone.source} ${zone.sourceLayer} ${zone.title} ${zone.description ?? ''} ${zone.evidence.join(' ')}`
    .toLocaleLowerCase('tr-TR');

  if (zone.source === 'biophysics_trend' || haystack.includes('biophysical_multi_signal_decline')) {
    return 'Bitki sinyali parsel ortalamasından düşük.';
  }
  if (haystack.includes('ndvi')) return 'NDVI parsel ortalamasından düşük.';
  if (zone.kind === 'irrigation-check') return 'Sulama / nem sinyali farklı.';
  if (zone.kind === 'sampling') return 'Örnekleme ile doğrulama gerekli.';
  if (zone.kind === 'photo-check' && zone.sourceLayer === 'vegetation') {
    return 'Bitki örtüsü sinyali farklı.';
  }

  return 'Saha kontrolü ile doğrula.';
}

function openZones(snapshot: TaskMapSnapshot, zones: TaskMapZone[], onOpenMap?: () => void) {
  if (!zones.length || typeof window === 'undefined') return;
  onOpenMap?.();
  window.setTimeout(() => {
    window.dispatchEvent(
      new CustomEvent('tp:home-map-show-task-zones', {
        detail: {
          fieldId: snapshot.fieldId,
          zones,
          photoPrompt: zones.some((zone) => zone.kind === 'photo-check'),
        },
      }),
    );
    document.querySelector('.tp-map-stage')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, 120);
}

export default function TaskMapPanel({ snapshot, onOpenMap }: Props) {
  /*
   * Haritada gösterilecek gerçek konumlu görev yoksa boş bir Görev Haritası
   * kartı göstermeyiz. Görevlerim yalnız mevcut görevleri listeler; harita
   * bölümü ancak gerçekten mekânsal bir görev olduğunda görünür.
   */
  if (!snapshot.spatialTaskCount) return null;

  return (
    <section className="tp-task-map-panel">
      <div className="tp-task-map-head">
        <div className="tp-task-map-title">
          <MapPinned size={16} />
          <div>
            <strong>Görev Haritası</strong>
            <small>{snapshot.spatialTaskCount} konumlu açık görev</small>
          </div>
        </div>
        <button
          type="button"
          onClick={() => openZones(snapshot, snapshot.zones, onOpenMap)}
        >
          Tümünü göster
        </button>
      </div>

      {snapshot.verifiedPrescriptionCount || snapshot.blockedPrescriptionCount ? (
        <div className="tp-task-map-gate">
          {snapshot.verifiedPrescriptionCount ? (
            <span><ShieldCheck size={13} /> {snapshot.verifiedPrescriptionCount} doğrulanmış uygulama</span>
          ) : null}
          {snapshot.blockedPrescriptionCount ? (
            <span className="warn"><AlertTriangle size={13} /> {snapshot.blockedPrescriptionCount} reçete kapısı kapalı</span>
          ) : null}
        </div>
      ) : null}

      <div className="tp-task-map-zones">
        {snapshot.zones.slice(0, 5).map((zone) => (
          <button
            type="button"
            className="tp-task-map-zone"
            key={zone.taskId}
            onClick={() => openZones(snapshot, [zone], onOpenMap)}
          >
            <span>
              <small>{zoneLabel(zone)}</small>
              <strong>{zone.direction || zone.title}</strong>
              <em>{shortReason(zone)}</em>
            </span>
            <span className="tp-task-map-zone-actions">
              {zone.rewardPoints > 0 ? (
                <i>+{zone.rewardPoints} P</i>
              ) : null}
              <b>Haritada</b>
            </span>
          </button>
        ))}
      </div>

      <p className="tp-task-map-note">
        Görev bölgesi otomatik ilaç/gübre reçetesi değildir. Sayısal doz yalnız doğrulanmış yerel reçete otoritesi varsa gösterilir; kaba yön hücresi makine yönlendirme geometrisi sayılmaz.
      </p>
    </section>
  );
}
