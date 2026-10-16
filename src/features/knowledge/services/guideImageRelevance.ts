/** Source metadata only: generated alt text must never count as evidence. */
export type GuideVisualContext = { title:string; summary?:string|null; topic?:string|null };
export type GuideImageEvidence = { caption?:string|null; original_url?:string|null };
function norm(value:unknown) {
 return String(value || '').toLocaleLowerCase('tr-TR').normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i').replace(/ğ/g, 'g')
  .replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c');
}
export function isRelevantGuideImage(image:GuideImageEvidence,context:GuideVisualContext) {
 const desc=norm((image.caption||'')+' '+(image.original_url||''));
 const subject=norm(context.title+' '+(context.topic||'')+' '+(context.summary||''));
 if(!desc.trim())return false;
 const harvest=/combine|thresh|harvest|harvesting|baler|tractor|grain trailer|mowing|wheat fields|field agriculture/.test(desc);
 if(/don|soguk|frost|freez/.test(subject))
  return !harvest && /frost|freez|frozen|winterkill|cold injury|cold damage|don zarar/.test(desc)
   && /wheat|barley|cereal|grain|plant|leaf|leaves|crop|arpa|bugday/.test(desc);
 if(/cokerten|damping.off/.test(subject))
  return /damping.off|seedling rot|root rot|seedling blight/.test(desc) && /seedling|plant|crop|stem|root/.test(desc);
 if(/sari pas|yellow rust|rust disease/.test(subject))
  return /rust|puccinia/.test(desc) && /wheat|barley|leaf|leaves|crop/.test(desc);
 if(/azot eksik|nitrogen deficien|nitrojen eksik/.test(subject))
  return /nitrogen|chlorosis|azot/.test(desc) && /deficien|yellow|chloros|plant|leaf|leaves/.test(desc);
 if(/kurak|drought damage|drought stress/.test(subject))
  return /drought|wilting|water stress|kurak/.test(desc) && /wheat|crop|plant|leaf|leaves|field/.test(desc);
 if(/zararli|yaprak biti|aphid|insect pest/.test(subject))
  return /aphid|insect|pest|beetle|mite|weevil|borer|larva/.test(desc) && /crop|plant|leaf|leaves|wheat|cereal|barley/.test(desc);
 if(/toprak analiz|soil analy|soil sampl/.test(subject))
  return /soil sample|soil test|soil analysis|soil laboratory|soil testing/.test(desc);
 if(/tozlas|polen|pollinat/.test(subject))
  return /pollinat|flower|blossom|bee|pollen/.test(desc) && /almond|orchard|flower|fruit tree|badem/.test(desc);
 if(/herbisit|herbicide|yabanci ot|weed control/.test(subject))
  return /herbicide|weed|spray|sprayer|chemical control/.test(desc)
   && !/fertili[sz]er spread|fertili[sz]er spinner|harvest|combine/.test(desc);
 if(/biyolojik mucadele|biological control/.test(subject))
  return /biological control|predator|parasitoid|beneficial insect|ladybird|lacewing|natural enemy/.test(desc);
 if(/tuzak|trap|zararli izleme/.test(subject))
  return /sticky trap|insect trap|pheromone trap|monitoring trap|yellow trap/.test(desc);
 if(harvest&&!/hasat|makine|traktor|bicerdöver|harvest|mechaniz/.test(subject))return false;
 const tokens=norm(context.title).split(/[^a-z0-9]+/).filter(w=>w.length>=4
  && !['tarim','tarla','rehberi','bitki','bitkiler','icin','nasil','uygula','kontrol','yontem','bilgi'].includes(w));
 return tokens.length>0&&tokens.some(w=>desc.includes(w));
}
