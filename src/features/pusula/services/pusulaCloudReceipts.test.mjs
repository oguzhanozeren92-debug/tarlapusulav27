import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {
 buildPusulaMemoryEvents,markPusulaEventSeen,readPusulaLocalSeenIds,
 nextUnseenPusulaEvent,
} from './pusulaEventMemory.ts';

const now=new Date('2026-11-09T19:00:00Z');
const events=buildPusulaMemoryEvents({
 fieldId:'field-1',fieldName:'Bağ',crop:'Üzüm',now,
 calendar:[{id:'r-1',field_id:'field-1',title:'Saha kontrolü',completed:false,
   reminder_date:'2026-11-10'}],
});

test('remote read receipt suppresses an event on a fresh second device',()=>{
 assert.equal(events.length,1);
 const remote=new Set([events[0].id]);
 assert.equal(nextUnseenPusulaEvent('user-a','field-1',events,now,remote),null);
 assert.ok(nextUnseenPusulaEvent('user-b','field-1',events,now,new Set()));
 assert.equal(nextUnseenPusulaEvent('user-a','field-2',events,now,new Set()),null);
});

test('offline read history is preserved and exposed for cloud migration',()=>{
 const previous=globalThis.window;
 const previousEvent=globalThis.CustomEvent;
 const entries=new Map();
 globalThis.window={
  localStorage:{
   getItem:key=>entries.get(key)??null,
   setItem:(key,value)=>entries.set(key,value),
  },
  dispatchEvent(){},
 };
 globalThis.CustomEvent=class{constructor(name,options){this.name=name;this.detail=options.detail;}};
 try{
  assert.deepEqual(readPusulaLocalSeenIds('user-a','field-1'),[]);
  markPusulaEventSeen('user-a','field-1',events[0].id);
  assert.deepEqual(readPusulaLocalSeenIds('user-a','field-1'),[events[0].id]);
  assert.equal(nextUnseenPusulaEvent('user-a','field-1',events,now,new Set()),null);
  assert.ok(nextUnseenPusulaEvent('user-b','field-1',events,now,new Set()));
 }finally{
  globalThis.window=previous;
  globalThis.CustomEvent=previousEvent;
 }
});

test('cloud sync only saves opaque ids, retries local backlog and gates initial alerts',()=>{
 const cloud=readFileSync(new URL('./pusulaCloudReceipts.ts',import.meta.url),'utf8');
 const hook=readFileSync(new URL('../hooks/usePusulaFieldMemory.ts',import.meta.url),'utf8');
 const migration=readFileSync(new URL('../../../../supabase/migrations/20261109182049_pusula_field_event_receipts_sync.sql',import.meta.url),'utf8');
 assert.match(cloud,/onConflict:'user_id,field_id,event_id'/);
 assert.match(cloud,/ignoreDuplicates:true/);
 assert.match(cloud,/\bevent_id\b/);
 assert.match(hook,/readPusulaLocalSeenIds\(activeUser,fieldId\)/);
 assert.match(hook,/fetchPusulaCloudReceipts\(activeUser,fieldId\)/);
 assert.match(hook,/memorySyncReady/);
 assert.match(hook,/from\('farm_inventory_products'\)/);
 assert.match(hook,/depot:inventoryFromServer\?linkedInventory/);
 assert.match(hook,/writeDepot\(activeUser,fieldId,linkedInventory\)/);
 assert.match(hook,/new Promise<Set<string>>/);
 assert.match(hook,/if\(!cloud.ready\|\|cloud.scope!==activeScope\)return null/);
 assert.match(hook,/savePusulaCloudReceipts\(activeUser,fieldId,\[eventId\]\)/);
 assert.match(migration,/enable row level security/);
 assert.match(migration,/user_id = \(select auth.uid\(\)\)/);
 assert.match(migration,/f.user_id = \(select auth.uid\(\)\)/);
 assert.doesNotMatch(migration,/grant .* to anon/);
});
