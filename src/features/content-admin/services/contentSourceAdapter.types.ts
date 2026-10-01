export interface RawSourceItem {
  id?:string;
  title:string;
  url:string;
  summary?:string;
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
