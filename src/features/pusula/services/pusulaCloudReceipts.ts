import {supabase} from '../../../supabaseClient';

/**
 * Synchronize only "seen" event IDs, never crop data, photographs, forecast
 * details or private field notes. RLS also checks ownership of each field.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_UPLOAD = 140;

export function canSyncPusulaScope(userId:string,fieldId:string){
 return UUID_RE.test(userId)&&UUID_RE.test(fieldId);
}

export function uniqueReceiptIds(input:Iterable<string>,max=MAX_UPLOAD):string[]{
 const ids=new Set<string>();
 for(const value of input){
  const id=String(value??'').trim();
  if(!id||id.length>320)continue;
  ids.add(id);
 }
 return Array.from(ids).slice(-Math.max(1,max));
}

export async function fetchPusulaCloudReceipts(userId:string,fieldId:string):Promise<Set<string>> {
 if(!canSyncPusulaScope(userId,fieldId))return new Set();
 const {data,error}=await supabase.from('pusula_event_receipts')
  .select('event_id')
  .eq('user_id',userId)
  .eq('field_id',fieldId)
  .order('seen_at',{ascending:false})
  .limit(250);
 if(error)throw error;
 return new Set<string>((data??[]).map((r)=>String(r.event_id??'')).filter(Boolean));
}

export async function savePusulaCloudReceipts(
 userId:string,fieldId:string,items:Iterable<string>,
):Promise<void>{
 if(!canSyncPusulaScope(userId,fieldId))return;
 const ids=uniqueReceiptIds(items);
 if(!ids.length)return;
 const rows=ids.map(event_id=>({user_id:userId,field_id:fieldId,event_id}));
 // Insert-only, idempotent. There is intentionally no client UPDATE/DELETE.
 const {error}=await supabase.from('pusula_event_receipts').upsert(rows,{
  onConflict:'user_id,field_id,event_id',
  ignoreDuplicates:true,
 });
 if(error)throw error;
}
