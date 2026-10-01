export type DbCandidateType='news'|'knowledge_new'|'knowledge_update';
export interface DbCandidateInsert{
 source_id:string|null;candidate_type:DbCandidateType;status:'pending';
 source_url:string;source_title:string;title_suggested:string;short_summary:string;
 body_draft:string;suggested_category:string|null;coverage_scope:'turkey'|'world';
 country_code:string|null;location_text:string|null;generated_at:string;
 structured_body:Record<string,unknown>;
}
