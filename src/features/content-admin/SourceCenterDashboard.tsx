import { BookOpen, Globe2, Newspaper, RefreshCw, Rss, ShieldCheck } from 'lucide-react';
import SourceScanBadge from './SourceScanBadge';
import CandidateQueueSummary from './CandidateQueueSummary';

type SourceLike = {
  id:string; name:string; source_type:string; language:string; country:string|null;
  trust_score:number; active:boolean; last_scanned_at:string|null;
  metadata:Record<string,unknown>|null;
};
type CandidateLike = {
  candidate_type:'news'|'knowledge_new'|'knowledge_update';
  content_subtype?:string|null; workflow_status:string;
};

const channel=(s:SourceLike)=>String(s.metadata?.channel||(s.source_type==='api'?'article':'news'));
const fmt=(v:string|null)=>v?new Date(v).toLocaleString('tr-TR'):'Henüz taranmadı';

export default function SourceCenterDashboard({
  sources,candidates,workingId,onScan,onToggle,onScanResearch,
}:{
  sources:SourceLike[]; candidates:CandidateLike[]; workingId:string;
  onScan:(source:SourceLike)=>void; onToggle:(source:SourceLike)=>void; onScanResearch:()=>void;
}){
  const active=sources.filter(x=>x.active).length;
  const tr=sources.filter(x=>x.language.toLowerCase()==='tr').length;
  const foreign=sources.length-tr;
  return <section className="tp-source-center">
    <header className="tp-source-center__head">
      <div><span>İÇERİK MOTORU</span><h3>Kaynak Merkezi</h3>
        <p>Haber, makale ve Bilgi Rehberi kaynakları aynı aday kuyruğunu besler. Son yayın kararı admindedir.</p>
      </div>
      <button type="button" onClick={onScanResearch} disabled={workingId==='__research__'}>
        <RefreshCw size={15}/> Akademik kaynakları tara
      </button>
    </header>
    <div className="tp-source-kpis">
      <div><Rss size={16}/><span>Toplam kaynak</span><strong>{sources.length}</strong></div>
      <div><ShieldCheck size={16}/><span>Aktif</span><strong>{active}</strong></div>
      <div><Globe2 size={16}/><span>Türkçe / Yabancı</span><strong>{tr} / {foreign}</strong></div>
    </div>
    <CandidateQueueSummary candidates={candidates}/>
    <div className="tp-source-center__grid">
      {sources.map(s=>{
        const c=channel(s);
        return <article key={s.id} className={!s.active?'is-off':''}>
          <div className="tp-source-center__title">
            {c==='news'?<Newspaper size={16}/>:<BookOpen size={16}/>}
            <div><strong>{s.name}</strong><small>{c==='guide'?'Bilgi Rehberi':c==='article'?'Makale':'Haber'} · {s.language.toUpperCase()} · Güven {s.trust_score}</small></div>
          </div>
          <div className="tp-source-center__meta"><span>{s.source_type.toUpperCase()}</span><span>{fmt(s.last_scanned_at)}</span></div>
          <div className="tp-source-center__actions">
            <SourceScanBadge state={workingId===s.id?'running':s.last_scanned_at?'success':'idle'}/>
            <button type="button" onClick={()=>onScan(s)} disabled={!s.active||workingId===s.id}>Tara</button>
            <button type="button" onClick={()=>onToggle(s)} disabled={workingId===s.id}>{s.active?'Aktif':'Kapalı'}</button>
          </div>
        </article>;
      })}
    </div>
  </section>;
}
