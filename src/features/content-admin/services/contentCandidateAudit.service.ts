export type CandidateAuditAction =
  | 'created' | 'translated' | 'reviewed' | 'approved' | 'rejected' | 'published';

export interface CandidateAuditEntry {
  id:string;
  candidateId:string;
  action:CandidateAuditAction;
  at:string;
  note?:string;
}

const KEY='tp_content_candidate_audit_v1';

function read():CandidateAuditEntry[]{
  if(typeof window==='undefined') return [];
  try{return JSON.parse(localStorage.getItem(KEY)||'[]')||[];}catch{return [];}
}

export function appendCandidateAudit(candidateId:string,action:CandidateAuditAction,note?:string){
  const items=read();
  const entry:CandidateAuditEntry={
    id:crypto.randomUUID(),candidateId,action,at:new Date().toISOString(),note,
  };
  items.unshift(entry);
  if(typeof window!=='undefined') localStorage.setItem(KEY,JSON.stringify(items.slice(0,1000)));
  return entry;
}

export function getCandidateAudit(candidateId:string){
  return read().filter(x=>x.candidateId===candidateId);
}
