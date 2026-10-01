export interface AutoTags{cropTags:string[];regionTags:string[];topicTags:string[];}
const CROPS:Record<string,string[]>={
  buğday:['buğday','wheat'],arpa:['arpa','barley'],mısır:['mısır','corn','maize'],
  ayçiçeği:['ayçiçeği','sunflower'],pamuk:['pamuk','cotton'],fındık:['fındık','hazelnut'],
  zeytin:['zeytin','olive'],üzüm:['üzüm','grape'],incir:['incir','fig'],narenciye:['narenciye','citrus'],
};
const TOPICS:Record<string,string[]>={
  sulama:['sulama','irrigation','water'],gübreleme:['gübre','fertilizer','fertilisation','fertilization'],
  hastalık:['hastalık','disease','fungus','fungal','rust'],zararlı:['zararlı','pest','insect'],
  toprak:['toprak','soil'],hasat:['hasat','harvest'],verim:['verim','yield'],
  kuraklık:['kurak','drought'],don:['don','frost'],yabancı_ot:['yabancı ot','weed'],
};
const REGIONS:Record<string,string[]>={
  Türkiye:['türkiye','turkey'],Karadeniz:['karadeniz','black sea'],Akdeniz:['akdeniz','mediterranean'],
  Ege:['ege','aegean'],Avrupa:['europe','european'],ABD:['usa','u.s.','united states'],
};
function match(text:string,map:Record<string,string[]>){
  const v=text.toLocaleLowerCase('tr-TR');
  return Object.entries(map).filter(([,keys])=>keys.some(k=>v.includes(k))).map(([key])=>key);
}
export function autoTagContent(title:string,summary:string):AutoTags{
  const text=`${title} ${summary}`;
  return {cropTags:match(text,CROPS),regionTags:match(text,REGIONS),topicTags:match(text,TOPICS)};
}
