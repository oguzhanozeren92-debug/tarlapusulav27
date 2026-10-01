import { supabase } from '../../../lib/supabase';

export async function markDbCandidateReviewed(id:string,note?:string,score?:number){
 const {error}=await supabase.from('content_candidates').update({
  status:'reviewed',admin_note:note||null,admin_score:score??null,
 }).eq('id',id);
 if(error) throw error;
}
export async function rejectDbCandidate(id:string,note?:string){
 const {error}=await supabase.from('content_candidates').update({
  status:'rejected',admin_note:note||null,
 }).eq('id',id);
 if(error) throw error;
}
export async function approveDbCandidate(id:string,note?:string,score?:number){
 const {error}=await supabase.from('content_candidates').update({
  status:'approved',admin_note:note||null,admin_score:score??null,
 }).eq('id',id);
 if(error) throw error;
}
export async function getExistingKnowledgeTarget(candidate:any){
 return candidate?.structured_body?.existing_knowledge_id||null;
}
