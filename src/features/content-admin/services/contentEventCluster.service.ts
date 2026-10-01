import type { EnrichedCandidate } from './contentCandidateEnrichment.service';
export interface EventCluster{key:string;primary:EnrichedCandidate;items:EnrichedCandidate[];sourceCount:number;}
const words=(v:string)=>new Set(v.toLocaleLowerCase('tr-TR').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(x=>x.length>3));
function sim(a:string,b:string){const A=words(a),B=words(b);if(!A.size||!B.size)return 0;let hit=0;A.forEach(x=>{if(B.has(x))hit++;});return hit/Math.max(A.size,B.size);}
export function clusterContentEvents(items:EnrichedCandidate[]):EventCluster[]{
 const clusters:EventCluster[]=[];
 for(const item of items){
  const found=clusters.find(c=>sim(c.primary.title,item.title)>=.55);
  if(found){found.items.push(item);found.sourceCount=found.items.length;if(item.sourceConfidence>found.primary.sourceConfidence)found.primary=item;}
  else clusters.push({key:`event-${clusters.length+1}`,primary:item,items:[item],sourceCount:1});
 }
 return clusters;
}
