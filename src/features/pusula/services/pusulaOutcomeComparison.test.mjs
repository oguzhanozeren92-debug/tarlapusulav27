import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateRecordedFieldOutcome } from './pusulaOutcomeComparison.ts';

const now = new Date('2026-11-22T16:00:00Z');
const fieldId = 'field-one';
const operation = {id:'operation-1',activity_type:'Sulama',activity_date:'2026-11-08'};
const response = {id:'response-1',activity_type:'Saha Kontrolü',activity_date:'2026-11-11',
  notes:'Pusula işlem takibi | İşlem: Sulama | Kaynak işlem: operation-1 | Gözlem: İyileşme gördüm'};
const points = [
  {date:'2026-11-01',average:0.31},
  {date:'2026-11-05',average:0.32},
  {date:'2026-11-15',average:0.40},
  {date:'2026-11-20',average:0.42},
];
const base = {fieldId,fieldName:'Kuzey Tarla',activities:[response,operation],ndviPoints:points,now};

test('only records with verified original work and farmer response can be compared', () => {
 const outcome=evaluateRecordedFieldOutcome(base);
 assert.equal(outcome?.status,'comparable');
 assert.ok(outcome?.delta > 0);
 assert.match(outcome?.summary ?? '',/tek başına kanıtlamaz/);
 assert.ok(outcome?.evidence.some(s=>s.includes('Sentinel-2 NDVI')));
 assert.equal(evaluateRecordedFieldOutcome({...base,activities:[response]}),null);
 assert.equal(evaluateRecordedFieldOutcome({...base,activities:[operation]}),null);
});

test('one available image on either side cannot establish outcome',()=>{
 const outcome=evaluateRecordedFieldOutcome({...base,ndviPoints:points.slice(0,1).concat(points.slice(2))});
 assert.equal(outcome?.status,'awaiting_data');
 assert.equal(outcome?.delta,null);
 assert.doesNotMatch(outcome?.summary??'',/yükselmiş/);
});

test('future or invalid points are discarded, observations are not invented',()=>{
 const outcome=evaluateRecordedFieldOutcome({...base,ndviPoints:[
  {date:'2026-11-01',average:0.3},{date:'2026-11-05',average:0.34},
  {date:'2026-12-01',average:0.8},{date:'2026-11-15',average:2}
 ]});
 assert.equal(outcome?.status,'awaiting_data');
});

test('a field response cannot be attached to a different source operation',()=>{
 const result=evaluateRecordedFieldOutcome({...base,
  activities:[response,{...operation,id:'different-operation'}]});
 assert.equal(result,null);
});
