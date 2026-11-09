import {useCallback,useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from '../../../supabaseClient';
import {readStoredInboxNotifications} from '../../notifications/services/notificationInboxState.service';
import {
 buildPusulaMemoryEvents,markPusulaEventSeen,nextUnseenPusulaEvent,
 readPusulaLocalSeenIds,
 type PusulaMemoryEvent,
} from '../services/pusulaEventMemory';
import {
 canSyncPusulaScope,fetchPusulaCloudReceipts,savePusulaCloudReceipts,
} from '../services/pusulaCloudReceipts';

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
 const [cloud,setCloud]=useState<{scope:string;ready:boolean;ids:Set<string>}>({
  scope:'',ready:false,ids:new Set<string>(),
 });
 const lastStarted=useRef(0);
 const activeUser=userId||resolvedUser;
 const activeScope=activeUser+':'+fieldId;
 const scopeRef=useRef(activeScope);
 scopeRef.current=activeScope;

 // Cloud sync is scoped to the signed-in user AND the selected field.
 // On first mount, wait for receipts before highlighting an already-seen
 // message; if offline, proceed with the local history instead of blocking UI.
 useEffect(()=>{
  if(!activeUser||!fieldId)return;
  let closed=false,busy=false;
  if(!canSyncPusulaScope(activeUser,fieldId)){
   setCloud({scope:activeScope,ready:true,ids:new Set()});
   return;
  }
  setCloud({scope:activeScope,ready:false,ids:new Set()});
  const sync=async()=>{
   if(closed||busy)return;
   busy=true;
   try{
    const server=await fetchPusulaCloudReceipts(activeUser,fieldId);
    if(closed||scopeRef.current!==activeScope)return;
    setCloud({scope:activeScope,ready:true,ids:server});
    // Migrate reads from old single-device installations. Never overwrite
    // remote receipts with an empty cache after reinstalling the app.
    const missing=readPusulaLocalSeenIds(activeUser,fieldId)
      .filter(eventId=>!server.has(eventId));
    if(missing.length)await savePusulaCloudReceipts(activeUser,fieldId,missing);
   }catch(error){
    if(!closed&&scopeRef.current===activeScope){
     setCloud(prev=>({
      scope:activeScope,ready:true,
      ids:prev.scope===activeScope?prev.ids:new Set<string>(),
     }));
     console.warn('[Pusula] Hafıza eşitlemesi şu anda çevrimdışı:',error);
    }
   }finally{busy=false;}
  };
  void sync();
  const timer=window.setInterval(()=>{
   if(document.visibilityState==='visible')void sync();
  },90_000);
  const onFocus=()=>{if(document.visibilityState==='visible')void sync()};
  document.addEventListener('visibilitychange',onFocus);
  return()=>{
   closed=true;
   window.clearInterval(timer);
   document.removeEventListener('visibilitychange',onFocus);
  };
 },[activeUser,fieldId,activeScope]);

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
  if(scopeRef.current!==activeUser+':'+fieldId)return;
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

 const pending=useMemo(()=>{
  if(!cloud.ready||cloud.scope!==activeScope)return null;
  return nextUnseenPusulaEvent(activeUser,fieldId,events,new Date(),cloud.ids);
 },[activeUser,fieldId,events,version,cloud,activeScope]);

 const markSeen=useCallback((eventId:string)=>{
  markPusulaEventSeen(activeUser,fieldId,eventId);
  if(!canSyncPusulaScope(activeUser,fieldId))return;
  setCloud(prev=>prev.scope===activeScope
   ? {...prev,ids:new Set([...prev.ids,eventId])}
   : prev);
  // Optimistic local UI, durable cloud receipt. A failed save is retried
  // from local history at the next sync; it must not lose the user's read.
  void savePusulaCloudReceipts(activeUser,fieldId,[eventId]).catch((error)=>{
   console.warn('[Pusula] Görüldü kaydı daha sonra eşitlenecek:',error);
  });
 },[activeUser,fieldId,activeScope]);

 return {pending,events,markSeen,refresh,depotSnapshot:depot,
  memorySyncReady:cloud.ready&&cloud.scope===activeScope};
}
