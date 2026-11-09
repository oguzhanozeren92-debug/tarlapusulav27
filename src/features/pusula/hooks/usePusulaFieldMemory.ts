import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../../../supabaseClient';
import {readStoredInboxNotifications} from '../../notifications/services/notificationInboxState.service';
import {
 buildPusulaMemoryEvents,markPusulaEventSeen,nextUnseenPusulaEvent,
 type PusulaMemoryEvent,
} from '../services/pusulaEventMemory';

type Input={userId?:string|null;fieldId?:string|null;fieldName?:string|null;crop?:string|null};
type Cache={savedAt:number;products:Record<string,any>[]};
const DEPOT_CACHE_PREFIX='tp_pusula_depot_memory_v1:';
const DEPOT_TTL=48*3600000;
const clean=(v:unknown)=>String(v??'').trim();
function depotKey(userId:string,fieldId:string){
 return DEPOT_CACHE_PREFIX+encodeURIComponent(userId)+':'+encodeURIComponent(fieldId);
}
function readDepot(userId:string,fieldId:string){
 try{
  const raw=window.localStorage.getItem(depotKey(userId,fieldId));
  const obj=raw?JSON.parse(raw) as Cache:null;
  if(obj&&Date.now()-obj.savedAt<DEPOT_TTL&&Array.isArray(obj.products))
   return obj.products;
 }catch{/* Private mode */}
 return [];
}
function writeDepot(userId:string,fieldId:string,items:Record<string,any>[]){
 try{window.localStorage.setItem(depotKey(userId,fieldId),
  JSON.stringify({savedAt:Date.now(),products:items.slice(0,80)}));}
 catch{/* Storage disabled */}
}
export function usePusulaFieldMemory(input:Input){
 const userId=clean(input.userId),fieldId=clean(input.fieldId),
   fieldName=clean(input.fieldName),crop=clean(input.crop);
 const [events,setEvents]=useState<PusulaMemoryEvent[]>([]);
 const [version,setVersion]=useState(0);
 const [resolvedUser,setResolvedUser]=useState('');
 const [depot,setDepot]=useState<Record<string,any>[]>([]);
 const lastStarted=useRef(0);
 const activeUser=userId||resolvedUser;

 // Resolve auth for the Home compass, which does not carry the global user's
 // guide context. No memory query runs before we know the current auth user.
 useEffect(()=>{
  let live=true;
  if(userId){setResolvedUser(userId);return;}
  setResolvedUser('');
  void supabase.auth.getUser().then(({data})=>{
   if(live)setResolvedUser(data.user?.id||'');
  }).catch(()=>{if(live)setResolvedUser('')});
  return()=>{live=false};
 },[userId,fieldId]);
 useEffect(()=>{
  setEvents([]);
  lastStarted.current=0;
  setDepot(activeUser&&fieldId?readDepot(activeUser,fieldId):[]);
 },[activeUser,fieldId]);

 const refresh=useCallback(async(force=false)=>{
  if(!activeUser||!fieldId)return;
  const t=Date.now();
  if(!force&&t-lastStarted.current<60_000)return;
  lastStarted.current=t;
  const firstDate=new Date(t-14*86400000).toISOString();
  const weatherSince=new Date(t-36*3600000).toISOString();
  // Read-only, owner-scoped requests. Any missing module leaves the others
  // working instead of fabricating content to fill its gap.
  const checks=await Promise.allSettled([
   supabase.from('field_todos')
    .select('id,field_id,title,priority,completed,dismissed,due_date,created_at,metadata,task_key')
    .eq('user_id',activeUser).eq('field_id',fieldId).eq('completed',false).eq('dismissed',false)
    .order('priority',{ascending:false}).limit(25),
   supabase.from('calendar_reminders')
    .select('id,field_id,title,reminder_date,completed,created_at')
    .eq('user_id',activeUser).eq('field_id',fieldId).eq('completed',false)
    .gte('reminder_date',new Date(t-2*86400000).toISOString().slice(0,10))
    .order('reminder_date',{ascending:true}).limit(20),
   supabase.from('activities')
    .select('id,field_id,activity_type,title,activity_date,created_at')
    .eq('user_id',activeUser).eq('field_id',fieldId)
    .order('activity_date',{ascending:false}).limit(8),
   supabase.from('app_notifications')
    .select('id,category,source,severity,title,message,created_at,data')
    .eq('user_id',activeUser).gte('created_at',weatherSince)
    .order('created_at',{ascending:false}).limit(36),
   supabase.from('content_items')
    .select('id,title,published_at,crop_tags').eq('status','published')
    .eq('content_subtype','guide').gte('published_at',firstDate)
    .order('published_at',{ascending:false}).limit(45),
   supabase.from('market_crop_prices')
    .select('id,product_name,avg_price,price_date,unit')
    .order('price_date',{ascending:false}).limit(100),
  ]);
  const rows=(index:number):Record<string,any>[]=>{
   const result=checks[index];
   if(result.status!=='fulfilled'||result.value.error)return [];
   return (result.value.data??[]) as Record<string,any>[];
  };
  const extraLocal=readStoredInboxNotifications().map(n=>({
   ...n,created_at:n.createdAt,field_id:n.fieldId,
   category:n.source==='weather'?'weather':n.source,
  }));
  const result=buildPusulaMemoryEvents({
   fieldId,fieldName,crop,now:new Date(),
   tasks:rows(0),calendar:rows(1),activities:rows(2),
   notifications:[...rows(3),...extraLocal],
   guides:rows(4),prices:rows(5),
   depot:activeUser?readDepot(activeUser,fieldId):[],
  });
  // Field may have changed during awaited requests.
  setEvents(result);
  setVersion(x=>x+1);
 },[activeUser,fieldId,fieldName,crop]);

 useEffect(()=>{
  if(!activeUser||!fieldId)return;
  let dead=false;
  let pending=false;
  const run=(force=false)=>{
   if(dead||pending)return;
   pending=true;
   void refresh(force).finally(()=>{pending=false});
  };
  run(true);
  const interval=window.setInterval(()=>{
   if(document.visibilityState==='visible')run();
  },5*60_000);
  const changed=(event:Event)=>{
   const detail=(event as CustomEvent<{fieldId?:string}>).detail;
   if(detail?.fieldId&&String(detail.fieldId)!==fieldId)return;
   run(true);
  };
  const onVisibility=()=>{if(document.visibilityState==='visible')run()};
  const onDepot=(event:Event)=>{
   const data=(event as CustomEvent<{screen?:string;loading?:boolean;products?:Record<string,any>[]}>).detail;
   if(data?.screen!=='inventoryHub'||data.loading||!Array.isArray(data.products))return;
   const items=data.products.filter(p=>
    Array.isArray(p.fieldIds)&&p.fieldIds.some((x:unknown)=>String(x)===fieldId));
   writeDepot(activeUser,fieldId,items);
   setDepot(items);
   run(true);
  };
  const onSeen=(event:Event)=>{
   const target=(event as CustomEvent<{fieldId?:string}>).detail?.fieldId;
   if(target===fieldId)setVersion(x=>x+1);
  };
  for(const type of ['tp:tasks-changed','tp:field-operation-changed',
   'tp:calendar-reminder-added','tp:notifications-updated'])
    window.addEventListener(type,changed);
  window.addEventListener('tp-pusula-depot-state',onDepot);
  window.addEventListener('tp:pusula-memory-updated',onSeen);
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{
   dead=true;
   window.clearInterval(interval);
   for(const type of ['tp:tasks-changed','tp:field-operation-changed',
    'tp:calendar-reminder-added','tp:notifications-updated'])
     window.removeEventListener(type,changed);
   window.removeEventListener('tp-pusula-depot-state',onDepot);
   window.removeEventListener('tp:pusula-memory-updated',onSeen);
   document.removeEventListener('visibilitychange',onVisibility);
  };
 },[activeUser,fieldId,refresh]);

 const pending=useMemo(()=>nextUnseenPusulaEvent(activeUser,fieldId,events),
  [activeUser,fieldId,events,version]);
 const markSeen=useCallback((eventId:string)=>{
  markPusulaEventSeen(activeUser,fieldId,eventId);
 },[activeUser,fieldId]);

 return {pending,events,markSeen,refresh,depotSnapshot:depot};
}
