-- Curated editorial source adjustment (idempotent; data rows only, no DDL).
-- No scraped image or article is automatically licensed for reuse.
begin;

update public.content_sources
set active=false, updated_at=now(),
 metadata=coalesce(metadata,'{}'::jsonb)||'{"disabled_reason":"source-quality-review-2026-11-09","source_status":"secondary-paused"}'::jsonb
where name in (
 'Google News · Dünya Bitkisel Tarım',
 'Global Agriculture',
 'Farms.com · Agriculture News',
 'AgFunderNews · AgTech'
) and active=true;

update public.content_sources set
  active=true,source_type='rss',
  base_url='https://www.fao.org/feeds/fao-newsroom-rss',
  trust_score=98,scan_frequency_hours=12,
  metadata=coalesce(metadata,'{}'::jsonb) ||
  jsonb_build_object(
    'channel','news','coverage_scope','world','institution','FAO',
    'priority','high','source_role','official_agricultural_news',
    'producer_focus',true,'translation_required',true,
    'editorial_mode','crop_first_global',
    'include_pattern','crop|wheat|cereal|maize|rice|drought|frost|yield|soil|irrigation|water|pollinator|agricultur|plant protection|harvest|grain|farmer|seed|food price',
    'exclude_pattern','livestock|cattle|dairy|meat|fisher|aquaculture|poultry|animal disease|conference announcement|award ceremony',
    'image_license','review','content_license','review'),
  updated_at=now()
where name='FAO Newsroom · Stories';

update public.content_sources set
 active=true,source_type='official',
 trust_score=98,scan_frequency_hours=24,
 metadata=coalesce(metadata,'{}'::jsonb) ||
 jsonb_build_object(
  'channel','news','coverage_scope','world','source_role','EU_crop_monitoring',
  'priority','high','producer_focus',true,'translation_required',true,
  'include_pattern','mars|crop|yield|drought|heat|frost|water|soil|weather|harvest|sowing|winter|summer',
  'exclude_pattern','survey|subscribe|unsubscribe|contact|profile|about|career|event|conference|workshop|vacancy|procurement',
  'content_license','review','image_license','review'),
 updated_at=now()
where name='JRC MARS Bulletin';

update public.content_sources set
 base_url='https://www.cimmyt.org/category/news/',
 source_type='official',trust_score=96,active=true,
 metadata=coalesce(metadata,'{}'::jsonb)||
 '{"channel":"news","coverage_scope":"world","source_role":"wheat_maize_science","producer_focus":true,"translation_required":true,"content_license":"review","image_license":"review"}'::jsonb,
 updated_at=now()
where name='CIMMYT — Crop Research News';

-- New official organizations: source relevance/translation gates apply before
-- an item becomes a candidate; source accessibility is monitored separately.
insert into public.content_sources
(name,base_url,source_type,language,country,trust_score,active,scan_frequency_hours,metadata)
select src.name,src.base_url,src.source_type,src.language,src.country,src.trust_score,true,src.scan_frequency_hours,src.metadata
from (values
 ('WMO · İklim ve Tarım Riskleri','https://wmo.int/news','official','en',null::text,97,24,
  '{"channel":"news","coverage_scope":"world","priority":"high","source_role":"climate_drought_frost","producer_focus":true,"translation_required":true,"include_pattern":"drought|heat|flood|weather|climate|El Niño|La Niña|rainfall|agricultur|crop|irrigation|water|extreme","exclude_pattern":"aviation|award|job|vacancy|internship|committee|appointment|career|space mission","content_license":"review","image_license":"review","item_selector":"main a[href], article a[href]"}'::jsonb),
 ('USDA NASS · Tarım İstatistik Haberleri','https://www.nass.usda.gov/rss/news.xml','rss','en','US',95,24,
  '{"channel":"news","coverage_scope":"world","priority":"high","source_role":"official_crop_statistics","producer_focus":true,"translation_required":true,"include_pattern":"crop|wheat|corn|maize|soy|grain|yield|harvest|acreage|production|planting|farmer|irrigation|agricultur","exclude_pattern":"livestock|dairy|cattle|hog|poultry|meat|milk","content_license":"review","image_license":"review"}'::jsonb),
 ('USDA FAS · Dünya Üretim Raporları','https://fas.usda.gov/data','official','en','US',96,48,
  '{"channel":"news","coverage_scope":"world","priority":"high","source_role":"official_crop_market_reports","producer_focus":true,"translation_required":true,"include_pattern":"wheat|corn|rice|oilseed|soybean|grain|commodity|world agricultur|production|supply|demand|export|import|crop","exclude_pattern":"career|employment|award|meeting|subscribe|contact","content_license":"review","image_license":"review","item_selector":"main a[href], article a[href]"}'::jsonb)
) as src(name,base_url,source_type,language,country,trust_score,scan_frequency_hours,metadata)
where not exists (
 select 1 from public.content_sources dest
 where dest.base_url=src.base_url or dest.name=src.name
);
commit;
