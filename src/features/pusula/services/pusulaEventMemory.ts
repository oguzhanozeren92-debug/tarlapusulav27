import { normalizeCropForContent } from './pusulaContentSignals';

export type MemoryModule = 'weather'|'calendar'|'tasks'|'notebook'|'depot'|'market'|'knowledge';
export type PusulaMemoryEvent = {
 id:string; fieldId:string; module:MemoryModule; title:string; detail:string;
 action:string; screen:string; source:string; recordedAt:string; priority:number;
 validUntil?:string;
};
export type MemorySnapshot = {
 fieldId:string; fieldName:string; crop?:string|null; now?:Date;
 tasks?:Record<string,any>[]; calendar?:Record<string,any>[];
 activities?:Record<string,any>[]; notifications?:Record<string,any>[];
 depot?:Record<string,any>[]; prices?:Record<string,any>[];
 guides?:Record<string,any>[];
};
const DAY=86400000;
const clean=(v:unknown,n=220)=>String(v??'').replace(/\s+/g,' ').trim().slice(0,n);
function ms(v:unknown):number {
 const s=clean(v,50);
 if(!s)return NaN;
 return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s)?s+'T12:00:00':s);
}
const iso=(d:Date)=>d.toISOString();
const dd=(d:unknown)=>Number.isFinite(ms(d))?
 new Intl.DateTimeFormat('tr-TR',{day:'numeric',month:'long'}).format(new Date(ms(d))):'';
const fieldMatch=(v:Record<string,any>,id:string)=>
 clean(v.field_id??v.fieldId??v.data?.fieldId??v.data?.field_id)===id;
export function buildPusulaMemoryEvents(input:MemorySnapshot):PusulaMemoryEvent[]{
 const now=input.now??new Date(),t=now.getTime(),id=clean(input.fieldId,90);
 if(!id)return [];
 const crop=normalizeCropForContent(input.crop);
 const out:PusulaMemoryEvent[]=[];
 const put=(value:Omit<PusulaMemoryEvent,'fieldId'>)=>out.push({
   ...value,fieldId:id,title:clean(value.title,150),detail:clean(value.detail,450),
   action:clean(value.action,250),
 });
 const recent=(input.activities??[]).filter(r=>fieldMatch(r,id)&&
   ms(r.activity_date)>=t-14*DAY&&ms(r.activity_date)<=t+DAY)
   .sort((a,b)=>ms(b.activity_date)-ms(a.activity_date))[0];
 for(const r of input.notifications??[]){
  if(!fieldMatch(r,id)||!['warning','danger','critical'].includes(clean(r.severity).toLowerCase()))continue;
  if(!/weather|hava|open-meteo/i.test(clean(r.category??r.source)))continue;
  const created=ms(r.created_at??r.createdAt);
  if(!Number.isFinite(created)||created<t-36*3600000||created>t+60000)continue;
  const forecast=ms(r.data?.forecastAt??r.data?.forecast_at);
  // A frost warning without a forecast time could refer to yesterday's
  // already-passed minimum. Do not repeat it as a current Pusula risk.
  if(/don|frost/i.test(clean(r.title)+' '+clean(r.message))&&!Number.isFinite(forecast))continue;
  if(Number.isFinite(forecast)&&(forecast<t-12*3600000||forecast>t+72*3600000))continue;
  put({id:'weather:'+clean(r.id,90),module:'weather',
    title:clean(r.title)||'Hava tahmini uyarısı',
    detail:clean(r.message??r.detail)||'Seçili tarlaya ait bir hava uyarısı bulunuyor.',
    action:'Saatlik tahmini ve arazinin gerçek durumunu kontrol et.',
    screen:'weatherHub',source:'Hava Durumu',recordedAt:new Date(created).toISOString(),
    priority:clean(r.severity).toLowerCase()==='warning'?94:100,
    validUntil:new Date(Number.isFinite(forecast)?forecast+12*3600000:created+36*3600000).toISOString()});
 }
 for(const r of input.tasks??[]){
  if(!fieldMatch(r,id)||r.completed||r.dismissed)continue;
  if(ms(r.metadata?.snoozedUntil)>t)continue;
  const due=ms(r.due_date),title=clean(r.title,150);
  if(!title||(Number.isFinite(due)&&(due<t-2*DAY||due>t+7*DAY)))continue;
  // If an identical activity was logged recently, do not suggest doing it again.
  const operationType=clean(recent?.activity_type).toLocaleLowerCase('tr-TR');
  if(recent&&operationType.length>2&&title.toLocaleLowerCase('tr-TR').includes(
    operationType)&&ms(recent.activity_date)>t-2*DAY)continue;
  put({id:'task:'+clean(r.id,90),module:'tasks',title:'Açık bir tarla görevin var',
   detail:title+(dd(r.due_date)?' · '+dd(r.due_date):'')+'.',
   action:'Görevi gözden geçir. Yaptıysan tamamlandı olarak işaretle.',
   screen:'home',source:'Görevler',recordedAt:clean(r.created_at)||iso(now),
   priority:Number.isFinite(due)?(due<=t+DAY?91:75):Math.min(73,Math.max(50,Number(r.priority)||55)),
   validUntil:Number.isFinite(due)?new Date(due+2*DAY).toISOString():undefined});
 }
 for(const r of input.calendar??[]){
  if(!fieldMatch(r,id)||r.completed)continue;
  const due=ms(r.reminder_date);
  if(!Number.isFinite(due)||due<t-2*DAY||due>t+7*DAY)continue;
  put({id:'calendar:'+clean(r.id,90),module:'calendar',title:'Takviminde yaklaşan bir plan var',
   detail:clean(r.title)||'Planlı saha işi',
   action:dd(r.reminder_date)+' tarihli planı kontrol et. Yaptıysan tamamlandı olarak işaretle.',
   screen:'calendar',source:'Takvim',recordedAt:clean(r.created_at)||iso(now),
   priority:due<=t+DAY?89:74,validUntil:new Date(due+2*DAY).toISOString()});
 }
 if(recent){
  put({id:'notebook:'+clean(recent.id,90),module:'notebook',
   title:'Tarla Defteri’ndeki son işlemini gördüm',
   detail:dd(recent.activity_date)+' tarihinde '+(clean(recent.title)||clean(recent.activity_type))+' kaydedilmiş.',
   action:'İşlem geçmişini sonraki yorumlarda dikkate alacağım. Eksik bilgi varsa kaydı güncelle.',
   screen:'fieldNotebookHub',source:'Tarla Defteri',recordedAt:clean(recent.created_at)||iso(now),
   priority:44,validUntil:new Date(ms(recent.activity_date)+14*DAY).toISOString()});
 }
 for(const r of input.depot??[]){
  if(!Array.isArray(r.fieldIds)||!r.fieldIds.some((x:unknown)=>clean(x)===id))continue;
  const total=Number(r.totalAmount),left=Number(r.remainingAmount);
  if(!Number.isFinite(total)||total<=0||!Number.isFinite(left)||left<0||left/total>.25)continue;
  put({id:'depot:'+clean(r.id,90)+':low',module:'depot',
   title:'Depoda bu tarlayla ilişkili bir ürün azalıyor',
   detail:clean(r.productName,100)+' · '+left+' '+clean(r.unit,20)+' kayıtlı stok.',
   action:'Stok kaydını, ürün etiketini ve planlanan işi birlikte kontrol et.',
   screen:'inventoryHub',source:'Depo',recordedAt:iso(now),priority:64,
   validUntil:new Date(t+7*DAY).toISOString()});
 }
 const prices=(input.prices??[]).filter(r=>
  crop&&normalizeCropForContent(r.product_name??r.product)===crop&&
  ms(r.price_date??r.date)>=t-7*DAY&&ms(r.price_date??r.date)<=t+DAY)
  .sort((a,b)=>ms(b.price_date??b.date)-ms(a.price_date??a.date));
 const price=prices[0];
 if(price){
  const value=Number(price.avg_price??price.average_price??price.price);
  const date=clean(price.price_date??price.date);
  if(Number.isFinite(value)&&value>0){
   put({id:'market:'+crop+':'+date+':'+clean(price.id,90),module:'market',
    title:crop+' için yeni bir fiyat kaydı var',
    detail:dd(date)+' tarihli kayıtta '+value.toLocaleString('tr-TR',{maximumFractionDigits:2})+
     ' '+(clean(price.unit,30)||'birim fiyat')+' görünüyor.',
    action:'Bu eski tarihli bir kayıt olabilir; kaynak, birim ve güncel teklifleri karşılaştır.',
    screen:'marketHub',source:'Piyasa',recordedAt:date,priority:51,
    validUntil:new Date(ms(date)+7*DAY).toISOString()});
  }
 }
 const guides=(input.guides??[]).filter(r=>
  crop&&Array.isArray(r.crop_tags)&&
  r.crop_tags.some((x:unknown)=>normalizeCropForContent(x)===crop)&&
  ms(r.published_at)>=t-14*DAY&&ms(r.published_at)<=t+60000)
  .sort((a,b)=>ms(b.published_at)-ms(a.published_at));
 const guide=guides[0];
 if(guide&&clean(guide.title)){
  put({id:'knowledge:'+clean(guide.id,90),module:'knowledge',
   title:crop+' hakkında yeni bir rehber yayımlandı',detail:clean(guide.title,190),
   action:'Bilgi Rehberi’nde kaynak ve tarihi incele; içeriği doğrudan teşhis sayma.',
   screen:'pestGuideHub',source:'Bilgi Rehberi',
   recordedAt:clean(guide.published_at),priority:60,
   validUntil:new Date(ms(guide.published_at)+14*DAY).toISOString()});
 }
 const unique=new Map<string,PusulaMemoryEvent>();
 for(const e of out)if(e.id&&!unique.has(e.id))unique.set(e.id,e);
 return [...unique.values()].filter(e=>!e.validUntil||ms(e.validUntil)>=t)
  .sort((a,b)=>b.priority-a.priority||ms(b.recordedAt)-ms(a.recordedAt)).slice(0,70);
}

function key(userId:string,fieldId:string){
 return 'tp_pusula_memory_v1:'+encodeURIComponent(userId)+':'+encodeURIComponent(fieldId);
}
function seenMap(userId:string,fieldId:string):Record<string,number>{
 try {
  if(typeof window==='undefined')return {};
  const raw=window.localStorage.getItem(key(userId,fieldId));
  const obj=raw?JSON.parse(raw):{};
  if(!obj||Array.isArray(obj)||typeof obj!=='object')return {};
  return obj;
 }catch{return {}}
}
export function nextUnseenPusulaEvent(userId:string,fieldId:string,events:PusulaMemoryEvent[],now=new Date()){
 if(!userId||!fieldId)return null;
 const seen=seenMap(userId,fieldId),t=now.getTime();
 return events.find(e=>e.fieldId===fieldId&&(!e.validUntil||ms(e.validUntil)>=t)&&!seen[e.id])??null;
}
export function markPusulaEventSeen(userId:string,fieldId:string,eventId:string){
 if(!userId||!fieldId||!eventId||typeof window==='undefined')return;
 try {
  const seen=seenMap(userId,fieldId);
  seen[eventId]=Date.now();
  const bounded=Object.entries(seen).sort((a,b)=>Number(b[1])-Number(a[1])).slice(0,140);
  window.localStorage.setItem(key(userId,fieldId),JSON.stringify(Object.fromEntries(bounded)));
  window.dispatchEvent(new CustomEvent('tp:pusula-memory-updated',{detail:{fieldId}}));
 }catch {/* Storage can be unavailable on private browsing. */}
}
export function memoryEventAsInsight(e:PusulaMemoryEvent,fieldName:string){
 return {
  id:'pusula-memory:'+e.id,fieldName:clean(fieldName,80)||undefined,
  observationDate:e.recordedAt,
  gozlem:e.title+'\n'+e.detail,yonlendirme:e.action,
  guven_skoru:e.priority>=90?'Orta' as const:'Düşük' as const,
  sources:[e.source],
  openAction:{label:e.screen==='home'?'Görevleri aç':
   e.screen==='calendar'?'Takvimi aç':
   e.screen==='weatherHub'?'Hava tahminini aç':
   e.screen==='fieldNotebookHub'?'Tarla Defteri’ni aç':
   e.screen==='inventoryHub'?'Depoyu aç':
   e.screen==='marketHub'?'Piyasayı aç':
   e.screen==='pestGuideHub'?'Rehberi aç':'İncele',screen:e.screen},
 };
}
