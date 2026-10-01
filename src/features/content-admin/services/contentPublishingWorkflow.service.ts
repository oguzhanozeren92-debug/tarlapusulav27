import type { FinalCandidate } from './contentFinalCandidate.service';
import { checkCandidateForPublication } from './contentPublicationGuard.service';
import { appendCandidateAudit } from './contentCandidateAudit.service';

export interface PublicationPayload {
  type:'news'|'knowledge_new'|'knowledge_update';
  title:string;
  summary:string;
  sourceName:string;
  sourceUrl:string;
  existingKnowledgeId?:string;
  metadata:{
    cropTags:string[];
    regionTags:string[];
    topicTags:string[];
    producerValue:number;
    sourceConfidence:number;
    verificationScore:number;
    sourceCount:number;
  };
}

export function preparePublication(
  candidateId:string,
  candidate:FinalCandidate,
):{ok:true;payload:PublicationPayload}|{ok:false;errors:string[];warnings:string[]} {
  const guard=checkCandidateForPublication(candidate);
  if(!guard.allowed) return {ok:false,errors:guard.reasons,warnings:guard.warnings};

  const payload:PublicationPayload={
    type:candidate.candidateType,
    title:candidate.title,
    summary:candidate.summary,
    sourceName:candidate.sourceName,
    sourceUrl:candidate.sourceUrl,
    existingKnowledgeId:candidate.existingKnowledgeId,
    metadata:{
      cropTags:candidate.cropTags,
      regionTags:candidate.regionTags,
      topicTags:candidate.topicTags,
      producerValue:candidate.producerValue,
      sourceConfidence:candidate.sourceConfidence,
      verificationScore:candidate.verification.score,
      sourceCount:candidate.verification.sourceCount,
    },
  };
  appendCandidateAudit(candidateId,'approved','Yayın payloadı hazırlandı.');
  return {ok:true,payload};
}

export function markCandidatePublished(candidateId:string,note?:string){
  return appendCandidateAudit(candidateId,'published',note||'İçerik yayınlandı.');
}
