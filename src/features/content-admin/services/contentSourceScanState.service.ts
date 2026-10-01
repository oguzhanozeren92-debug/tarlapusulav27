import type { SourceScanResult } from './contentSourceScanner.service';

export interface SourceScanState {
  sourceId: string;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastSuccessAt?: string;
  found: number;
  imported: number;
  status: 'idle' | 'running' | 'success' | 'skipped' | 'error';
  message?: string;
}

const KEY='tp_content_source_scan_state_v1';
const EVENT='tp:content-source-scan-state';

function read(): Record<string,SourceScanState>{
  if(typeof window==='undefined') return {};
  try{return JSON.parse(localStorage.getItem(KEY)||'{}')||{};}catch{return {};}
}
function write(value:Record<string,SourceScanState>){
  if(typeof window==='undefined') return;
  localStorage.setItem(KEY,JSON.stringify(value));
  window.dispatchEvent(new CustomEvent(EVENT));
}
export function listSourceScanStates(){return read();}
export function getSourceScanState(sourceId:string):SourceScanState{
  return read()[sourceId]||{sourceId,found:0,imported:0,status:'idle'};
}
export function markSourceScanStarted(sourceId:string){
  const all=read(), old=getSourceScanState(sourceId);
  all[sourceId]={...old,status:'running',lastStartedAt:new Date().toISOString(),message:undefined};
  write(all); return all[sourceId];
}
export function markSourceScanFinished(result:SourceScanResult){
  const all=read(), old=getSourceScanState(result.sourceId), time=new Date().toISOString();
  all[result.sourceId]={
    ...old,sourceId:result.sourceId,status:result.status,found:result.found,imported:result.imported,
    lastFinishedAt:time,lastSuccessAt:result.status==='success'?time:old.lastSuccessAt,message:result.message,
  };
  write(all); return all[result.sourceId];
}
export function subscribeSourceScanStates(cb:()=>void){
  if(typeof window==='undefined') return ()=>undefined;
  const fn=()=>cb(); window.addEventListener(EVENT,fn); window.addEventListener('storage',fn);
  return ()=>{window.removeEventListener(EVENT,fn);window.removeEventListener('storage',fn);};
}
