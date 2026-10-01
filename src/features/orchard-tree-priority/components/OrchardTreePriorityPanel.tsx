import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Trees } from 'lucide-react';
import type { Field } from '../../../types';
import { useOrchardTreeContext } from '../../orchard/hooks/useOrchardTreeContext';
import { buildOrchardTreePrioritySnapshot } from '../services/orchardTreePriority.service';
import type { OrchardTreePriorityBand } from '../types/orchardTreePriority';
import './OrchardTreePriorityPanel.css';

type Props = { field: Field | null | undefined };

const BAND_LABEL: Record<OrchardTreePriorityBand, string> = {
  urgent: 'Önce kontrol et',
  priority: 'Öncelikli takip',
  follow: 'Takip et',
  baseline: 'İlk gözlem gerekli',
};

function BandIcon({ band }: { band: OrchardTreePriorityBand }) {
  if (band === 'urgent') return <AlertTriangle size={15} />;
  if (band === 'baseline') return <Clock3 size={15} />;
  if (band === 'priority') return <Trees size={15} />;
  return <CheckCircle2 size={15} />;
}

export default function OrchardTreePriorityPanel({ field }: Props) {
  const orchard = useOrchardTreeContext(field?.id, field?.crop, Boolean(field?.id && !field?.demo));
  const priority = useMemo(
    () => buildOrchardTreePrioritySnapshot(orchard.snapshot),
    [orchard.snapshot],
  );

  if (!field || field.demo || (field.cropCycle ?? 'annual') !== 'perennial') return null;
  if (!orchard.snapshot.pilotEnabled) return null;

  return (
    <section className="tp-tree-priority-card" aria-label="Bahçe ağaç kontrol önceliği">
      <header className="tp-tree-priority-head">
        <div>
          <span>BAHÇE KONTROL ÖNCELİĞİ</span>
          <strong>Önce hangi ağaçlara bakmalısın?</strong>
        </div>
        <button type="button" onClick={() => void orchard.refresh()} disabled={orchard.loading}>
          {orchard.loading ? 'Yenileniyor…' : 'Yenile'}
        </button>
      </header>

      {orchard.loading && !priority.totalTreeCount ? (
        <div className="tp-tree-priority-state">Ağaç kayıtları ve son saha gözlemleri kontrol ediliyor…</div>
      ) : orchard.error && !priority.totalTreeCount ? (
        <div className="tp-tree-priority-state error">{orchard.error}</div>
      ) : (
        <>
          <div className="tp-tree-priority-summary">
            <strong>{priority.headline}</strong>
            <p>{priority.summary}</p>
          </div>

          <div className="tp-tree-priority-metrics">
            <article><span>Kayıtlı ağaç</span><strong>{priority.totalTreeCount}</strong></article>
            <article><span>Önce bak</span><strong>{priority.urgentCount + priority.priorityCount}</strong></article>
            <article><span>İlk gözlem</span><strong>{priority.baselineCount}</strong></article>
          </div>

          {priority.status === 'no_trees' ? (
            <div className="tp-tree-priority-state">
              Ağaç bazlı kayıt henüz yok. Ağaç ve gözlem girişleri sonuç ekranında değil, Veri Girişi bölümünde tutulmalı.
            </div>
          ) : priority.topTrees.length ? (
            <div className="tp-tree-priority-list">
              {priority.topTrees.map((tree) => (
                <article key={tree.treeId} className={`band-${tree.band}`}>
                  <div className="tp-tree-priority-icon"><BandIcon band={tree.band} /></div>
                  <div className="tp-tree-priority-main">
                    <div className="tp-tree-priority-title">
                      <strong>{tree.treeCode}</strong>
                      <span>{BAND_LABEL[tree.band]}</span>
                    </div>
                    <small>
                      {[tree.variety, tree.rowNo ? `Sıra ${tree.rowNo}` : null].filter(Boolean).join(' · ') || 'Ağaç kaydı'}
                    </small>
                    <p>{tree.reasons.map((reason) => reason.label).join(' · ')}</p>
                    <details>
                      <summary>Neden listede?</summary>
                      {tree.reasons.map((reason) => <div key={`${tree.treeId}-${reason.code}`}>{reason.detail}</div>)}
                    </details>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="tp-tree-priority-ok">
              <CheckCircle2 size={17} />
              <div><strong>Şu an öne çıkan ağaç yok</strong><span>Mevcut gerçek ağaç kayıtlarında özel kontrol isteyen bir sinyal görünmüyor.</span></div>
            </div>
          )}

          <p className="tp-tree-priority-note">
            Bu sıralama gerçek ağaç gözlemi, su/stres kaydı, gözlem yaşı, meyve yükü ve ölçülmüş yıllık verim geçmişini kullanır. Uydu tek bir ağacı hasta veya sağlıklı ilan etmez.
          </p>
        </>
      )}
    </section>
  );
}
