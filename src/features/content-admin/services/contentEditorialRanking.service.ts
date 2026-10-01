import type { FinalCandidate } from './contentFinalCandidate.service';

export interface RankedCandidate {
  candidate:FinalCandidate;
  editorialScore:number;
  reasons:string[];
}

export function rankEditorialCandidates(items:FinalCandidate[]):RankedCandidate[] {
  return items.map(candidate=>{
    const reasons:string[]=[];
    let score=
      candidate.producerValue*.48+
      candidate.sourceConfidence*.27+
      candidate.verification.score*.15;

    if(candidate.cropTags.length){score+=4;reasons.push('Ürünle ilişkilendirildi');}
    if(candidate.topicTags.length){score+=3;reasons.push('Saha konusu belirlendi');}
    if(candidate.regionTags.includes('Türkiye')){score+=5;reasons.push('Türkiye ile doğrudan ilişkili');}
    if(candidate.candidateType==='knowledge_update'){score+=3;reasons.push('Mevcut rehberi güncelliyor');}
    if(candidate.translationStatus==='pending_ai'){score-=12;reasons.push('Türkçe çeviri bekliyor');}

    return {candidate,editorialScore:Math.max(0,Math.min(100,Math.round(score))),reasons};
  }).sort((a,b)=>b.editorialScore-a.editorialScore);
}
