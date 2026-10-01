import { useEffect, useState } from 'react';
import type { IrrigationDecisionResult } from '../../irrigation/types/irrigationDecision';
import { loadIrrigationEconomicsSnapshot } from '../services/irrigationEconomics.service';
import type { IrrigationEconomicsSnapshot } from '../types/irrigationEconomics';
export function useIrrigationEconomicsContext(fieldId: string|number|null|undefined, decision: IrrigationDecisionResult|null|undefined) {
 const key=fieldId==null?'':String(fieldId); const [snapshot,setSnapshot]=useState<IrrigationEconomicsSnapshot|null>(null); const [loading,setLoading]=useState(false); const [nonce,setNonce]=useState(0);
 useEffect(()=>{let cancelled=false;if(!key){setSnapshot(null);return;}setLoading(true);void loadIrrigationEconomicsSnapshot(key,decision??null).then(v=>{if(!cancelled)setSnapshot(v)}).catch(()=>{if(!cancelled)setSnapshot(null)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[key,decision?.generatedAt,decision?.decision,decision?.recommendation?.netWaterMm,nonce]);
 useEffect(()=>{if(typeof window==='undefined')return;const handler=(event:Event)=>{const changed=String((event as CustomEvent)?.detail?.fieldId??'');if(!changed||changed===key)setNonce(v=>v+1)};window.addEventListener('tp:irrigation-economics-updated',handler as EventListener);return()=>window.removeEventListener('tp:irrigation-economics-updated',handler as EventListener)},[key]);
 return {snapshot,loading,refresh:()=>setNonce(v=>v+1)};
}
