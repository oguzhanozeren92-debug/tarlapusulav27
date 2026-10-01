import { contentSourceCatalog, type ContentSourceKind } from '../../knowledge/data/sources';
import { listContentSourceCandidates } from './contentSourceCandidate.service';
import { canAutomaticallyScanSource } from './contentSourceAdapterRegistry.service';
import { getSourceScanState } from './contentSourceScanState.service';
import { scanOneSource, scanSourceGroup } from './contentSourceScanController.service';
import { buildAdminQueueDrafts } from './contentSourceQueueBridge.service';

export function getAdminSourceCenter(){
  return contentSourceCatalog.map(source=>({
    ...source,
    automatic:canAutomaticallyScanSource(source),
    scanState:getSourceScanState(source.id),
    pending:listContentSourceCandidates({sourceId:source.id,status:'new'}).length,
  }));
}
export function getAdminCandidateQueue(
  knowledgeCards:Array<{id:string;title:string;cropTags?:string[]}> = [],
){return buildAdminQueueDrafts(knowledgeCards);}
export async function runAdminSourceScan(sourceId:string,signal?:AbortSignal){
  return scanOneSource(sourceId,signal);
}
export async function runAdminGroupScan(kind?:ContentSourceKind,signal?:AbortSignal){
  return scanSourceGroup(kind,signal);
}
export function getAdminSourceStats(){
  const sources=getAdminSourceCenter();
  const candidates=listContentSourceCandidates();
  return {
    sources:sources.length,automatic:sources.filter(x=>x.automatic).length,
    pending:candidates.filter(x=>x.status==='new').length,
    review:candidates.filter(x=>x.status==='review').length,
    approved:candidates.filter(x=>x.status==='approved').length,
    errors:sources.filter(x=>x.scanState.status==='error').length,
  };
}
