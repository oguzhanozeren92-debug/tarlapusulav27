import type { ContentCatalogSource } from '../../knowledge/data/sources';
import type { RawSourceItem } from './contentSourceAdapter.types';
import { enrichSourceItem, type EnrichedCandidate } from './contentCandidateEnrichment.service';
import { clusterContentEvents } from './contentEventCluster.service';
import { crossVerifyCluster } from './contentCrossVerification.service';
import { matchKnowledgeUpdate } from './knowledgeUpdateMatcher.service';
import { buildFinalCandidate, type FinalCandidate } from './contentFinalCandidate.service';
import { rankEditorialCandidates } from './contentEditorialRanking.service';

export interface PipelineInput { source:ContentCatalogSource; item:RawSourceItem; }
export interface KnowledgeCardLite { id:string;title:string;cropTags?:string[];topicTags?:string[]; }

export function runEnrichedContentPipeline(
  inputs:PipelineInput[],
  knowledgeCards:KnowledgeCardLite[]=[],
):FinalCandidate[]{
  const enriched=inputs.map(({source,item})=>({source,item:enrichSourceItem(source,item)}));
  const clusters=clusterContentEvents(enriched.map(x=>x.item));
  const output:FinalCandidate[]=[];

  for(const cluster of clusters){
    const members=enriched.filter(x=>cluster.items.some((c:EnrichedCandidate)=>c.url===x.item.url));
    if(!members.length) continue;
    const primary=members.sort((a,b)=>b.item.sourceConfidence-a.item.sourceConfidence)[0];
    const verification=crossVerifyCluster(cluster);
    const match=primary.source.kind==='news'?null:matchKnowledgeUpdate(primary.item,knowledgeCards);
    output.push(buildFinalCandidate(primary.source,primary.item,verification,match));
  }
  return rankEditorialCandidates(output);
}
