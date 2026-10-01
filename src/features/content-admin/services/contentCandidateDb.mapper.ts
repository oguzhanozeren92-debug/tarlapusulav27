import type { FinalCandidate } from './contentFinalCandidate.service';
import type { DbCandidateInsert } from './contentCandidateDb.types';

export function mapFinalCandidateToDb(sourceId:string|null,c:FinalCandidate):DbCandidateInsert{
 const turkey=c.regionTags.includes('Türkiye');
 const needsReview=c.language==='en' && c.translationStatus!=='not_needed';
 return {
  source_id:sourceId,candidate_type:c.candidateType,status:'pending',
  source_url:c.sourceUrl,source_title:c.sourceName,title_suggested:c.title,
  short_summary:c.summary,body_draft:c.summary,suggested_category:c.topicTags[0]||null,
  coverage_scope:turkey?'turkey':'world',country_code:turkey?'TR':null,
  location_text:c.regionTags.join(', ')||null,generated_at:new Date().toISOString(),
  structured_body:{
   crop_tags:c.cropTags,region_tags:c.regionTags,topic_tags:c.topicTags,
   producer_value:c.producerValue,source_confidence:c.sourceConfidence,
   verification:c.verification,translation_status:c.translationStatus,
   requires_turkish_review:needsReview,
   existing_knowledge_id:c.existingKnowledgeId||null,content_subtype:c.contentSubtype,
  },
 };
}
