import type { ContentCatalogSource } from '../../knowledge/data/sources';
import type { RawSourceItem } from './contentSourceAdapter.types';
import { prepareFreeTranslation } from './contentFreeTranslation.service';
import { createProducerFriendlySummary, producerUsefulnessScore } from './producerFriendlySummary.service';
import { autoTagContent } from './contentAutoTagger.service';
import { calculateContentReliability } from './contentReliabilityScore.service';

export interface EnrichedCandidate {
  title:string;url:string;publishedAt?:string;summary:string;
  originalTitle:string;originalSummary:string;
  language:'tr'|'en';
  translationStatus:'not_needed'|'dictionary_assisted'|'needs_review';
  cropTags:string[];regionTags:string[];topicTags:string[];
  producerValue:number;sourceConfidence:number;reliabilityReasons:string[];
}

const uniq=(v:string[])=>[...new Set(v.filter(Boolean))];

export function enrichSourceItem(source:ContentCatalogSource,item:RawSourceItem):EnrichedCandidate{
  const language=(item.language||source.language||'tr') as 'tr'|'en';
  const originalTitle=String(item.title||'').trim();
  const originalSummary=String(item.summary||'').trim();
  const tr=prepareFreeTranslation(originalTitle,originalSummary,language);
  const tags=autoTagContent(`${tr.titleTr} ${tr.summaryTr}`);
  const summary=createProducerFriendlySummary(tr.summaryTr||tr.titleTr);
  const reliability=calculateContentReliability(source,item);
  return {
    title:tr.titleTr,url:item.url,publishedAt:item.publishedAt,summary,
    originalTitle,originalSummary,language,translationStatus:tr.translationStatus,
    cropTags:uniq([...(item.cropTags||[]),...tags.cropTags]),
    regionTags:uniq([...(item.regionTags||[]),...tags.regionTags]),
    topicTags:uniq([...(item.topicTags||[]),...tags.topicTags]),
    producerValue:producerUsefulnessScore(`${tr.titleTr} ${summary}`),
    sourceConfidence:reliability.score,reliabilityReasons:reliability.reasons,
  };
}
