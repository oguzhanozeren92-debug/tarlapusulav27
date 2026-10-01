import { appendCandidateAudit } from './contentCandidateAudit.service';
import {
  setContentSourceCandidateStatus,
  type SourceCandidateStatus,
} from './contentSourceCandidate.service';

export type AdminDecision='review'|'approve'|'reject';

const statusMap:Record<AdminDecision,SourceCandidateStatus>={
  review:'review',
  approve:'approved',
  reject:'rejected',
};

export function applyAdminCandidateDecision(
  candidateId:string,
  decision:AdminDecision,
  note?:string,
){
  const updated=setContentSourceCandidateStatus(candidateId,statusMap[decision]);
  if(updated){
    appendCandidateAudit(
      candidateId,
      decision==='approve'?'approved':decision==='reject'?'rejected':'reviewed',
      note,
    );
  }
  return updated;
}
