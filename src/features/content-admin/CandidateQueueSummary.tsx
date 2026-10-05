import { BookOpen, Newspaper, Search, Sparkles } from 'lucide-react';

type CandidateLike = {
  candidate_type: 'news' | 'knowledge_new' | 'knowledge_update';
  content_subtype?: string | null;
  workflow_status: string;
};

export default function CandidateQueueSummary({ candidates }: { candidates: CandidateLike[] }) {
  const pending=candidates.filter(x=>x.workflow_status==='pending');
  const news=pending.filter(x=>x.candidate_type==='news').length;
  const article=pending.filter(x=>x.content_subtype==='article').length;
  const guide=pending.filter(x=>x.candidate_type!=='news'&&x.content_subtype!=='article').length;
  return (
    <div className="tp-source-summary">
      <div><Search size={16}/><span>Bekleyen aday</span><strong>{pending.length}</strong></div>
      <div><Newspaper size={16}/><span>Haber</span><strong>{news}</strong></div>
      <div><BookOpen size={16}/><span>Makale</span><strong>{article}</strong></div>
      <div><Sparkles size={16}/><span>Bilgi Rehberi</span><strong>{guide}</strong></div>
    </div>
  );
}
