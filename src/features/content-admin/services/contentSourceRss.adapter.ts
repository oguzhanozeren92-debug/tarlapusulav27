import type {
  ContentSourceAdapter,
  RawSourceItem,
  SourceAdapterContext,
} from './contentSourceAdapter.types';
import { SourceAdapterError } from './contentSourceAdapter.types';

const decode = (value: string) =>
  value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();

const tag = (xml: string, name: string) => {
  const match = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'));
  return match ? decode(match[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() : '';
};

function parseFeed(xml: string): RawSourceItem[] {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []),
  ];

  return blocks.map((block) => {
    const href = block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1] || tag(block, 'link');
    return {
      title: tag(block, 'title'),
      url: href,
      summary: tag(block, 'description') || tag(block, 'summary') || tag(block, 'content'),
      publishedAt: tag(block, 'pubDate') || tag(block, 'published') || tag(block, 'updated'),
      externalId: tag(block, 'guid') || tag(block, 'id'),
    };
  }).filter((item) => item.title && item.url);
}

export const contentSourceRssAdapter: ContentSourceAdapter = {
  id: 'rss',
  supports(source) {
    return source.ingestion === 'rss';
  },
  async fetch({ source, signal }: SourceAdapterContext) {
    try {
      const response = await fetch(source.url, {
        signal,
        headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseFeed(await response.text());
    } catch (error) {
      throw new SourceAdapterError(
        'RSS kaynağı doğrudan okunamadı. CORS engeli varsa backend/edge proxy kullanılmalı.',
        source.id,
        error,
      );
    }
  },
};
