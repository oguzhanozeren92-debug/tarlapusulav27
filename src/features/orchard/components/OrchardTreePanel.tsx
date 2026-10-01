import { useMemo, useState } from 'react';
import { MapPin, Plus, RefreshCw, Save, Trees } from 'lucide-react';
import { useOrchardTreeContext } from '../hooks/useOrchardTreeContext';
import { isOrchardTreePilotCrop, saveOrchardTree, saveOrchardTreeObservation } from '../services/orchardTree.service';
import type {
  OrchardTreeLoadLevel,
  OrchardTreeStage,
  OrchardTreeStressLevel,
  OrchardTreeWaterStatus,
} from '../types/orchardTree';
import './OrchardTreePanel.css';

type Props = {
  field: any;
};

const LOAD_OPTIONS: Array<{ value: OrchardTreeLoadLevel; label: string }> = [
  { value: 'unknown', label: 'Bilinmiyor' },
  { value: 'none', label: 'Yok' },
  { value: 'low', label: 'Düşük' },
  { value: 'medium', label: 'Orta' },
  { value: 'high', label: 'Yüksek' },
  { value: 'very_high', label: 'Çok yüksek' },
];

const STAGE_OPTIONS: Array<{ value: OrchardTreeStage; label: string }> = [
  { value: 'unknown', label: 'Bilinmiyor' },
  { value: 'dormancy', label: 'Dinlenme' },
  { value: 'bud_swell', label: 'Tomurcuk şişmesi' },
  { value: 'bud_break', label: 'Tomurcuk açımı' },
  { value: 'flowering', label: 'Çiçeklenme' },
  { value: 'fruit_set', label: 'Meyve tutumu' },
  { value: 'fruit_growth', label: 'Meyve gelişimi' },
  { value: 'maturation', label: 'Olgunlaşma' },
  { value: 'harvest_window', label: 'Hasat penceresi' },
  { value: 'leaf_fall', label: 'Yaprak dökümü' },
];

function numberValue(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

export default function OrchardTreePanel({ field }: Props) {
  const fieldId = String(field?.id ?? '').trim();
  const crop = String(field?.crop ?? '').trim();
  const pilot = isOrchardTreePilotCrop(crop);
  const { snapshot, loading, error, refresh } = useOrchardTreeContext(fieldId, crop, Boolean(fieldId && pilot));
  const [mode, setMode] = useState<'none' | 'tree' | 'observation'>('none');
  const [selectedTreeId, setSelectedTreeId] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [treeDraft, setTreeDraft] = useState({
    treeCode: '', variety: '', rootstock: '', plantingYear: '', latitude: '', longitude: '', rowNo: '', treeNo: '', canopyDiameterM: '', canopyHeightM: '', notes: '',
  });
  const [obsDraft, setObsDraft] = useState<{
    stage: OrchardTreeStage;
    waterStatus: OrchardTreeWaterStatus;
    stressLevel: OrchardTreeStressLevel;
    flowerIntensity: OrchardTreeLoadLevel;
    fruitLoad: OrchardTreeLoadLevel;
    fruitCountMeasured: string;
    yieldKgMeasured: string;
    trunkDiameterMm: string;
    sapFlowLph: string;
    notes: string;
  }>({
    stage: 'unknown', waterStatus: 'unknown', stressLevel: 'unknown', flowerIntensity: 'unknown', fruitLoad: 'unknown', fruitCountMeasured: '', yieldKgMeasured: '', trunkDiameterMm: '', sapFlowLph: '', notes: '',
  });

  const selectedTree = useMemo(
    () => snapshot.trees.find((tree) => tree.id === selectedTreeId) ?? snapshot.trees[0] ?? null,
    [snapshot.trees, selectedTreeId],
  );

  if (!pilot) {
    return (
      <section className="tp-orchard-card tp-orchard-disabled">
        <div><span>AĞAÇ BAZLI PUSULA</span><strong>Pilot: Badem + Antep Fıstığı</strong></div>
        <p>Bu özellik ağaçları tek tek dijital varlık olarak izler. Mevcut pilot kapsamı yalnız badem ve Antep fıstığı bahçelerinde aktiftir.</p>
      </section>
    );
  }

  const submitTree = async () => {
    setSaving(true); setMessage('');
    try {
      await saveOrchardTree({
        fieldId,
        crop,
        treeCode: treeDraft.treeCode,
        variety: treeDraft.variety,
        rootstock: treeDraft.rootstock,
        plantingYear: numberValue(treeDraft.plantingYear),
        latitude: numberValue(treeDraft.latitude),
        longitude: numberValue(treeDraft.longitude),
        rowNo: treeDraft.rowNo,
        treeNo: treeDraft.treeNo,
        canopyDiameterM: numberValue(treeDraft.canopyDiameterM),
        canopyHeightM: numberValue(treeDraft.canopyHeightM),
        notes: treeDraft.notes,
      });
      setTreeDraft({ treeCode: '', variety: '', rootstock: '', plantingYear: '', latitude: '', longitude: '', rowNo: '', treeNo: '', canopyDiameterM: '', canopyHeightM: '', notes: '' });
      setMode('none');
      setMessage('Ağaç kaydedildi.');
      await refresh();
    } catch (value) {
      setMessage(value instanceof Error ? value.message : 'Ağaç kaydedilemedi.');
    } finally { setSaving(false); }
  };

  const submitObservation = async () => {
    const tree = selectedTree;
    if (!tree) { setMessage('Önce ağaç ekle.'); return; }
    setSaving(true); setMessage('');
    try {
      await saveOrchardTreeObservation({
        fieldId,
        treeId: tree.id,
        stage: obsDraft.stage,
        waterStatus: obsDraft.waterStatus,
        stressLevel: obsDraft.stressLevel,
        flowerIntensity: obsDraft.flowerIntensity,
        fruitLoad: obsDraft.fruitLoad,
        fruitCountMeasured: numberValue(obsDraft.fruitCountMeasured),
        yieldKgMeasured: numberValue(obsDraft.yieldKgMeasured),
        trunkDiameterMm: numberValue(obsDraft.trunkDiameterMm),
        sapFlowLph: numberValue(obsDraft.sapFlowLph),
        source: 'manual',
        notes: obsDraft.notes,
      });
      setObsDraft({ stage: 'unknown', waterStatus: 'unknown', stressLevel: 'unknown', flowerIntensity: 'unknown', fruitLoad: 'unknown', fruitCountMeasured: '', yieldKgMeasured: '', trunkDiameterMm: '', sapFlowLph: '', notes: '' });
      setMode('none');
      setMessage('Ağaç gözlemi kaydedildi.');
      await refresh();
    } catch (value) {
      setMessage(value instanceof Error ? value.message : 'Ağaç gözlemi kaydedilemedi.');
    } finally { setSaving(false); }
  };

  return (
    <section className="tp-orchard-card">
      <header>
        <div>
          <span>AĞAÇ BAZLI PUSULA · 16</span>
          <strong>{snapshot.treeCount ? `${snapshot.treeCount} ağaç ayrı izleniyor` : 'Bahçedeki ağaçları ayrı izlemeye başla'}</strong>
          <p>Su, çiçek, meyve, stres ve gerçek ağaç verimi tek ağaca bağlanır.</p>
        </div>
        <button type="button" onClick={() => void refresh()} disabled={loading}><RefreshCw size={15} className={loading ? 'is-spinning' : ''} /></button>
      </header>

      <div className="tp-orchard-metrics">
        <div><small>Ağaç</small><strong>{snapshot.treeCount}</strong></div>
        <div><small>Haritada</small><strong>{snapshot.geolocatedTreeCount}</strong></div>
        <div><small>Gözlemli</small><strong>{snapshot.observedTreeCount}</strong></div>
        <div><small>Stres</small><strong>{snapshot.stressedTreeCount}</strong></div>
        <div><small>Çiçek</small><strong>{snapshot.floweringTreeCount}</strong></div>
        <div><small>Meyve</small><strong>{snapshot.fruitingTreeCount}</strong></div>
      </div>

      {snapshot.alternance.status === 'possible' ? (
        <div className="tp-orchard-alert"><strong>Olası alternans örüntüsü</strong><span>{snapshot.alternance.possibleTreeIds.length} ağaçta en az 3 yıllık gerçek ağaç veriminden sinyal var; teşhis değildir.</span></div>
      ) : null}

      <div className="tp-orchard-actions">
        <button type="button" onClick={() => setMode(mode === 'tree' ? 'none' : 'tree')}><Plus size={15} /> Ağaç ekle</button>
        <button type="button" onClick={() => setMode(mode === 'observation' ? 'none' : 'observation')} disabled={!snapshot.treeCount}><Trees size={15} /> Gözlem ekle</button>
      </div>

      {mode === 'tree' ? (
        <div className="tp-orchard-form">
          <input placeholder="Ağaç kodu (örn. S3-A12)" value={treeDraft.treeCode} onChange={(e) => setTreeDraft({ ...treeDraft, treeCode: e.target.value })} />
          <input placeholder="Çeşit" value={treeDraft.variety} onChange={(e) => setTreeDraft({ ...treeDraft, variety: e.target.value })} />
          <input placeholder="Anaç" value={treeDraft.rootstock} onChange={(e) => setTreeDraft({ ...treeDraft, rootstock: e.target.value })} />
          <input placeholder="Dikim yılı" inputMode="numeric" value={treeDraft.plantingYear} onChange={(e) => setTreeDraft({ ...treeDraft, plantingYear: e.target.value })} />
          <input placeholder="Sıra" value={treeDraft.rowNo} onChange={(e) => setTreeDraft({ ...treeDraft, rowNo: e.target.value })} />
          <input placeholder="Ağaç no" value={treeDraft.treeNo} onChange={(e) => setTreeDraft({ ...treeDraft, treeNo: e.target.value })} />
          <input placeholder="Enlem (opsiyonel)" inputMode="decimal" value={treeDraft.latitude} onChange={(e) => setTreeDraft({ ...treeDraft, latitude: e.target.value })} />
          <input placeholder="Boylam (opsiyonel)" inputMode="decimal" value={treeDraft.longitude} onChange={(e) => setTreeDraft({ ...treeDraft, longitude: e.target.value })} />
          <input placeholder="Taç çapı m (ölçüm)" inputMode="decimal" value={treeDraft.canopyDiameterM} onChange={(e) => setTreeDraft({ ...treeDraft, canopyDiameterM: e.target.value })} />
          <input placeholder="Ağaç yüksekliği m (ölçüm)" inputMode="decimal" value={treeDraft.canopyHeightM} onChange={(e) => setTreeDraft({ ...treeDraft, canopyHeightM: e.target.value })} />
          <textarea placeholder="Not" value={treeDraft.notes} onChange={(e) => setTreeDraft({ ...treeDraft, notes: e.target.value })} />
          <button className="primary" type="button" onClick={() => void submitTree()} disabled={saving || !treeDraft.treeCode.trim()}><Save size={15} /> Kaydet</button>
        </div>
      ) : null}

      {mode === 'observation' ? (
        <div className="tp-orchard-form">
          <select value={selectedTree?.id ?? ''} onChange={(e) => setSelectedTreeId(e.target.value)}>
            {snapshot.trees.map((tree) => <option key={tree.id} value={tree.id}>{tree.treeCode}{tree.variety ? ` · ${tree.variety}` : ''}</option>)}
          </select>
          <select value={obsDraft.stage} onChange={(e) => setObsDraft({ ...obsDraft, stage: e.target.value as OrchardTreeStage })}>{STAGE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select value={obsDraft.waterStatus} onChange={(e) => setObsDraft({ ...obsDraft, waterStatus: e.target.value as OrchardTreeWaterStatus })}><option value="unknown">Su: bilinmiyor</option><option value="normal">Su: normal</option><option value="watch">Su: takip</option><option value="stress">Su: stres</option></select>
          <select value={obsDraft.stressLevel} onChange={(e) => setObsDraft({ ...obsDraft, stressLevel: e.target.value as OrchardTreeStressLevel })}><option value="unknown">Stres: bilinmiyor</option><option value="none">Stres: yok</option><option value="low">Stres: düşük</option><option value="medium">Stres: orta</option><option value="high">Stres: yüksek</option></select>
          <select value={obsDraft.flowerIntensity} onChange={(e) => setObsDraft({ ...obsDraft, flowerIntensity: e.target.value as OrchardTreeLoadLevel })}>{LOAD_OPTIONS.map((item) => <option key={item.value} value={item.value}>Çiçek: {item.label}</option>)}</select>
          <select value={obsDraft.fruitLoad} onChange={(e) => setObsDraft({ ...obsDraft, fruitLoad: e.target.value as OrchardTreeLoadLevel })}>{LOAD_OPTIONS.map((item) => <option key={item.value} value={item.value}>Meyve yükü: {item.label}</option>)}</select>
          <input placeholder="Sayılmış meyve adedi (gerçek)" inputMode="numeric" value={obsDraft.fruitCountMeasured} onChange={(e) => setObsDraft({ ...obsDraft, fruitCountMeasured: e.target.value })} />
          <input placeholder="Ağaç verimi kg (gerçek)" inputMode="decimal" value={obsDraft.yieldKgMeasured} onChange={(e) => setObsDraft({ ...obsDraft, yieldKgMeasured: e.target.value })} />
          <input placeholder="Gövde çapı mm (ölçüm)" inputMode="decimal" value={obsDraft.trunkDiameterMm} onChange={(e) => setObsDraft({ ...obsDraft, trunkDiameterMm: e.target.value })} />
          <input placeholder="Sap akışı L/saat (sensör/ölçüm)" inputMode="decimal" value={obsDraft.sapFlowLph} onChange={(e) => setObsDraft({ ...obsDraft, sapFlowLph: e.target.value })} />
          <textarea placeholder="Gözlem notu" value={obsDraft.notes} onChange={(e) => setObsDraft({ ...obsDraft, notes: e.target.value })} />
          <button className="primary" type="button" onClick={() => void submitObservation()} disabled={saving || !selectedTree}><Save size={15} /> Gözlemi kaydet</button>
        </div>
      ) : null}

      {snapshot.trees.length ? (
        <div className="tp-orchard-list">
          {snapshot.trees.slice(0, 8).map((tree) => {
            const observation = snapshot.latestObservations.find((item) => item.treeId === tree.id);
            const attention = observation?.stressLevel === 'high' || observation?.waterStatus === 'stress';
            return (
              <article key={tree.id} className={attention ? 'attention' : ''}>
                <div className="tp-orchard-tree-dot"><Trees size={15} /></div>
                <div><strong>{tree.treeCode}</strong><span>{tree.variety || crop}{tree.rowNo ? ` · sıra ${tree.rowNo}` : ''}</span></div>
                <div className="tp-orchard-tree-state">{tree.latitude !== null ? <MapPin size={13} /> : null}<span>{observation ? `${observation.stage} · ${observation.stressLevel}` : 'Gözlem yok'}</span></div>
              </article>
            );
          })}
        </div>
      ) : null}

      <p className="tp-orchard-note">Uydu parsel bağlamıdır; tek ağacın stresi, çiçeği veya meyvesi uyduyla kesinleştirilmez. Asymetree/SAMSON/FruitMeasure/MangoSense bu sürümde yöntem referansıdır.</p>
      {message ? <p className="tp-orchard-message">{message}</p> : null}
      {error ? <p className="tp-orchard-message error">{error}</p> : null}
    </section>
  );
}
