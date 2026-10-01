import {
  listContentSourceCandidates,
  setContentSourceCandidateStatus,
  type ContentSourceCandidate,
} from './contentSourceCandidate.service';
import { decideReviewTarget, type ReviewTarget } from './contentSourceReview.service';

export interface AdminQueueDraft {
  id:string;
  type:ReviewTarget;
  title:string;
  summary:string;
  sourceName:string;
  sourceUrl:string;
  sourceLanguage:'tr'|'en';
  sourceCandidateId:string;
  existingKnowledgeId?:string;
  cropTags:string[];
  regionTags:string[];
  topicTags:string[];
  producerValue:number;
  sourceConfidence:number;
}

export function buildAdminQueueDrafts(
  knowledgeCards:Array<{id:string;title:string;cropTags?:string[]}> = [],
):AdminQueueDraft[]{
  return listContentSourceCandidates({status:'new'}).map((candidate:ContentSourceCandidate)=>{
    const decision=decideReviewTarget(candidate,knowledgeCards);
    return {
      id:`source:${candidate.id}`,type:decision.target,title:candidate.title,
      summary:candidate.summary||'',sourceName:candidate.sourceName,sourceUrl:candidate.url,
      sourceLanguage:candidate.language,sourceCandidateId:candidate.id,
      existingKnowledgeId:decision.existingKnowledgeId,cropTags:candidate.cropTags,
      regionTags:candidate.regionTags,topicTags:candidate.topicTags,
      producerValue:candidate.producerValue,sourceConfidence:candidate.sourceConfidence,
    };
  });
}
export function markQueueDraftInReview(candidateId:string){
  return setContentSourceCandidateStatus(candidateId,'review');
}
export function approveQueueDraft(candidateId:string){
  return setContentSourceCandidateStatus(candidateId,'approved');
}
export function rejectQueueDraft(candidateId:string){
  return setContentSourceCandidateStatus(candidateId,'rejected');
}
