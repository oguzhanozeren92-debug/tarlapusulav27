import type { ContentCatalogSource } from '../../knowledge/data/sources';
import type { RawSourceItem } from './contentSourceAdapter.types';
import { getSourceAdapter } from './contentSourceAdapterRegistry.service';
import { runEnrichedContentPipeline, type KnowledgeCardLite } from './contentEnrichedPipeline.service';
import { persistFinalCandidates } from './contentCandidateDb.service';

export interface ScanSourceInput {
  source:ContentCatalogSource;
  sourceId:string|null;
}

export interface ScanBatchResult {
  scannedSources:number;
  fetchedItems:number;
  candidatesCreated:number;
  duplicates:number;
  warnings:string[];
}

export async function scanSourcesToDatabase(
  inputs:ScanSourceInput[],
  knowledgeCards:KnowledgeCardLite[]=[],
  limitPerSource=6,
):Promise<ScanBatchResult>{
  const pipelineInputs:{source:ContentCatalogSource;item:RawSourceItem;sourceId:string|null}[]=[];
  const warnings:string[]=[];

  for(const input of inputs){
    try{
      const adapter=getSourceAdapter(input.source);
      if(!adapter){
        warnings.push(`${input.source.name}: otomatik adaptör yok; manuel/RSS/API bağlantısı gerekli.`);
        continue;
      }
      const result=await adapter.fetch(input.source,limitPerSource);
      warnings.push(...result.warnings.map(x=>`${input.source.name}: ${x}`));
      for(const item of result.items) pipelineInputs.push({source:input.source,item,sourceId:input.sourceId});
    }catch(error){
      warnings.push(`${input.source.name}: ${error instanceof Error?error.message:String(error)}`);
    }
  }

  const finals=runEnrichedContentPipeline(
    pipelineInputs.map(({source,item})=>({source,item})),
    knowledgeCards,
  );

  let candidatesCreated=0,duplicates=0;
  for(const candidate of finals){
    const owner=pipelineInputs.find(x=>x.item.url===candidate.sourceUrl);
    const saved=await persistFinalCandidates(owner?.sourceId||null,[candidate]);
    candidatesCreated+=saved.created;
    duplicates+=saved.duplicates;
  }

  return {
    scannedSources:inputs.length,
    fetchedItems:pipelineInputs.length,
    candidatesCreated,
    duplicates,
    warnings,
  };
}
