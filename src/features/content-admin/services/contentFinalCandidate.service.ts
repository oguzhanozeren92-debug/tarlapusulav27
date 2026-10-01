import type { ContentCatalogSource } from '../../knowledge/data/sources';
import type { EnrichedCandidate } from './contentCandidateEnrichment.service';
import type { VerificationResult } from './contentCrossVerification.service';
import type { KnowledgeMatch } from './knowledgeUpdateMatcher.service';
export interface FinalCandidate{
 candidateType:'news'|'knowledge_new'|'knowledge_update';contentSubtype:'news'|'article'|'guide';
 title:string;summary:string;sourceUrl:string;sourceName:string;language:'tr'|'en';
 cropTags:string[];regionTags:string[];topicTags:string[];producerValue:number;sourceConfidence:number;
 verification:VerificationResult;existingKnowledgeId?:string;translationStatus:string;
}
export function buildFinalCandidate(source:ContentCatalogSource,item:EnrichedCandidate,verification:VerificationResult,match?:KnowledgeMatch|null):FinalCandidate{
 const subtype=source.kind;
 const candidateType=source.kind==='news'?'news':match?'knowledge_update':'knowledge_new';
 return {candidateType,contentSubtype:subtype,title:item.title,summary:item.summary,sourceUrl:item.url,sourceName:source.name,
  language:source.language,cropTags:item.cropTags,regionTags:item.regionTags,topicTags:item.topicTags,
  producerValue:item.producerValue,sourceConfidence:item.sourceConfidence,verification,
  existingKnowledgeId:match?.cardId,translationStatus:item.translationStatus};
}
