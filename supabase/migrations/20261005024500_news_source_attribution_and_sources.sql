-- TarlaPusula news source policy, 2026-10-05
-- All imported news must preserve source attribution and original URL.

with incoming(name,base_url,source_type,language,country,trust_score,scan_frequency_hours,active,metadata) as (
  values
  (
    'tarlasera','https://www.tarlasera.com/','html','tr','TR',88,4,false,
    jsonb_build_object(
      'channel','news','priority','high','news_engine','news-v19-field-value-tr',
      'news_policy','turkish_producer_first','coverage_scope','turkey',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','specialist_crop_agronomy_and_producer_news',
      'source_attribution_required',true,
      'inactive_reason','publication_date_not_reliably_detected'
    )
  ),
  (
    'Bloomberg HT · Tarım','https://www.bloomberght.com/tarim','html','tr','TR',92,3,true,
    jsonb_build_object(
      'channel','news','priority','high','news_engine','news-v19-field-value-tr',
      'news_policy','turkish_producer_first','coverage_scope','turkey',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','agri_markets_inputs_crop_trade_weather',
      'source_attribution_required',true
    )
  ),
  (
    'Euronews Türkçe · Tarım/Ziraat','https://tr.euronews.com/tag/tarimziraat','html','tr','TR',88,6,true,
    jsonb_build_object(
      'channel','news','priority','normal','news_engine','news-v19-field-value-tr',
      'news_policy','turkish_producer_first','coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','world_agriculture_climate_policy_crop_markets',
      'source_attribution_required',true
    )
  ),
  (
    'Halk TV · Tarım','https://halktv.com.tr/tarim','html','tr','TR',72,4,true,
    jsonb_build_object(
      'channel','news','priority','low','news_engine','news-v19-field-value-tr',
      'news_policy','turkish_producer_first','coverage_scope','turkey',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','producer_price_harvest_local_crop_news',
      'headline_policy','strict_neutral_no_clickbait',
      'source_attribution_required',true
    )
  ),
  (
    'NTV · Tarım','https://www.ntv.com.tr/haberleri/tarim','html','tr','TR',82,4,false,
    jsonb_build_object(
      'channel','news','priority','normal','news_engine','news-v19-field-value-tr',
      'news_policy','turkish_producer_first','coverage_scope','turkey',
      'producer_focus',true,'source_attribution_required',true,
      'inactive_reason','source_http_403'
    )
  ),
  (
    'Tarım Orman Ekranı · Üretici Haberleri','https://www.tarimtv.gov.tr/tr/videolar/haberler','html','tr','TR',84,8,false,
    jsonb_build_object(
      'channel','news','priority','normal','news_engine','news-v19-field-value-tr',
      'news_policy','turkish_producer_first','coverage_scope','turkey',
      'producer_focus',true,'official_source',true,'official_pr_blocked',true,
      'source_focus','field_useful_crop_soil_water_plant_protection_only',
      'source_attribution_required',true,
      'inactive_reason','publication_date_not_reliably_detected_and_official_pr_heavy'
    )
  )
)
insert into public.content_sources(
  name,base_url,source_type,language,country,trust_score,active,scan_frequency_hours,metadata,updated_at
)
select name,base_url,source_type,language,country,trust_score,active,scan_frequency_hours,metadata,now()
from incoming
on conflict(base_url) do update
set name=excluded.name,
    source_type=excluded.source_type,
    language=excluded.language,
    country=excluded.country,
    trust_score=excluded.trust_score,
    active=excluded.active,
    scan_frequency_hours=excluded.scan_frequency_hours,
    metadata=coalesce(public.content_sources.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at=now();

update public.content_sources
set metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object('source_attribution_required',true),
    updated_at=now()
where base_url in (
  'https://www.dunya.com/sektorler/tarim',
  'https://www.gidabulteni.com/haberleri/tarim'
);
