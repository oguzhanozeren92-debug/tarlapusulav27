import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPusulaMemoryEvents,markPusulaEventSeen,nextUnseenPusulaEvent,memoryEventAsInsight
} from './pusulaEventMemory.ts';

const now=new Date('2026-11-09T18:00:00Z');
const date='2026-11-09';
const field='tarla-a';
const base={fieldId:field,fieldName:'Şenpınar',crop:'Üzüm',now};

test('critical, field-specific and fresh frost alert comes before open calendar tasks',()=>{
 const items=buildPusulaMemoryEvents({...base,
  notifications:[
   {id:'fresh',fieldId:field,category:'weather',severity:'danger',
    title:'Don riski',message:'0°C olabilir',created_at:now.toISOString(),
    data:{fieldId:field,forecastAt:'2026-11-10T01:00:00Z'}},
   {id:'other',fieldId:'tarla-b',category:'weather',severity:'danger',
    title:'Başka tarla riski',created_at:now.toISOString()}
  ],
  tasks:[{id:'task-1',field_id:field,title:'Saha kontrolü',completed:false,
    dismissed:false,due_date:'2026-11-10',created_at:now.toISOString()}]
 });
 assert.equal(items[0].module,'weather');
 assert.equal(items.find(x=>x.module==='tasks')?.screen,'home');
 assert.ok(items.every(x=>x.fieldId===field&&!x.title.includes('Başka tarla')));
});
test('old weather risks, completed/snoozed/dismissed tasks never produce an event',()=>{
 const items=buildPusulaMemoryEvents({...base,
  notifications:[{id:'old',fieldId:field,category:'weather',severity:'danger',
    created_at:'2026-11-01T18:00:00Z',data:{fieldId:field,forecastAt:'2026-11-02T01:00:00Z'}}],
  tasks:[
   {id:'done',field_id:field,title:'Tamamlandı',completed:true},
   {id:'dismissed',field_id:field,title:'Reddedildi',dismissed:true},
   {id:'snoozed',field_id:field,title:'Ertelendi',metadata:{snoozedUntil:'2026-11-12T20:00:00Z'}}
  ]});
 assert.deepEqual(items,[]);
});
test('notebook is historical evidence, not an instruction to repeat an already logged operation',()=>{
 const items=buildPusulaMemoryEvents({...base,
  activities:[{id:'op1',field_id:field,activity_type:'Sulama',title:'Sulama yapıldı',
    activity_date:date,created_at:now.toISOString()}],
  tasks:[{id:'t1',field_id:field,title:'Sulama işlemi',completed:false,due_date:date}]
 });
 assert.ok(items.some(x=>x.module==='notebook'));
 assert.ok(!items.some(x=>x.module==='tasks'));
});
test('calendar, depot, market and crop-tagged guides have proper field and date guards',()=>{
 const items=buildPusulaMemoryEvents({...base,
  calendar:[{id:'cal1',field_id:field,title:'Budama kontrolü',completed:false,reminder_date:'2026-11-11'}],
  depot:[{id:'dep1',fieldIds:[field],productName:'Gübre',remainingAmount:2,totalAmount:20,unit:'kg'},
   {id:'dep2',fieldIds:['tarla-b'],productName:'Başka tarla',remainingAmount:1,totalAmount:20}],
  prices:[{id:'p1',product_name:'grape',avg_price:23.4,unit:'TL/kg',price_date:'2026-11-09'},
   {id:'p2',product_name:'elma',avg_price:50,price_date:'2026-11-09'}],
  guides:[{id:'g1',title:'Asma bakım rehberi',crop_tags:['asma'],published_at:'2026-11-08T12:00:00Z'},
   {id:'g2',title:'Elma rehberi',crop_tags:['elma'],published_at:'2026-11-08T12:00:00Z'}]
 });
 assert.deepEqual(new Set(items.map(x=>x.module)),new Set(['calendar','depot','market','knowledge']));
 assert.ok(items.every(e=>!e.detail.includes('Başka tarla')&&!e.detail.includes('Elma rehberi')));
 const guide=items.find(x=>x.module==='knowledge');
 assert.equal(memoryEventAsInsight(guide,'Şenpınar').openAction.screen,'pestGuideHub');
});
test('seen memory is isolated by user and field',()=>{
 const saved=new Map();
 const previous=globalThis.window;
 const previousEvent=globalThis.CustomEvent;
 globalThis.window={
  localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},
  dispatchEvent(){},
 };
 globalThis.CustomEvent=class{constructor(name,options){this.name=name;this.detail=options.detail;}};
 try{
  const items=buildPusulaMemoryEvents({...base,calendar:[
   {id:'cal',field_id:field,title:'Saha gözlemi',completed:false,reminder_date:'2026-11-10'}]});
  assert.ok(nextUnseenPusulaEvent('u1',field,items,now));
  markPusulaEventSeen('u1',field,items[0].id);
  assert.equal(nextUnseenPusulaEvent('u1',field,items,now),null);
  assert.ok(nextUnseenPusulaEvent('u2',field,items,now));
  assert.equal(nextUnseenPusulaEvent('u1','other-field',items,now),null);
 }finally{globalThis.window=previous;globalThis.CustomEvent=previousEvent}
});
test('both compasses consume the same memory and navigate into each module',()=>{
 const home=readFileSync(new URL('../../../pages/Home/HomeScreen.tsx',import.meta.url),'utf8');
 const global=readFileSync(new URL('../../../components/GlobalPusulaBand.tsx',import.meta.url),'utf8');
 const shell=readFileSync(new URL('../../../app/AppShell.tsx',import.meta.url),'utf8');
 assert.match(home,/usePusulaFieldMemory/);
 assert.match(home,/homeMemory\.markSeen/);
 assert.match(global,/fieldMemory\.markSeen/);
 assert.match(shell,/onNavigate=\{\(target\) => onNavigate/);
 assert.match(home,/tp_pusula_open_tasks_v1/);
 assert.match(global,/tp_pusula_open_tasks_v1/);
});

test('Pusula synthesizes weather + nearby calendar plan without treating them as proof of each other',()=>{
 const items=buildPusulaMemoryEvents({...base,
  notifications:[{
   id:'risk-1',field_id:field,category:'weather',severity:'danger',
   title:'Don riski',message:'Sıcaklık düşebilir',
   created_at:now.toISOString(),
   data:{fieldId:field,forecastAt:'2026-11-10T01:00:00Z'},
  }],
  calendar:[{
   id:'plan-1',field_id:field,title:'Saha kontrolü',
   completed:false,reminder_date:'2026-11-10',
  }],
 });
 const frost=items.find(e=>e.module==='weather');
 assert.ok(frost);
 assert.match(frost.detail,/Takvim bölümünde yaklaşan bir saha işin/);
 assert.match(frost.detail,/Saha kontrolü/);
 assert.match(frost.action,/Saatlik hava tahminini kontrol et/);
 assert.ok(items.some(e=>e.module==='calendar'));
});
test('Depot advisory is grounded in a recorded field operation, not an inferred application',()=>{
 const items=buildPusulaMemoryEvents({...base,
  activities:[{
   id:'op-2',field_id:field,activity_type:'Sulama',
   title:'Sulama yapıldı',activity_date:'2026-11-09',created_at:now.toISOString(),
  }],
  depot:[{
   id:'stock-2',fieldIds:[field],productName:'Gübre A',
   totalAmount:20,remainingAmount:2,unit:'kg',
  }],
 });
 const stock=items.find(e=>e.module==='depot');
 assert.ok(stock);
 assert.match(stock.detail,/Tarla Defteri’nde/);
 assert.match(stock.action,/kaydı doğrula/);
 assert.doesNotMatch(stock.action,/gübre uygula|ilaçla/i);
});


test('Pusula asks a follow-up two days after a real irrigation record, without claiming success',()=>{
 const items=buildPusulaMemoryEvents({...base,
  activities:[{id:'irrig-1',field_id:field,activity_type:'Sulama',
   title:'Sulama yapıldı',activity_date:'2026-11-06',created_at:'2026-11-06T12:00:00Z'}],
 });
 const check=items.find(x=>x.module==='followup');
 assert.ok(check);
 assert.equal(check.id,'followup:irrig-1');
 assert.match(check.detail,/Şenpınar/);
 assert.match(check.detail,/toprak neminde/);
 assert.doesNotMatch(check.detail,/iyileşti|düzeldi|kesin/i);
 assert.equal(check.screen,'fieldNotebookHub');
 assert.equal(memoryEventAsInsight(check,'Şenpınar').openAction.label,'Gözlem kaydet');
});

test('no follow-up after an actual later field inspection or replacement operation',()=>{
 const older={id:'irrig-1',field_id:field,activity_type:'Sulama',
  activity_date:'2026-11-06',created_at:'2026-11-06T12:00:00Z'};
 for(const newer of [
  {id:'check-1',field_id:field,activity_type:'Saha Kontrolü',
   activity_date:'2026-11-08',created_at:'2026-11-08T12:00:00Z'},
  {id:'irrig-2',field_id:field,activity_type:'Sulama',
   activity_date:'2026-11-08',created_at:'2026-11-08T12:00:00Z'}
 ]){
  const items=buildPusulaMemoryEvents({...base,activities:[older,newer]});
  assert.ok(!items.some(x=>x.id==='followup:irrig-1'));
 }
});

test('follow-up is limited by field, age, known operations and urgency',()=>{
 const items=buildPusulaMemoryEvents({...base,activities:[
  {id:'other',field_id:'tarla-b',activity_type:'Sulama',activity_date:'2026-11-06'},
  {id:'too-new',field_id:field,activity_type:'Sulama',activity_date:'2026-11-09'},
  {id:'too-old',field_id:field,activity_type:'Sulama',activity_date:'2026-10-20'},
  {id:'unknown',field_id:field,activity_type:'Bilinmeyen',activity_date:'2026-11-06'},
 ],notifications:[{id:'urgent',field_id:field,category:'weather',severity:'danger',
  title:'Don',created_at:now.toISOString(),data:{forecastAt:'2026-11-10T01:00:00Z'}}]});
 assert.equal(items[0].module,'weather');
 assert.ok(!items.some(x=>x.module==='followup'));
});

test('follow-up prioritizes one latest eligible operation and respects seen receipts',()=>{
 const items=buildPusulaMemoryEvents({...base,activities:[
  {id:'old-fertilizer',field_id:field,activity_type:'Gübreleme',activity_date:'2026-11-05'},
  {id:'last-spray',field_id:field,activity_type:'İlaçlama',activity_date:'2026-11-07'},
 ]});
 const followups=items.filter(x=>x.module==='followup');
 assert.equal(followups.length,1);
 assert.equal(followups[0].id,'followup:last-spray');
 assert.match(followups[0].detail,/belirtilerin durumunu/);
});


test('worsening field response is remembered and can open a user-confirmed calendar action',()=>{
 const items=buildPusulaMemoryEvents({...base,activities:[
  {id:'irrigation-9',field_id:field,activity_type:'Sulama',title:'Sulama yapıldı',
   activity_date:'2026-11-05',created_at:'2026-11-05T12:00:00Z'},
  {id:'response-9',field_id:field,activity_type:'Saha Kontrolü',
   title:'Saha kontrolü yapıldı',activity_date:'2026-11-08',created_at:'2026-11-08T12:00:00Z',
   notes:'Pusula işlem takibi | İşlem: Sulama | Kaynak işlem: irrigation-9 | Gözlem: Durum kötüleşti'},
 ]});
 const outcome=items.find(e=>e.module==='outcome');
 assert.ok(outcome);
 assert.match(outcome.detail,/kötüleşti/);
 assert.equal(outcome.priority,92);
 assert.equal(outcome.screen,'fieldControlHub');
 const insight=memoryEventAsInsight(outcome,'Şenpınar');
 assert.equal(insight.calendarAction.fieldId,field);
 assert.equal(insight.openAction.screen,'fieldControlHub');
 assert.ok(!items.some(e=>e.id==='followup:irrigation-9'));
});

test('ordinary follow-up feedback is recorded without inventing a dangerous state',()=>{
 const items=buildPusulaMemoryEvents({...base,activities:[{
  id:'note1',field_id:field,activity_type:'Saha Kontrolü',
  activity_date:'2026-11-08',created_at:'2026-11-08T12:00:00Z',
  notes:'Pusula işlem takibi | İşlem: İlaçlama | Kaynak işlem: op-1 | Gözlem: Belirgin değişiklik yok',
 }]});
 const outcome=items.find(e=>e.module==='outcome');
 assert.ok(outcome);
 assert.ok(!memoryEventAsInsight(outcome,'Şenpınar').calendarAction);
 assert.doesNotMatch(outcome.action,/ilacı artır|tekrar ilaçla/i);
});
