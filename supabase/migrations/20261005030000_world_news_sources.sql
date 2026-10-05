-- TarlaPusula · Dünyadan Haberler source set
-- Foreign content must be translated fully to Turkish before review.
-- Every published news item preserves source name + original source URL.

-- Sources that work directly from the backend.
with incoming(name,base_url,source_type,trust_score,scan_frequency_hours,metadata) as (
  values
  (
    'World Grain',
    'https://www.world-grain.com/articles/topic/1024-commodities',
    'html',90,2,
    jsonb_build_object(
      'channel','news','priority','high','world_flow',true,'world_bucket','markets',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','global_grain_commodities_weather_trade',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href]',
      'include_pattern','/articles/',
      'exclude_pattern','(feed mill|feed facility|meat|livestock|aquafeed|company earnings|appoint|award|event|conference|mill explosion)'
    )
  ),
  (
    'Global Agriculture',
    'https://www.global-agriculture.com/',
    'html',84,4,
    jsonb_build_object(
      'channel','news','priority','high','world_flow',true,'world_bucket','agtech',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','seeds_fertilizer_biologicals_crop_protection_machinery_agtech',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href], main a[href]',
      'exclude_pattern','(livestock|dairy|meat|fish|food loss|startup funding|series [a-z]|investment|anniversary|award|event)'
    )
  ),
  (
    'AgFunderNews · AgTech',
    'https://agfundernews.com/',
    'html',82,5,
    jsonb_build_object(
      'channel','news','priority','normal','world_flow',true,'world_bucket','agtech',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','crop_robotics_precision_ag_ai_biologicals_plant_breeding',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href], main a[href]',
      'include_pattern','(agtech|robot|precision|crop|farm|agriculture|biological|plant|soil|irrigation|inoculant|genome|seed)',
      'exclude_pattern','(alternative protein|cultivated meat|restaurant|retail|livestock|animal ag|funding|raises|series [a-z]|venture|investor|profitability|creditor)'
    )
  ),
  (
    'CropLife · Smart Tech',
    'https://www.croplife.com/smart-tech/',
    'html',89,6,
    jsonb_build_object(
      'channel','news','priority','high','world_flow',true,'world_bucket','agtech',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','precision_ag_drones_spraying_ai_field_decision_tools',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href], main a[href]',
      'exclude_pattern','(sponsored|product of the year|award|webinar|event|retail week)'
    )
  ),
  (
    'Farmers Weekly · Arable',
    'https://www.fwi.co.uk/arable',
    'html',88,6,
    jsonb_build_object(
      'channel','news','priority','normal','world_flow',true,'world_bucket','policy',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','arable_crops_weather_yield_inputs_policy_technology',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href], main a[href]',
      'exclude_pattern','(livestock|dairy|sheep|beef|poultry|property|jobs|event|podcast|sponsored)'
    )
  ),
  (
    'Farm Progress · Market Reports',
    'https://www.farmprogress.com/keyword/market-reports',
    'html',86,6,
    jsonb_build_object(
      'channel','news','priority','normal','world_flow',true,'world_bucket','markets',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','corn_soy_wheat_crop_progress_export_grain_markets',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href], main a[href]',
      'exclude_pattern','(livestock|dairy|cattle|pork|whitepaper|sponsored|podcast|event)'
    )
  ),
  (
    'Farms.com · Agriculture News',
    'https://www.farms.com/ag-industry-news/',
    'html',80,6,
    jsonb_build_object(
      'channel','news','priority','low','world_flow',true,'world_bucket','policy',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','crop_weather_markets_agriculture_news',
      'source_attribution_required',true,'content_license','review',
      'item_selector','main h2 a[href], main h3 a[href], article h2 a[href], article h3 a[href], main a[href]',
      'exclude_pattern','(livestock|dairy|cattle|hog|poultry|job|classified|auction|equipment for sale)'
    )
  )
)
insert into public.content_sources(
  name,base_url,source_type,language,country,trust_score,active,scan_frequency_hours,metadata,updated_at
)
select name,base_url,source_type,'en',null,trust_score,true,scan_frequency_hours,metadata,now()
from incoming
on conflict(base_url) do update
set name=excluded.name,
    source_type=excluded.source_type,
    language='en',
    country=null,
    trust_score=excluded.trust_score,
    active=true,
    scan_frequency_hours=excluded.scan_frequency_hours,
    metadata=coalesce(public.content_sources.metadata,'{}'::jsonb) || excluded.metadata,
    updated_at=now();

-- Direct pages that block backend requests stay disabled; Google News RSS is used only as discovery.
update public.content_sources
set active=false,
    metadata=coalesce(metadata,'{}'::jsonb) || jsonb_build_object(
      'inactive_reason','direct_source_http_403_use_google_news_discovery'
    ),
    updated_at=now()
where base_url in (
  'https://www.agriculture.com/news/crops',
  'https://www.agriculture.com/markets',
  'https://www.agriculture.com/news/technology',
  'https://www.producer.com/markets/'
);

with fallback(name,base_url,trust_score,scan_frequency_hours,metadata) as (
  values
  (
    'Successful Farming · Crops & Markets',
    'https://news.google.com/rss/search?q=site%3Aagriculture.com%20(corn%20OR%20wheat%20OR%20soybean%20OR%20crop%20OR%20grain%20OR%20market)&hl=en-US&gl=US&ceid=US%3Aen',
    90,3,
    jsonb_build_object(
      'channel','news','priority','high','world_flow',true,'world_bucket','markets',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','crop_progress_weather_yield_grain_markets',
      'source_attribution_required',true,'content_license','review',
      'discovery_provider','google_news_rss','canonical_domain','agriculture.com',
      'exclude_pattern','(livestock|cattle|hog|poultry|dairy|podcast|newsletter|sponsored)'
    )
  ),
  (
    'Successful Farming · AgTech',
    'https://news.google.com/rss/search?q=site%3Aagriculture.com%20(%22precision%20agriculture%22%20OR%20technology%20OR%20drone%20OR%20AI%20OR%20irrigation)&hl=en-US&gl=US&ceid=US%3Aen',
    90,4,
    jsonb_build_object(
      'channel','news','priority','high','world_flow',true,'world_bucket','agtech',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','precision_ag_ai_drones_autonomy_irrigation_digital_farm',
      'source_attribution_required',true,'content_license','review',
      'discovery_provider','google_news_rss','canonical_domain','agriculture.com',
      'exclude_pattern','(livestock|dairy|cattle|foodtech|restaurant|sponsored)'
    )
  ),
  (
    'Western Producer · Crops & Markets',
    'https://news.google.com/rss/search?q=site%3Aproducer.com%20(wheat%20OR%20canola%20OR%20pulses%20OR%20grain%20OR%20crop%20OR%20market)&hl=en-CA&gl=CA&ceid=CA%3Aen',
    88,4,
    jsonb_build_object(
      'channel','news','priority','high','world_flow',true,'world_bucket','markets',
      'news_engine','news-v19-field-value-tr','news_policy','foreign_producer_news_full_tr_required',
      'translation','tr','translation_required',true,'coverage_scope','world',
      'editorial_mode','producer_first_agriculture','producer_focus',true,
      'source_focus','canola_wheat_pulses_grain_trade_weather_crop_markets',
      'source_attribution_required',true,'content_license','review',
      'discovery_provider','google_news_rss','canonical_domain','producer.com',
      'exclude_pattern','(cattle|hog|pork|livestock|dairy|sponsored|event)'
    )
  )
)
insert into public.content_sources(
  name,base_url,source_type,language,country,trust_score,active,scan_frequency_hours,metadata,updated_at
)
select name,base_url,'rss','en',null,trust_score,true,scan_frequency_hours,metadata,now()
from fallback
on conflict(base_url) do update
set name=excluded.name,
    source_type='rss',
    language='en',
    country=null,
    trust_score=excluded.trust_score,
    active=true,
    scan_frequency_hours=excluded.scan_frequency_hours,
    metadata=excluded.metadata,
    updated_at=now();

-- Agriculture Dive intentionally excluded: it stopped publishing in February 2025.
