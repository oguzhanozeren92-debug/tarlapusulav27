export interface TranslationInput {
  title:string; summary?:string; language:'tr'|'en';
}
export interface TranslationResult {
  originalTitle:string; originalSummary:string; titleTr:string; summaryTr:string;
  translated:boolean; translationStatus:'not_needed'|'pending_ai'|'translated';
}
export function prepareTurkishTranslation(input:TranslationInput):TranslationResult{
  const title=input.title.trim(), summary=(input.summary||'').trim();
  if(input.language==='tr') return {
    originalTitle:title,originalSummary:summary,titleTr:title,summaryTr:summary,
    translated:false,translationStatus:'not_needed',
  };
  return {
    originalTitle:title,originalSummary:summary,titleTr:title,summaryTr:summary,
    translated:false,translationStatus:'pending_ai',
  };
}
export function applyTurkishTranslation(
  base:TranslationResult,titleTr:string,summaryTr:string,
):TranslationResult{
  return {...base,titleTr:titleTr.trim()||base.originalTitle,
    summaryTr:summaryTr.trim()||base.originalSummary,translated:true,translationStatus:'translated'};
}
