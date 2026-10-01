import type { ContentCatalogSource } from '../../knowledge/data/sources';
export interface ReliabilityResult{score:number;reasons:string[];}
export function calculateReliability(source:ContentCatalogSource,hasDate:boolean,hasSummary:boolean):ReliabilityResult{
  let score=55;const reasons:string[]=[];
  if(source.authority==='peer_reviewed'){score+=30;reasons.push('Hakemli yayın');}
  else if(source.authority==='academic_index'){score+=25;reasons.push('Akademik indeks');}
  else if(source.authority==='extension'||source.authority==='news_agency'){score+=22;reasons.push('Kurumsal/ajans kaynağı');}
  else if(source.authority==='technical'){score+=18;reasons.push('Teknik kaynak');}
  else if(source.authority==='sector_media'){score+=10;reasons.push('Sektörel yayın');}
  if(source.priority==='high'){score+=8;reasons.push('Yüksek öncelikli kaynak');}
  if(hasDate){score+=4;reasons.push('Yayın tarihi mevcut');}
  if(hasSummary){score+=3;reasons.push('Özet/bağlam mevcut');}
  return {score:Math.min(100,score),reasons};
}
