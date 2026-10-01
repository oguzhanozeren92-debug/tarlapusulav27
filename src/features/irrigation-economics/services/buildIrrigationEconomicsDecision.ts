import type { HomeDecisionEvent } from '../../decision/types/homeDecision';
import type { IrrigationEconomicsSnapshot } from '../types/irrigationEconomics';

export function buildIrrigationEconomicsDecision(snapshot: IrrigationEconomicsSnapshot | null | undefined): HomeDecisionEvent | null {
  if (!snapshot || snapshot.status === 'not_applicable') return null;
  if (snapshot.status === 'ready' && snapshot.decisionCode === 'irrigate_now' && snapshot.recommended.energyCostTry != null) {
    return { id:`irrigation-economics:${snapshot.fieldId}:${snapshot.generatedAt.slice(0,10)}`, group:'irrigation-economics', source:'irrigation-economics', sourceModel:'irrigation-economics-engine-v19', signal:{status:'ready',observedAt:snapshot.generatedAt,maxAgeHours:24}, priority:82, severity:'info', target:'irrigation_detail', channels:['today','pusula'], kind:'do', label:'SULAMA MALİYETİ', title:`Sulamanın tahmini enerji maliyeti ${snapshot.recommended.energyCostTry.toLocaleString('tr-TR',{maximumFractionDigits:0})} TL`, detail:`${snapshot.recommended.totalGrossWaterM3?.toLocaleString('tr-TR',{maximumFractionDigits:0}) ?? '—'} m³ brüt su · ${snapshot.recommended.energyKwh?.toLocaleString('tr-TR',{maximumFractionDigits:1}) ?? '—'} kWh. Su miktarı production Sulama Motoru'ndan, maliyet kayıtlı pompa profilinden gelir.`, evidence:snapshot.evidence, confidence:'medium', today:{tone:'cyan',visual:'irrigation',iconKey:'water',iconClass:'water'} };
  }
  if (snapshot.status === 'needs_data' && snapshot.decisionCode === 'irrigate_now') {
    return { id:`irrigation-economics:${snapshot.fieldId}:needs-data`, group:'irrigation-economics', source:'irrigation-economics', sourceModel:'irrigation-economics-engine-v19', signal:{status:'needs-data',observedAt:snapshot.generatedAt,maxAgeHours:168}, priority:42, severity:'info', target:'irrigation_detail', channels:['notification'], kind:'data', label:'SULAMA EKONOMİSİ', title:'Pompa/enerji bilgilerini tamamla', detail:`Sulama maliyeti için eksik: ${snapshot.missing.join(', ')}. Bu bilgiler olmadan brüt su ve enerji maliyeti uydurulmaz.`, evidence:snapshot.evidence, confidence:'preliminary', notification:{iconKey:'document',iconTone:'cyan',dotTone:'info'} };
  }
  return null;
}
