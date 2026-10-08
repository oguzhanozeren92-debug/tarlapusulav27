import test from 'node:test';
import assert from 'node:assert/strict';

import { buildFieldWorkabilityDecision } from '../../field-workability/services/buildFieldWorkabilityDecision.ts';
import { buildIrrigationDistributionDecision } from '../../irrigation-distribution/services/buildIrrigationDistributionDecision.ts';
import { buildWaterScarcityDecision } from '../../water-scarcity/services/buildWaterScarcityDecision.ts';
import { buildMicroclimateSensorDecision } from '../../microclimate/services/buildMicroclimateSensorDecision.ts';
import { buildDisasterRecoveryDecision } from '../../disaster-recovery/services/buildDisasterRecoveryDecision.ts';
import { buildMultiStressSynthesis } from '../../multi-stress/services/multiStressSynthesis.service.ts';
import { buildMultiStressDecision } from '../../multi-stress/services/buildMultiStressDecision.ts';

const day = '2026-10-07T12:00:00.000Z';

test('entegrasyon kapatma motorları ortak HomeDecisionEvent sözleşmesine girer', () => {
  const workability = buildFieldWorkabilityDecision({
    version: '21.1', fieldId: 'field-1', status: 'wait', confidence: 'medium',
    headline: 'Bugün ağır makine için bekle', summary: 'Yüzey ıslak.',
    surfaceWater: { source:'open_meteo_model', volumetricWaterContent:.31, observedAt:day, ageHours:1, fieldCapacityVol:.33, ratioToFieldCapacity:.94, trafficabilityThresholdRatio:.9, thresholdLabel:'test' },
    soil: { source:null, quality:null, sandPercent:null, clayPercent:null, siltPercent:null },
    wetting: { lastIrrigationDate:null, hoursSinceIrrigation:null, todayRainMm:8, todayRainChance:80, rainLast24hMm:8, rainLast48hMm:10, rainLast72hMm:12, forecastNext12hMm:2, forecastNext12hMaxChance:60, automaticWeatherSource:'home_weather' },
    terrain: { source:null, resolutionMeters:null, meanSlopeDeg:null, maxSlopeDeg:null, steepCellShare:null },
    evidence:['Yüzey ıslak'], guardrails:[], generatedAt:day,
  });
  assert.equal(workability?.source, 'field-workability');
  assert.ok(workability?.channels.includes('pusula'));

  const distribution = buildIrrigationDistributionDecision({
    version:'22.0', fieldId:'field-1', status:'recurrent', confidence:'medium', generatedAt:day,
    latestIrrigation:{ id:'op-1', date:'2026-10-05', quantity:25, unit:'mm' }, satelliteDate:'2026-10-07',
    area:'kuzey', anomalyScore:.8, repeatCount:2, observations:[],
    headline:'Kuzeyde tekrar eden sulama farkı', summary:'Aynı bölüm iki sulamada farklı kaldı.', evidence:['Radar ve NDVI aynı alanı işaretledi'], warnings:[],
  });
  assert.equal(distribution?.source, 'irrigation-distribution');

  const scarcity = buildWaterScarcityDecision({
    version:'23.0', fieldId:'field-1', state:'protect_water', confidence:'medium', generatedAt:day,
    budget:{ profile:null, recordedUseM3:100, remainingWaterM3:200, unquantifiedIrrigationCount:0, irrigationRecordCount:2 },
    irrigation:{ decisionCode:'irrigate_now', irrigationStatus:'sulu', netWaterMm:25, currentNetNeedM3:250, planningNetNeedM3:300, grossNeedM3:350, irrigationEfficiencyPct:75, projected5DayDeficitMm:20, coverageRatio:.6, dailyCapacityRatio:.8, physicalCoverageRatio:.57 },
    phenology:{ stage:'flowering', stageLabel:'Çiçeklenme', sensitivity:'high', confidence:'medium' },
    climate:{ forecast5DayCropWaterUseMm:30, forecast5DayEffectiveRainMm:2, forecast5DayClimatePressureMm:28, maxTemperatureC:37, hotDayCount:3 },
    headline:'Suyu koru', summary:'Bütçe sınırlı.', action:'Kritik dönemi önceliklendir.', evidence:['Kalan su sınırlı'], missing:[], guardrails:[],
  });
  assert.equal(scarcity?.source, 'water-scarcity');

  const micro = buildMicroclimateSensorDecision({
    fieldId:'field-1', status:'attention', confidence:'strong', generatedAt:day, deviceCount:1, liveDeviceCount:1,
    latestObservedAt:day,
    latest:{ id:'obs-1', fieldId:'field-1', deviceId:'dev-1', observedAt:day, airTemperatureC:39, relativeHumidityPct:30, soilMoistureVwc:.2, soilTemperatureC:26, rainfallMm:0, leafWetnessPct:10, pressureKpa:200, flowLMin:20, batteryPct:90, rssiDbm:-60, rawPayload:{}, createdAt:day },
    devices:[], rangeAlerts:[], headline:'Sıcaklık yüksek', summary:'Gerçek saha ölçümü yüksek.', evidence:['39 °C saha ölçümü'], guardrails:[],
  });
  assert.equal(micro?.source, 'microclimate-sensor');

  const disaster = buildDisasterRecoveryDecision({
    fieldId:'field-1', status:'damage_signal_supported', confidence:'high', headline:'Don sonrası hasar sinyali destekleniyor', summary:'NDVI düştü.', action:'Sahada kontrol et.',
    event:{ type:'frost', label:'Don', date:'2026-10-05', ageDays:2, severity:1, weather:{ date:'2026-10-05', temperature_min_c:-3, temperature_max_c:10, precipitation_mm:0, wind_gust_kmh:15 } },
    damage:{ supported:true, preEventNdvi:.72, postEventNdvi:.50, ndviDrop:.22, ndviDropPercent:30.6, radarSupport:true, radarVhDropDb:-1.2 },
    recovery:{ status:'persistent_impact', latestNdvi:.52, percentOfPreEvent:72.2 }, evidence:['Don olayı','NDVI düşüşü'], missingInputs:[], weatherProvider:'era5', generatedAt:day, caution:'Teşhis değildir.'
  });
  assert.equal(disaster?.source, 'disaster-recovery');

  const events = [workability, distribution, scarcity, micro, disaster].filter(Boolean);
  const synthesis = buildMultiStressSynthesis('field-1', events, new Date(day));
  const multi = buildMultiStressDecision(synthesis);
  assert.notEqual(synthesis.status, 'none');
  assert.equal(multi?.source, 'multi-stress');
  assert.ok(multi?.channels.includes('pusula'));
});
