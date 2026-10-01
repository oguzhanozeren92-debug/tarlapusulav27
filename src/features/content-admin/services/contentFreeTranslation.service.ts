export interface FreeTranslationResult {
  titleTr:string;
  summaryTr:string;
  translated:boolean;
  translationStatus:'not_needed'|'dictionary_assisted'|'needs_review';
}

const dictionary:Record<string,string>={
  wheat:'buğday',barley:'arpa',maize:'mısır',corn:'mısır',sunflower:'ayçiçeği',
  cotton:'pamuk',hazelnut:'fındık',olive:'zeytin',grape:'üzüm',fig:'incir',
  irrigation:'sulama',drought:'kuraklık',frost:'don',soil:'toprak',
  disease:'hastalık',pest:'zararlı',weed:'yabancı ot',fertilizer:'gübre',
  fertilization:'gübreleme',yield:'verim',harvest:'hasat',water:'su',
  nitrogen:'azot',phosphorus:'fosfor',potassium:'potasyum',
};

function assist(text:string){
  let out=text;
  for(const [en,tr] of Object.entries(dictionary))
    out=out.replace(new RegExp(`\\b${en}\\b`,'gi'),tr);
  return out.replace(/\s+/g,' ').trim();
}

export function prepareFreeTranslation(title:string,summary:string,language:'tr'|'en'):FreeTranslationResult{
  if(language==='tr') return {titleTr:title,summaryTr:summary,translated:true,translationStatus:'not_needed'};
  const titleTr=assist(title),summaryTr=assist(summary);
  const changed=titleTr!==title||summaryTr!==summary;
  return {titleTr,summaryTr,translated:false,translationStatus:changed?'dictionary_assisted':'needs_review'};
}
