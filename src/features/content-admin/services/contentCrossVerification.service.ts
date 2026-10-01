import type { EventCluster } from './contentEventCluster.service';
export interface VerificationResult{verified:boolean;score:number;label:string;sourceCount:number;}
export function verifyEventCluster(cluster:EventCluster):VerificationResult{
 const count=cluster.sourceCount;
 const avg=cluster.items.reduce((s,x)=>s+x.sourceConfidence,0)/Math.max(1,count);
 const bonus=Math.min(15,(count-1)*5);
 const score=Math.min(100,Math.round(avg+bonus));
 return {verified:count>=2||score>=90,score,label:count>=3?'Çoklu kaynak':count===2?'İki kaynak':'Tek kaynak',sourceCount:count};
}
