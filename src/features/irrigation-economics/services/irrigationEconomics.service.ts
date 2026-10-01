import { supabase } from '../../../supabaseClient';
import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import type { IrrigationEconomicsProfile, IrrigationEconomicsSnapshot } from '../types/irrigationEconomics';

function finite(value: unknown) { if (value === null || value === undefined || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; }
function text(value: unknown) { return String(value ?? '').trim(); }
function normalizeUnit(value: unknown) { return text(value).toLocaleLowerCase('tr-TR').replace(/³/g,'3').replace(/\s+/g,''); }
function round(value: number | null, digits = 2) { if (value == null || !Number.isFinite(value)) return null; const p = 10 ** digits; return Math.round(value * p) / p; }

function irrigationVolumeM3(quantity: unknown, unit: unknown, notes: unknown, areaDecare: number | null) {
  const q = finite(quantity);
  const u = normalizeUnit(unit);
  if (q != null && q >= 0) {
    if (['m3','m³','metrekup','metreküp'].includes(u)) return q;
    if (['l','lt','litre','liter'].includes(u)) return q / 1000;
    if (['m3/da','m³/da','mm'].includes(u) && areaDecare != null && areaDecare > 0) return q * areaDecare;
  }
  const raw = text(notes).replace(',', '.');
  const perDa = raw.match(/([0-9]+(?:\.[0-9]+)?)\s*(?:m3|m³)\s*\/\s*da/i);
  if (perDa && areaDecare != null && areaDecare > 0) return Number(perDa[1]) * areaDecare;
  const total = raw.match(/(?:toplam\s*)?([0-9]+(?:\.[0-9]+)?)\s*(?:m3|m³)\b/i);
  return total ? Number(total[1]) : null;
}

async function loadProfile(fieldId: string): Promise<IrrigationEconomicsProfile> {
  const empty: IrrigationEconomicsProfile = { fieldId, irrigationEfficiencyPct: null, pumpPowerKw: null, pumpFlowM3Hour: null, energyPriceTryKwh: null, cropPriceTryKg: null, updatedAt: null };
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return empty;
  const { data, error } = await supabase.from('field_irrigation_economics').select('*').eq('user_id', auth.user.id).eq('field_id', fieldId).maybeSingle();
  if (error) { if (error.code === '42P01') return empty; throw error; }
  if (!data) return empty;
  return {
    fieldId,
    irrigationEfficiencyPct: finite(data.irrigation_efficiency_pct),
    pumpPowerKw: finite(data.pump_power_kw),
    pumpFlowM3Hour: finite(data.pump_flow_m3_hour),
    energyPriceTryKwh: finite(data.energy_price_try_kwh),
    cropPriceTryKg: finite(data.crop_price_try_kg),
    updatedAt: data.updated_at ?? null,
  };
}

async function loadFieldSeasonFacts(fieldId: string) {
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { areaDecare: null, recordedIrrigationM3: null, observedYieldKg: null };
  const currentYear = new Date().getFullYear();
  const [fieldRes, irrigationRes, harvestRes] = await Promise.all([
    supabase.from('fields').select('area_decare').eq('id', fieldId).eq('user_id', auth.user.id).maybeSingle(),
    supabase.from('activities').select('quantity,unit,notes,activity_date').eq('user_id', auth.user.id).eq('field_id', fieldId).ilike('activity_type','sulama').gte('activity_date', `${currentYear}-01-01`).lte('activity_date', `${currentYear}-12-31`).limit(200),
    supabase.from('activities').select('quantity,unit,activity_date').eq('user_id', auth.user.id).eq('field_id', fieldId).ilike('activity_type','hasat').gte('activity_date', `${currentYear}-01-01`).lte('activity_date', `${currentYear}-12-31`).limit(50),
  ]);
  const areaDecare = finite(fieldRes.data?.area_decare);
  let irrigationTotal = 0; let irrigationUsable = 0;
  for (const row of irrigationRes.data ?? []) { const value = irrigationVolumeM3(row.quantity,row.unit,row.notes,areaDecare); if (value != null) { irrigationTotal += value; irrigationUsable += 1; } }
  let yieldKg = 0; let yieldUsable = 0;
  for (const row of harvestRes.data ?? []) { const q = finite(row.quantity); const unit = normalizeUnit(row.unit); if (q == null || q < 0) continue; if (['kg','kilogram','kilo'].includes(unit)) { yieldKg += q; yieldUsable += 1; } else if (['t','ton','tn','tonne'].includes(unit)) { yieldKg += q*1000; yieldUsable += 1; } }
  return { areaDecare, recordedIrrigationM3: irrigationUsable ? irrigationTotal : null, observedYieldKg: yieldUsable ? yieldKg : null };
}

export function buildIrrigationEconomicsSnapshot(input: { fieldId: string; decision: IrrigationDecisionResult | null; profile: IrrigationEconomicsProfile; areaDecare: number | null; recordedIrrigationM3: number | null; observedYieldKg: number | null; now?: Date; }): IrrigationEconomicsSnapshot {
  const { fieldId, decision, profile, areaDecare } = input;
  const missing: string[] = [];
  const netWaterMm = finite(decision?.recommendation?.netWaterMm);
  const efficiency = profile.irrigationEfficiencyPct != null && profile.irrigationEfficiencyPct > 0 && profile.irrigationEfficiencyPct <= 100 ? profile.irrigationEfficiencyPct / 100 : null;
  if (efficiency == null) missing.push('sulama randımanı');
  if (profile.pumpPowerKw == null || profile.pumpPowerKw <= 0) missing.push('pompa gücü');
  if (profile.pumpFlowM3Hour == null || profile.pumpFlowM3Hour <= 0) missing.push('pompa debisi');
  if (profile.energyPriceTryKwh == null || profile.energyPriceTryKwh < 0) missing.push('enerji birim fiyatı');
  if (areaDecare == null || areaDecare <= 0) missing.push('tarla alanı');

  const grossWaterMm = netWaterMm != null && efficiency != null ? netWaterMm / efficiency : null;
  const totalGrossWaterM3 = grossWaterMm != null && areaDecare != null ? grossWaterMm * areaDecare : null;
  const grossWaterM3Ha = grossWaterMm != null ? grossWaterMm * 10 : null;
  const pumpHours = totalGrossWaterM3 != null && profile.pumpFlowM3Hour != null && profile.pumpFlowM3Hour > 0 ? totalGrossWaterM3 / profile.pumpFlowM3Hour : null;
  const energyKwh = pumpHours != null && profile.pumpPowerKw != null ? pumpHours * profile.pumpPowerKw : null;
  const energyCostTry = energyKwh != null && profile.energyPriceTryKwh != null ? energyKwh * profile.energyPriceTryKwh : null;
  const waterProductivityKgM3 = input.recordedIrrigationM3 != null && input.recordedIrrigationM3 > 0 && input.observedYieldKg != null ? input.observedYieldKg / input.recordedIrrigationM3 : null;

  const evidence = [
    netWaterMm != null ? `Production Sulama Motoru NET önerisi ${netWaterMm.toFixed(1)} mm.` : '',
    grossWaterMm != null ? `Kayıtlı randımanla brüt su ${grossWaterMm.toFixed(1)} mm (${grossWaterM3Ha?.toFixed(0)} m³/ha).` : '',
    energyKwh != null ? `Tahmini pompa enerjisi ${energyKwh.toFixed(1)} kWh.` : '',
    energyCostTry != null ? `Kayıtlı enerji fiyatıyla tahmini maliyet ${energyCostTry.toFixed(2)} TL.` : '',
    waterProductivityKgM3 != null ? `Gerçek kayıtlarla sezon su verimliliği ${waterProductivityKgM3.toFixed(2)} kg/m³.` : '',
  ].filter(Boolean);

  const applicable = decision?.irrigationStatus !== 'rainfed';
  return {
    version: '19.0', fieldId,
    status: !applicable ? 'not_applicable' : netWaterMm == null ? 'partial' : missing.length ? 'needs_data' : 'ready',
    decisionCode: decision?.decision ?? null,
    profile,
    recommended: { netWaterMm: round(netWaterMm), grossWaterMm: round(grossWaterMm), grossWaterM3Ha: round(grossWaterM3Ha), totalGrossWaterM3: round(totalGrossWaterM3), pumpHours: round(pumpHours), energyKwh: round(energyKwh), energyCostTry: round(energyCostTry) },
    season: { recordedIrrigationM3: round(input.recordedIrrigationM3), observedYieldKg: round(input.observedYieldKg), waterProductivityKgM3: round(waterProductivityKgM3) },
    economicBenefit: { status: 'not_computable_without_yield_response', valueTry: null, reason: 'Doğrulanmış tarla-özel verim-cevap modeli olmadan “sularsam X TL kazanırım” hesabı yapılmaz.' },
    evidence, missing,
    guardrails: ['production-irrigation-engine-keeps-water-authority','net-water-is-not-pumped-water','cost-requires-user-pump-profile','water-productivity-requires-observed-yield-and-recorded-water','no-economic-benefit-without-validated-yield-response'],
    generatedAt: (input.now ?? new Date()).toISOString(),
  };
}

export async function loadIrrigationEconomicsSnapshot(fieldIdInput: string, decision: IrrigationDecisionResult | null) {
  const fieldId = text(fieldIdInput); if (!fieldId) throw new Error('Sulama ekonomisi için tarla seçilemedi.');
  const [profile, facts] = await Promise.all([loadProfile(fieldId), loadFieldSeasonFacts(fieldId)]);
  return buildIrrigationEconomicsSnapshot({ fieldId, decision, profile, ...facts });
}

export async function saveIrrigationEconomicsProfile(fieldIdInput: string, input: Omit<IrrigationEconomicsProfile,'fieldId'|'updatedAt'>) {
  const fieldId = text(fieldIdInput); const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth.user) throw new Error('Sulama ekonomisi profili için oturum gerekli.');
  const now = new Date().toISOString();
  const { error } = await supabase.from('field_irrigation_economics').upsert({ user_id:auth.user.id, field_id:fieldId, irrigation_efficiency_pct:finite(input.irrigationEfficiencyPct), pump_power_kw:finite(input.pumpPowerKw), pump_flow_m3_hour:finite(input.pumpFlowM3Hour), energy_price_try_kwh:finite(input.energyPriceTryKwh), crop_price_try_kg:finite(input.cropPriceTryKg), updated_at:now }, { onConflict:'user_id,field_id' });
  if (error) throw error;
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('tp:irrigation-economics-updated', { detail: { fieldId } }));
  return loadProfile(fieldId);
}
