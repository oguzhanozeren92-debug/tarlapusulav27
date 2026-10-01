import { supabase } from '../../../lib/supabase';

export interface CandidateAiEnrichmentResult {
  ok:boolean;
  candidateId:string;
  enriched:{
    title_tr:string;
    summary_tr:string;
    producer_takeaway:string;
    crop_tags:string[];
    region_tags:string[];
    topic_tags:string[];
    producer_value:number;
    confidence:number;
  };
}

export async function enrichCandidateWithAi(candidateId:string){
  const {data,error}=await supabase.functions.invoke<CandidateAiEnrichmentResult>(
    'content-candidate-enrich',
    {body:{candidateId}},
  );
  if(error) throw error;
  if(!data?.ok) throw new Error((data as any)?.error||'İçerik AI tarafından işlenemedi.');
  return data;
}

export async function enrichPendingForeignCandidates(limit=10){
  const {data:rows,error}=await supabase.from('content_candidates')
    .select('id,structured_body')
    .order('generated_at',{ascending:false})
    .limit(100);
  if(error) throw error;

  const pending=(rows||[])
    .filter((row:any)=>row.structured_body?.translation_status==='pending_ai')
    .slice(0,limit);

  const results=[];
  for(const row of pending){
    try{
      results.push({id:row.id,ok:true,data:await enrichCandidateWithAi(row.id)});
    }catch(error){
      results.push({id:row.id,ok:false,error:error instanceof Error?error.message:String(error)});
    }
  }
  return results;
}
