import type { FinalCandidate } from './contentFinalCandidate.service';
import { prepareFreeTranslation } from './contentFreeTranslation.service';

export interface FreeProcessingResult extends FinalCandidate {
  requiresTurkishReview:boolean;
}

export function applyFreeCandidateProcessing(candidate:FinalCandidate):FreeProcessingResult{
  const translated=prepareFreeTranslation(
    candidate.title,
    candidate.summary,
    candidate.language,
  );

  return {
    ...candidate,
    title:translated.titleTr,
    summary:translated.summaryTr,
    translationStatus:translated.translationStatus,
    requiresTurkishReview:candidate.language==='en' && !translated.translated,
  };
}

export function processCandidatesWithoutPaidAi(items:FinalCandidate[]){
  return items.map(applyFreeCandidateProcessing);
}
