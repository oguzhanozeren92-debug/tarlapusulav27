import type { ContentSourceCandidate } from './contentSourceCandidate.service';

export type ReviewTarget='news'|'knowledge_new'|'knowledge_update';

export interface ReviewDecision {
  target: ReviewTarget;
  reason: string;
  existingKnowledgeId?: string;
  confidence: number;
}

const norm=(s:string)=>s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();
const tokens=(s:string)=>new Set(norm(s).split(' ').filter(x=>x.length>2));
function similarity(a:string,b:string){
  const A=tokens(a),B=tokens(b); if(!A.size||!B.size)return 0;
  let hit=0; A.forEach(x=>{if(B.has(x))hit++;}); return hit/Math.max(A.size,B.size);
}
export function decideReviewTarget(
  candidate:ContentSourceCandidate,
  knowledgeCards:Array<{id:string;title:string;cropTags?:string[]}> = [],
):ReviewDecision{
  if(candidate.sourceKind==='news') return {target:'news',reason:'Haber kaynağından geldi.',confidence:1};
  if(candidate.sourceKind==='article')
    return {target:'knowledge_new',reason:'Bilimsel içerik; rehber adayına dönüştürülmek üzere incelemeye alınır.',confidence:.75};

  const ranked=knowledgeCards.map(card=>({card,score:similarity(candidate.title,card.title)}))
    .sort((a,b)=>b.score-a.score);
  const best=ranked[0];
  if(best&&best.score>=.55) return {
    target:'knowledge_update',existingKnowledgeId:best.card.id,
    reason:'Mevcut Bilgi Rehberi kartıyla güçlü başlık eşleşmesi bulundu.',confidence:best.score,
  };
  return {target:'knowledge_new',reason:'Eşleşen mevcut rehber kartı bulunamadı.',confidence:best?.score||.6};
}
