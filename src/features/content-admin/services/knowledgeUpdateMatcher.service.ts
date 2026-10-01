import type { EnrichedCandidate } from './contentCandidateEnrichment.service';
export interface KnowledgeCardRef{id:string;title:string;cropTags?:string[];topicTags?:string[];}
export interface KnowledgeMatch{cardId:string;score:number;reason:string;}
const tok=(s:string)=>new Set(s.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>2));
const similarity=(a:string,b:string)=>{const A=tok(a),B=tok(b);if(!A.size||!B.size)return 0;let n=0;A.forEach(x=>{if(B.has(x))n++;});return n/Math.max(A.size,B.size);};
export function matchKnowledgeUpdate(candidate:EnrichedCandidate,cards:KnowledgeCardRef[]):KnowledgeMatch|null{
 let best:KnowledgeMatch|null=null;
 for(const card of cards){
  let score=similarity(candidate.title,card.title);
  const crop=(card.cropTags||[]).some(x=>candidate.cropTags.includes(x));
  const topic=(card.topicTags||[]).some(x=>candidate.topicTags.includes(x));
  if(crop)score+=.12;if(topic)score+=.12;score=Math.min(1,score);
  if(!best||score>best.score)best={cardId:card.id,score,reason:`Başlık${crop?' + ürün':''}${topic?' + konu':''} eşleşmesi`};
 }
 return best&&best.score>=.55?best:null;
}
