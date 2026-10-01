import type { FinalCandidate } from './contentFinalCandidate.service';

export interface PublicationGuardResult {
  allowed:boolean;
  reasons:string[];
  warnings:string[];
}

export function checkCandidateForPublication(candidate:FinalCandidate):PublicationGuardResult {
  const reasons:string[]=[];
  const warnings:string[]=[];

  if(!candidate.title.trim()) reasons.push('Başlık boş.');
  if(!candidate.sourceUrl.trim()) reasons.push('Kaynak bağlantısı yok.');
  if(candidate.sourceConfidence<55) reasons.push('Kaynak güven puanı çok düşük.');
  if(candidate.producerValue<35) reasons.push('Üreticiye pratik katkı puanı çok düşük.');
  if(candidate.language==='en' && candidate.translationStatus!=='translated')
    reasons.push('Yabancı içerik Türkçeleştirilmeden yayınlanamaz.');

  if(!candidate.summary.trim()) warnings.push('Üretici özeti boş.');
  if(candidate.verification.sourceCount<2 && candidate.contentSubtype==='news')
    warnings.push('Haber yalnız tek kaynakla doğrulanmış.');
  if(candidate.contentSubtype!=='news' && candidate.sourceConfidence<75)
    warnings.push('Teknik/bilimsel içerik için ek kaynak doğrulaması önerilir.');

  return {allowed:reasons.length===0,reasons,warnings};
}
