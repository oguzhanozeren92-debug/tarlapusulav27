import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  latestCropPublication,
  normalizeCropForContent,
  publicationSignalSeenKey,
} from './pusulaContentSignals.ts';

const now = new Date('2026-11-09T18:00:00.000Z');
const date = '2026-11-08T10:00:00.000Z';
const article = (cropTags, title = 'Üzüm bağlarında sulama araştırması') => ({
  id: 'published-article-1',
  content_type: 'knowledge', content_subtype: 'article',
  title, crop_tags: cropTags, published_at: date,
  source_refs: [{ source_name: 'Üniversite tarım dergisi' }],
});
test('uses exact, known crop metadata, never title alone', () => {
  assert.equal(normalizeCropForContent('Asma'), 'üzüm');
  assert.equal(normalizeCropForContent('grapevine'), 'üzüm');
  assert.equal(normalizeCropForContent('ürün belirtilmedi'), '');
  assert.equal(latestCropPublication([article([])], 'Üzüm', now), null);
  assert.equal(latestCropPublication([article(['elma'])], 'Üzüm', now), null);
  assert.equal(latestCropPublication([article(['asma'])], 'Üzüm', now)?.kind, 'article');
});
test('does not announce unpublished, stale, future, or undated publications', () => {
  const stale = { ...article(['üzüm']), published_at: '2026-10-01T09:00:00Z' };
  const future = { ...article(['üzüm']), published_at: '2026-12-01T09:00:00Z' };
  const undated = { ...article(['üzüm']), published_at: null };
  assert.equal(latestCropPublication([stale, future, undated], 'Üzüm', now), null);
});
test('correctly prefers newest tagged publication and user/field-specific dedupe', () => {
  const news = {
    id: 'news-2', content_type: 'news', title: 'Yeni üzüm haberi',
    crop_tags: ['grapes'], published_at: '2026-11-09T16:00:00Z',
  };
  const match = latestCropPublication([article(['üzüm']), news], 'Üzüm', now);
  assert.equal(match?.id, 'news-2');
  assert.equal(match?.kind, 'news');
  assert.notEqual(
    publicationSignalSeenKey('user-a','field-a', 'news-2'),
    publicationSignalSeenKey('user-a','field-b', 'news-2'),
  );
});
test('global Pusula offers deep-linked published content and refresh on resume', () => {
  const global = readFileSync(new URL('../../../components/GlobalPusulaBand.tsx', import.meta.url),'utf8');
  const agenda = readFileSync(new URL('../../content-public/PublishedAgriNewsBridge.tsx', import.meta.url), 'utf8');
  assert.match(global, /latestCropPublication\(all, crop\)/);
  assert.match(global, /publicationSignalSeenKey/);
  assert.match(global, /\.eq\('status', 'published'\)/);
  assert.match(global, /'tp_pusula_content_open_v1'/);
  assert.match(global, /visibilitychange/);
  assert.match(agenda, /tp_pusula_content_open_v1/);
  assert.match(agenda, /void openDetail\(item\)/);
});

test('frost push is based on FUTURE hourly temperatures and keeps the field and risk window', () => {
 const frost = readFileSync(new URL('../../../../supabase/functions/send-due-reminders/dailyWeather.ts',import.meta.url),'utf8');
 assert.match(frost,/searchParams\.set\("hourly", "temperature_2m"\)/);
 assert.match(frost,/point\.at >= nowMs/);
 assert.match(frost,/frost-watch:/);
 assert.match(frost,/push_critical: forecast\.frostMinNext24h <= 0/);
 assert.match(frost,/forecast\.frostFirstAt/);
});
