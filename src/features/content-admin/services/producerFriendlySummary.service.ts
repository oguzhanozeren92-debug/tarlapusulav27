const SPACE=/\s+/g;
const TECHNICAL=[
  ['utilization','kullanım'],['management','yönetim'],['application','uygulama'],
  ['irrigation','sulama'],['fertilization','gübreleme'],['disease','hastalık'],
  ['pest','zararlı'],['yield','verim'],['soil','toprak'],['crop','ürün'],
] as const;
function clean(value:string){return value.replace(/<[^>]*>/g,' ').replace(SPACE,' ').trim();}
export function buildProducerFriendlySummary(title:string,summary:string,max=420){
  let value=clean(summary||title);
  for(const [from,to] of TECHNICAL) value=value.replace(new RegExp(`\\b${from}\\b`,'gi'),to);
  const sentences=value.split(/(?<=[.!?])\s+/).filter(Boolean);
  let result='';
  for(const sentence of sentences){
    if((result+' '+sentence).trim().length>max) break;
    result=(result+' '+sentence).trim();
    if(result.length>220) break;
  }
  if(!result) result=value.slice(0,max);
  return result.length>max?`${result.slice(0,max-1).trim()}…`:result;
}
export function producerUsefulnessScore(text:string){
  const v=clean(text).toLocaleLowerCase('tr-TR');
  const useful=['sulama','gübre','hastalık','zararlı','toprak','verim','hasat','ekim','üretici','ürün','don','kurak'];
  const technical=['neural','benchmark','architecture','transformer','embedding'];
  let score=50; useful.forEach(x=>{if(v.includes(x))score+=6;}); technical.forEach(x=>{if(v.includes(x))score-=5;});
  return Math.max(0,Math.min(100,score));
}
