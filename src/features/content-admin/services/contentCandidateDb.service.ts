import { supabase } from '../../../lib/supabase';
import type { FinalCandidate } from './contentFinalCandidate.service';
import { mapFinalCandidateToDb } from './contentCandidateDb.mapper';

export async function persistFinalCandidates(sourceId:string|null,items:FinalCandidate[]){
 let created=0,duplicates=0;
 for(const item of items){
  const url=String(item.sourceUrl||'').trim();
  if(!url){duplicates++;continue;}
  const {data:existing,error:findError}=await supabase.from('content_candidates')
   .select('id').eq('source_url',url).limit(1);
  if(findError) throw findError;
  if(existing?.length){duplicates++;continue;}
  const {error}=await supabase.from('content_candidates').insert(mapFinalCandidateToDb(sourceId,item));
  if(error) throw error;
  created++;
 }
 return {created,duplicates,total:items.length};
}
