export interface RawSourceItem {
  id?:string;
  title:string;
  url:string;
  summary?:string;
  externalId?:string;
  publishedAt?:string;
  author?:string;
  doi?:string;
  language?:'tr'|'en';
  cropTags?:string[];
  regionTags?:string[];
  topicTags?:string[];
  metadata?:Record<string,unknown>;
}

export interface SourceAdapterResult {
  items:RawSourceItem[];
  warnings:string[];
}

export interface SourceAdapter {
  supports(source:any):boolean;
  fetch(source:any,limit?:number):Promise<SourceAdapterResult>;
}

import type { ContentCatalogSource } from '../../knowledge/data/sources';
export interface SourceAdapterContext { source: ContentCatalogSource; signal?: AbortSignal; limit?: number; }
export interface ContentSourceAdapter {
  id: string;
  supports(source: ContentCatalogSource): boolean;
  fetch(context: SourceAdapterContext): Promise<RawSourceItem[]>;
}
export class SourceAdapterError extends Error {
  readonly sourceId: string;
  readonly cause: unknown;
  constructor(message: string, sourceId: string, cause?: unknown) {
    super(message);
    this.name = 'SourceAdapterError';
    this.sourceId = sourceId;
    this.cause = cause;
  }
}
