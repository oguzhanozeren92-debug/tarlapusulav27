import { supabase } from '../../../lib/supabase';
export type QueueChannel='all'|'news'|'article'|'guide';
export async function loadContentCandidateQueue(channel:QueueChannel='all',limit=300){
 const {data,error}=await supabase.from('content_candidates').select('*')
  .order('generated_at',{ascending:false}).limit(limit);
 if(error) throw error;
 const rows=(data||[]).filter((row:any)=>row.workflow_status==='pending');
 if(channel==='all') return rows;
 return rows.filter((row:any)=>{
  const subtype=String(row.structured_body?.content_subtype||'');
  if(channel==='news') return row.candidate_type==='news'||subtype==='news';
  if(channel==='article') return subtype==='article';
  return row.candidate_type==='knowledge_new'||row.candidate_type==='knowledge_update'||subtype==='guide';
 });
}
