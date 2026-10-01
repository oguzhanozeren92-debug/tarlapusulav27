import assert from 'node:assert/strict';

function resolveStatus({actualHarvestDate, expectedHarvestDate, daysToExpectedHarvest, phenologyStage, orchardStage}, now=new Date('2026-09-30T12:00:00Z')){
  if(actualHarvestDate) return 'harvested';
  const stages=`${phenologyStage||''} ${orchardStage||''}`.toLowerCase().replace(/[_-]+/g,' ');
  if(/harvest window|hasat penceresi|harvest|hasat/.test(stages)) return 'window';
  if(/maturation|olgunlaş|olgunlas/.test(stages)) return daysToExpectedHarvest!=null && daysToExpectedHarvest>21?'approaching':'window';
  let days=daysToExpectedHarvest;
  if(days==null&&expectedHarvestDate) days=Math.round((new Date(expectedHarvestDate+'T12:00:00Z')-now)/86400000);
  if(days!=null){ if(days<-7)return 'window'; if(days<=14)return 'window'; if(days<=35)return 'approaching'; return 'early'; }
  if(phenologyStage||orchardStage) return 'early';
  return 'insufficient';
}

assert.equal(resolveStatus({actualHarvestDate:'2026-09-28'}),'harvested');
assert.equal(resolveStatus({orchardStage:'harvest_window'}),'window');
assert.equal(resolveStatus({daysToExpectedHarvest:25}),'approaching');
assert.equal(resolveStatus({daysToExpectedHarvest:70}),'early');
assert.equal(resolveStatus({}),'insufficient');
console.log('harvestReadiness 5/5 PASS');
