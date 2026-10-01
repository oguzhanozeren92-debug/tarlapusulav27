import { test } from 'node:test';
import assert from 'node:assert/strict';
import { optimizeCropRotation } from './cropRotationOptimization.service.ts';

const base = (patch = {}) => ({
  fieldId: 'field-1',
  fieldName: 'Deneme',
  currentCrop: 'Buğday',
  currentCropKey: 'wheat',
  cropCycle: 'annual',
  irrigationStatus: 'rainfed',
  history: [
    { year: 2025, crop: 'Buğday', cropKey: 'wheat', family: 'cereal', plantingDate: null, harvestDate: null },
    { year: 2026, crop: 'Buğday', cropKey: 'wheat', family: 'cereal', plantingDate: null, harvestDate: null },
  ],
  diseasePressure: [],
  labNitrogenSignal: 'unknown',
  economics: [],
  preferences: { horizonYears: 3, requiredCrops: [], excludedCrops: [], waterPolicy: 'auto', maxHighWaterYears: null },
  generatedAt: '2026-09-30T00:00:00+03:00',
  warnings: [],
  ...patch,
});

test('arka arkaya tahıldan sonra aynı ürünü körlemesine tekrar etmez', () => {
  const result = optimizeCropRotation(base());
  assert.ok(result.plan.length === 3);
  assert.notEqual(result.plan[0].cropKey, 'wheat');
});

test('zorunlu ürün plan içinde yer alır', () => {
  const result = optimizeCropRotation(base({
    preferences: { horizonYears: 4, requiredCrops: ['Nohut'], excludedCrops: [], waterPolicy: 'auto', maxHighWaterYears: null },
  }));
  assert.equal(result.plan.some((item) => item.cropKey === 'chickpea'), true);
});

test('hariç ürün seçilmez', () => {
  const result = optimizeCropRotation(base({
    preferences: { horizonYears: 3, requiredCrops: [], excludedCrops: ['Nohut', 'Mercimek'], waterPolicy: 'auto', maxHighWaterYears: null },
  }));
  assert.equal(result.plan.some((item) => item.cropKey === 'chickpea' || item.cropKey === 'lentil'), false);
});

test('yüksek su isteyen ürün sınırı hard constraint olarak çalışır', () => {
  const result = optimizeCropRotation(base({
    preferences: { horizonYears: 5, requiredCrops: [], excludedCrops: [], waterPolicy: 'conservative', maxHighWaterYears: 0 },
  }));
  assert.equal(result.plan.some((item) => item.waterDemand === 'high'), false);
});
