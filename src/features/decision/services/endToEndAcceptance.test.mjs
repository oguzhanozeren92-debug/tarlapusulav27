import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { buildFieldWorkabilityDecision } from '../../field-workability/services/buildFieldWorkabilityDecision.ts';
import { buildIrrigationDistributionDecision } from '../../irrigation-distribution/services/buildIrrigationDistributionDecision.ts';
import { buildWaterScarcityDecision } from '../../water-scarcity/services/buildWaterScarcityDecision.ts';
import { buildMicroclimateSensorDecision } from '../../microclimate/services/buildMicroclimateSensorDecision.ts';
import { buildDisasterRecoveryDecision } from '../../disaster-recovery/services/buildDisasterRecoveryDecision.ts';
import { buildMultiStressSynthesis } from '../../multi-stress/services/multiStressSynthesis.service.ts';
import { buildMultiStressDecision } from '../../multi-stress/services/buildMultiStressDecision.ts';
import { harmonizeDecisionEvents } from './modelGateway.ts';
import { projectDecisionChannels } from './decisionChannelProjection.service.ts';

const now = new Date('2026-10-07T12:00:00.000Z');
const day = now.toISOString();
const fieldId = 'acceptance-field-1';

function assertFullSurfaceFlow(event, source) {
  assert.ok(event, `${source}: motor event üretmedi`);
  assert.equal(event.source, source);

  const harmonized = harmonizeDecisionEvents([event], fieldId, day);
  assert.equal(harmonized.length, 1);
  assert.equal(harmonized[0].id, event.id);
  assert.ok(harmonized[0].gateway, `${source}: Model Gateway zarfı oluşmadı`);

  const projected = projectDecisionChannels({
    events: harmonized,
    fieldKey: fieldId,
    fieldId,
  });

  assert.equal(projected.todayDecisions[0]?.id, event.id, `${source}: Bugün zinciri kopuk`);
  assert.ok(
    projected.fieldStatusDecisions.some((item) => item.id === event.id),
    `${source}: Tarla Durumu zinciri kopuk`,
  );
  assert.equal(projected.pusulaDecision?.id, event.id, `${source}: Pusula zinciri kopuk`);
  assert.ok(
    projected.notifications.some((item) => item.id === event.id),
    `${source}: Bildirim zinciri kopuk`,
  );

  return { harmonized, projected };
}

function wetFieldWorkabilityEvent() {
  return buildFieldWorkabilityDecision({
    version: '21.1', fieldId, status: 'wait', confidence: 'medium',
    headline: 'Bugün ağır makine için bekle', summary: 'Yüzey ıslak ve sıkışma riski artmış olabilir.',
    surfaceWater: { source:'open_meteo_model', volumetricWaterContent:.31, observedAt:day, ageHours:1, fieldCapacityVol:.33, ratioToFieldCapacity:.94, trafficabilityThresholdRatio:.9, thresholdLabel:'test' },
    soil: { source:'soilgrids', quality:'estimated', sandPercent:35, clayPercent:38, siltPercent:27 },
    wetting: { lastIrrigationDate:null, hoursSinceIrrigation:null, todayRainMm:8, todayRainChance:80, rainLast24hMm:8, rainLast48hMm:10, rainLast72hMm:12, forecastNext12hMm:2, forecastNext12hMaxChance:60, automaticWeatherSource:'home_weather' },
    terrain: { source:'copernicus-dem', resolutionMeters:90, meanSlopeDeg:2, maxSlopeDeg:6, steepCellShare:.02 },
    evidence:['Yüzey su içeriği tarla kapasitesine yakın','Son 24 saatte 8 mm yağış'], guardrails:['Saha doğrulaması gerekir'], generatedAt:day,
  });
}

function recurrentDistributionEvent() {
  return buildIrrigationDistributionDecision({
    version:'22.0', fieldId, status:'recurrent', confidence:'medium', generatedAt:day,
    latestIrrigation:{ id:'op-1', date:'2026-10-05', quantity:25, unit:'mm' }, satelliteDate:'2026-10-07',
    area:'kuzey', anomalyScore:.8, repeatCount:2, observations:[], rainBetweenMm:0,
    headline:'Kuzeyde tekrar eden sulama farkı', summary:'Aynı bölüm iki sulamada farklı kaldı.', evidence:['Radar ve NDVI aynı alanı işaretledi'], warnings:[],
  });
}

function scarcityEvent() {
  return buildWaterScarcityDecision({
    version:'23.0', fieldId, state:'scarcity_plan', confidence:'high', generatedAt:day,
    budget:{ profile:null, recordedUseM3:100, remainingWaterM3:120, unquantifiedIrrigationCount:0, irrigationRecordCount:2 },
    irrigation:{ decisionCode:'irrigate_now', irrigationStatus:'sulu', netWaterMm:25, currentNetNeedM3:250, planningNetNeedM3:300, grossNeedM3:350, irrigationEfficiencyPct:75, projected5DayDeficitMm:20, coverageRatio:.34, dailyCapacityRatio:.8, physicalCoverageRatio:.34 },
    phenology:{ stage:'flowering', stageLabel:'Çiçeklenme', sensitivity:'high', confidence:'medium' },
    climate:{ forecast5DayCropWaterUseMm:30, forecast5DayEffectiveRainMm:2, forecast5DayClimatePressureMm:28, maxTemperatureC:37, hotDayCount:3 },
    headline:'Su bütçesi normal ihtiyacı karşılamıyor', summary:'Kalan su kritik evreyi koruyacak şekilde planlanmalı.', action:'Kritik dönemi önceliklendir.', evidence:['Kalan su 120 m³','Brüt ihtiyaç 350 m³'], missing:[], guardrails:['Verim kaybı yüzdesi uydurulmaz'],
  });
}

function sensorEvent() {
  return buildMicroclimateSensorDecision({
    fieldId, status:'attention', confidence:'strong', generatedAt:day, deviceCount:1, liveDeviceCount:1,
    latestObservedAt:day,
    latest:{ id:'obs-1', fieldId, deviceId:'dev-1', observedAt:day, airTemperatureC:39, relativeHumidityPct:30, soilMoistureVwc:.2, soilTemperatureC:26, rainfallMm:0, leafWetnessPct:10, pressureKpa:110, flowLMin:8, batteryPct:90, rssiDbm:-60, rawPayload:{}, createdAt:day },
    devices:[], rangeAlerts:[{ kind:'pressure', severity:'warning', message:'Basınç beklenen aralığın altında' }], headline:'Sulama hattı sensörü kontrol istiyor', summary:'Gerçek saha basıncı beklenen aralığın altında.', evidence:['110 kPa saha ölçümü'], guardrails:['Arıza teşhisi değildir'],
  });
}

function disasterEvent() {
  return buildDisasterRecoveryDecision({
    fieldId, status:'damage_signal_supported', confidence:'high', headline:'Don sonrası değişim sinyali destekleniyor', summary:'Olay sonrası NDVI belirgin düştü.', action:'Aynı alanı sahada kontrol et.',
    event:{ type:'frost', label:'Don', date:'2026-10-05', ageDays:2, severity:1, weather:{ date:'2026-10-05', temperature_min_c:-3, temperature_max_c:10, precipitation_mm:0, wind_gust_kmh:15 } },
    damage:{ supported:true, preEventNdvi:.72, postEventNdvi:.50, ndviDrop:.22, ndviDropPercent:30.6, radarSupport:true, radarVhDropDb:-1.2 },
    recovery:{ status:'persistent_impact', latestNdvi:.52, percentOfPreEvent:72.2 }, evidence:['Don olayı','NDVI düşüşü','Radar desteği'], missingInputs:[], weatherProvider:'era5', generatedAt:day, caution:'Afet/hasar teşhisi değildir.'
  });
}

test('Senaryo 1 · Islak tarla: Veri -> motor -> Bugün -> Tarla Durumu -> Pusula -> Bildirim', () => {
  const event = wetFieldWorkabilityEvent();
  const { projected } = assertFullSurfaceFlow(event, 'field-workability');
  assert.equal(projected.todayDecisions[0].target, 'field_status');
});

test('Senaryo 2 · Tekrarlayan sulama farkı bütün yüzeylere aynı event ile gider', () => {
  const event = recurrentDistributionEvent();
  const { projected } = assertFullSurfaceFlow(event, 'irrigation-distribution');
  assert.equal(projected.todayDecisions[0].target, 'map_vegetation');
});

test('Senaryo 3 · Su kıtlığı planı tek kanonik sulama kararı olarak taşınır', () => {
  const event = scarcityEvent();
  const { projected } = assertFullSurfaceFlow(event, 'water-scarcity');
  assert.equal(projected.todayDecisions[0].target, 'irrigation_detail');
});

test('Senaryo 4 · Canlı sensör uyarısı aynı kimlikle karar kanallarına dağılır', () => {
  const event = sensorEvent();
  const { harmonized } = assertFullSurfaceFlow(event, 'microclimate-sensor');
  assert.equal(harmonized[0].gateway.authority.productionAuthority, false);
});

test('Senaryo 5 · Don sonrası değişim "Bu tarlaya ne oldu?" zincirinde kaybolmaz', () => {
  const event = disasterEvent();
  const { projected } = assertFullSurfaceFlow(event, 'disaster-recovery');
  assert.equal(projected.todayDecisions[0].label, 'TARLADA NE OLDU?');
});

test('Senaryo 6 · İki bağımsız stres birleşince çoklu stres bütün karar yüzeylerine çıkar', () => {
  const base = [scarcityEvent(), disasterEvent()].filter(Boolean);
  const synthesis = buildMultiStressSynthesis(fieldId, base, now);
  assert.notEqual(synthesis.status, 'none');
  const event = buildMultiStressDecision(synthesis);
  const { projected } = assertFullSurfaceFlow(event, 'multi-stress');
  assert.equal(projected.todayDecisions[0].target, 'ai');
});

test('PusulaPDF kabul kapısı · altı senaryonun kanıt zinciri rapor işine bağlıdır', () => {
  const job = fs.readFileSync(new URL('../../pusula-pdf/services/pusulaPdfJob.service.ts', import.meta.url), 'utf8');
  const insights = fs.readFileSync(new URL('../../pusula-pdf/services/pusulaPdfInsights.service.ts', import.meta.url), 'utf8');
  const pdfMultiStress = fs.readFileSync(new URL('../../pusula-pdf/services/pusulaPdfMultiStressEvidence.service.ts', import.meta.url), 'utf8');

  for (const token of [
    'mirrorLatestFieldWorkabilityEvidenceForPdf',
    'mirrorLatestIrrigationDistributionEvidenceForPdf',
    'mirrorLatestWaterScarcityEvidenceForPdf',
    'mirrorLatestMicroclimateEvidenceForPdf',
    'mirrorLatestDisasterRecoveryEvidenceForPdf',
    'mirrorLatestMultiStressEvidenceForPdf',
  ]) {
    assert.ok(job.includes(token), `PusulaPDF iş zinciri eksik: ${token}`);
  }

  for (const layer of [
    'field-workability',
    'irrigation-distribution',
    'water-scarcity-plan',
    'microclimate-sensor',
    'disaster-recovery',
    'multi-stress-synthesis',
  ]) {
    assert.ok(insights.includes(`'${layer}'`), `PusulaPDF içgörü katmanı eksik: ${layer}`);
  }

  assert.ok(pdfMultiStress.includes("latestByLayer.get('disaster-recovery')"), 'PDF çoklu stres yeniden kurulumunda afet/toparlanma kanıtı yok');
});
