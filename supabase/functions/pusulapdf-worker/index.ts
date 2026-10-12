import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const PDF_LAYER_ARCHIVE_NAMESPACE = 'pdf-layer-archive-v1';
const FIELD_MAP_BUCKET = 'field-map-layers';
const SATELLITE_HISTORY_DAYS = 180;
const MAX_HISTORICAL_SCENES = 16;
const MIN_NUMERIC_DATES = 4;
const ARCHIVE_RETENTION_MS = 20 * 365 * 24 * 60 * 60 * 1000;
const RADAR_SIGNED_URL_SECONDS = 8 * 24 * 60 * 60;

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const FIELD_COLUMNS = [
  'id','user_id','name','city','district','village','area_decare','crop','crop_subtype','season',
  'irrigation_status','irrigation_method','parcel_geometry','latitude','longitude',
  'parcel_centroid_lat','parcel_centroid_lng'
].join(',');

const sleep = (ms:number) => new Promise((resolve)=>setTimeout(resolve,ms));
const isoDate = (d:Date) => d.toISOString().slice(0,10);
const numberOrNull = (v:unknown) => {
  if(v===null||v===undefined||v==='') return null;
  const n=Number(v); return Number.isFinite(n)?n:null;
};
const dateOnly = (value:unknown) => {
  const raw=String(value??'').trim();
  const match=raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if(match)return match[1];
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?null:parsed.toISOString().slice(0,10);
};
const normalizeGeometry = (geometry:any) => {
  if(!geometry) return geometry;
  if(geometry.type==='Feature') return geometry;
  if(['Polygon','MultiPolygon'].includes(geometry.type)) return {type:'Feature',properties:{},geometry};
  return geometry;
};
const readIndex=(result:any,key:string)=>{
  const values=[
    result?.[`${key}Average`],result?.[`${key}Avg`],result?.[key],
    result?.indices?.[key]?.average,result?.indices?.[key]?.avg,
    result?.indexValues?.[key],result?.statistics?.[key]?.mean,
  ];
  for(const value of values){const n=numberOrNull(value);if(n!==null)return n}
  return null;
};

function requestedPeriod(job:any){
  // For old jobs only, retain the original 30-day fallback.
  const todayIstanbul=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const legacyEnd=todayIstanbul;
  const legacyStart=new Date(`${legacyEnd}T00:00:00Z`);
  legacyStart.setUTCDate(legacyStart.getUTCDate()-29);
  const start=String(job.requested_start??isoDate(legacyStart)).slice(0,10);
  const end=String(job.requested_end??legacyEnd).slice(0,10);
  const startTime=Date.parse(`${start}T00:00:00Z`);
  const endTime=Date.parse(`${end}T00:00:00Z`);
  const days=Math.round((endTime-startTime)/86400000)+1;
  if(!Number.isFinite(days)||days<7||days>180||start>end||end>todayIstanbul){
    throw new Error('Geçersiz rapor tarihi: 7 ile 180 gün arasında, gelecekte olmayan bir dönem seçilmelidir.');
  }
  return {start,end,days};
}

async function setJob(jobId:string, patch:Record<string,unknown>){
  await admin.from('pusulapdf_jobs').update({
    ...patch,
    updated_at:new Date().toISOString(),
  }).eq('id',jobId);
}

async function optionalRows(table:string,fieldId:string,orderColumn='created_at'){
  const {data,error}=await admin.from(table).select('*').eq('field_id',fieldId).order(orderColumn,{ascending:false});
  if(error){console.warn(`[PUSULAPDF] ${table}:`,error.message);return []}
  return data??[];
}

async function invokeFunction(name:string,body:unknown){
  const response=await fetch(`${SUPABASE_URL}/functions/v1/${name}`,{
    method:'POST',
    headers:{
      Authorization:`Bearer ${SERVICE_ROLE_KEY}`,
      apikey:SERVICE_ROLE_KEY,
      'Content-Type':'application/json',
    },
    body:JSON.stringify(body),
  });
  const text=await response.text();
  let data:any=null;
  try{data=text?JSON.parse(text):null}catch{data={message:text}}
  if(!response.ok||data?.success===false) throw new Error(data?.error??data?.message??`${name} HTTP ${response.status}`);
  return data;
}

async function withRetry<T>(label:string,fn:()=>Promise<T>,attempts=3):Promise<T>{
  let last:unknown;
  for(let i=1;i<=attempts;i++){
    try{return await fn()}catch(error){
      last=error;console.warn(`[PUSULAPDF] ${label} ${i}/${attempts}`,error);
      if(i<attempts) await sleep(900*i);
    }
  }
  throw last instanceof Error?last:new Error(`${label} alınamadı`);
}

type CloudLayerSnapshot = {
  schemaVersion?: number;
  fieldId?: string;
  layer?: string;
  source?: string;
  observedAt?: string | null;
  processingVersion?: string;
  metrics?: Record<string, unknown>;
  details?: Record<string, unknown>;
  archivedAt?: string;
};

function compactArchiveSnapshot(value:any){
  if(!value||typeof value!=='object')return null;
  return {
    schemaVersion:numberOrNull(value.schemaVersion)??1,
    fieldId:String(value.fieldId??''),
    layer:String(value.layer??''),
    source:String(value.source??''),
    observedAt:dateOnly(value.observedAt),
    processingVersion:String(value.processingVersion??''),
    metrics:value.metrics&&typeof value.metrics==='object'?value.metrics:{},
    details:value.details&&typeof value.details==='object'?value.details:{},
    archivedAt:value.archivedAt??null,
  } as CloudLayerSnapshot;
}

async function upsertArchiveSnapshot(userId:string,fieldId:string,snapshot:CloudLayerSnapshot){
  const observedAt=dateOnly(snapshot.observedAt);
  if(!observedAt||!snapshot.layer)return false;
  const sceneId=String(snapshot.details?.sceneId??snapshot.details?.cacheKey??'').slice(0,100);
  const sourceKey=[snapshot.layer,observedAt,sceneId||'daily',snapshot.processingVersion||'v1'].join(':');
  const cacheKey=[fieldId,sourceKey].join(':');
  const now=new Date();
  const payload={
    schemaVersion:2,fieldId,layer:snapshot.layer,source:snapshot.source??'',observedAt,
    processingVersion:snapshot.processingVersion??'server-v2',metrics:snapshot.metrics??{},details:snapshot.details??{},
    archivedAt:new Date().toISOString(),
  };
  const {error}=await admin.from('field_map_layer_cache').upsert({
    user_id:userId,field_id:fieldId,namespace:PDF_LAYER_ARCHIVE_NAMESPACE,cache_key:cacheKey,
    payload,data_date:observedAt,source_key:sourceKey,saved_at:now.toISOString(),
    expires_at:new Date(now.getTime()+ARCHIVE_RETENTION_MS).toISOString(),updated_at:now.toISOString(),
  },{onConflict:'user_id,field_id,namespace,cache_key'});
  if(error){console.warn('[PUSULAPDF] archive upsert:',error.message);return false}
  return true;
}

async function collectCloudLayerArchive(userId:string,fieldId:string){
  const namespaces=[
    PDF_LAYER_ARCHIVE_NAMESPACE,
    'satellite-analysis-v2','satellite-analysis-v1',
    'ndvi','radar','radar-visual','climate','climate-visual',
    'agro','agro-visual','soil-profile','soil-raster',
  ];

  const {data,error}=await admin.from('field_map_layer_cache')
    .select('namespace,cache_key,payload,data_date,source_key,saved_at')
    .eq('user_id',userId)
    .eq('field_id',fieldId)
    .in('namespace',namespaces)
    .order('saved_at',{ascending:false})
    .limit(500);

  if(error){
    console.warn('[PUSULAPDF] katman bulut arşivi okunamadı:',error.message);
    return [] as CloudLayerSnapshot[];
  }

  const snapshots:CloudLayerSnapshot[]=[];
  for(const row of data??[]){
    if(row?.namespace===PDF_LAYER_ARCHIVE_NAMESPACE){
      const parsed=compactArchiveSnapshot(row?.payload);
      if(parsed)snapshots.push(parsed);
      continue;
    }
    const payload=row?.payload&&typeof row.payload==='object'?row.payload:{};
    if(row?.namespace==='satellite-analysis-v2'||row?.namespace==='satellite-analysis-v1'){
      snapshots.push({
        schemaVersion:1,fieldId,layer:'sentinel2',source:String(payload?.source??'Kayıtlı Sentinel-2 analizi'),
        observedAt:dateOnly(payload?.latestImageDate??row?.data_date),processingVersion:String(row?.namespace),
        metrics:{
          ndvi:numberOrNull(payload?.ndviAverage),ndviMin:numberOrNull(payload?.ndviMin),ndviMax:numberOrNull(payload?.ndviMax),
          ndmi:numberOrNull(payload?.ndmiAverage),ndre:numberOrNull(payload?.ndreAverage),savi:numberOrNull(payload?.saviAverage),
          gndvi:numberOrNull(payload?.gndviAverage),highPercent:numberOrNull(payload?.healthyPercent),
          mediumPercent:numberOrNull(payload?.warningPercent),lowPercent:numberOrNull(payload?.stressedPercent),
        },
        details:{cacheKey:row?.cache_key??null,sourceKey:row?.source_key??null},archivedAt:String(row?.saved_at??new Date().toISOString()),
      });
      continue;
    }
    const summary=payload?.summary&&typeof payload.summary==='object'?payload.summary:null;
    snapshots.push({
      schemaVersion:1,fieldId,layer:`cached:${String(row?.namespace??'layer')}`,
      source:String(payload?.source??payload?.provider??row?.namespace??'cache'),
      observedAt:dateOnly(payload?.dataDate??payload?.latestImageDate??payload?.timeRange?.from??row?.data_date),
      processingVersion:'cloud-cache',
      metrics:{
        value:numberOrNull(summary?.displayValue??summary?.value??payload?.value),
        min:numberOrNull(payload?.min??summary?.min),max:numberOrNull(payload?.max??summary?.max),mean:numberOrNull(payload?.mean??summary?.mean),
      },
      details:{cacheKey:row?.cache_key??null,sourceKey:row?.source_key??null,label:summary?.displayLabel??summary?.shortLabel??payload?.label??null,unit:summary?.displayUnit??payload?.unit??null},
      archivedAt:String(row?.saved_at??new Date().toISOString()),
    });
  }
  return snapshots;
}

function cloudSatellitePoints(archive:CloudLayerSnapshot[]){
  const byDate=new Map<string,any>();
  for(const item of archive){
    if(item.layer!=='sentinel2'&&item.layer!=='sentinel2-geoblaze')continue;
    const date=dateOnly(item.observedAt);if(!date)continue;
    const metrics=item.metrics??{};
    const candidate={
      date,ndvi:numberOrNull(metrics.ndvi),ndmi:numberOrNull(metrics.ndmi),ndre:numberOrNull(metrics.ndre),
      savi:numberOrNull(metrics.savi),gndvi:numberOrNull(metrics.gndvi),ndviMin:numberOrNull(metrics.ndviMin),ndviMax:numberOrNull(metrics.ndviMax),
      highPercent:numberOrNull(metrics.highPercent),mediumPercent:numberOrNull(metrics.mediumPercent),lowPercent:numberOrNull(metrics.lowPercent),
      ndviImage:null,trueColorImage:null,ndviImagePath:String(item.details?.ndviImagePath??'')||null,trueColorImagePath:String(item.details?.trueColorImagePath??'')||null,source:item.source||'Kayıtlı Sentinel-2 arşivi',archiveLayer:item.layer,fromArchive:true,
    };
    const previous=byDate.get(date);
    const score=(v:any)=>[v.ndvi,v.ndmi,v.ndre,v.savi,v.gndvi].filter((n)=>typeof n==='number'&&Number.isFinite(n)).length;
    // Archive may contain both image-only and numerical measurements.
    if(!previous||score(candidate)>score(previous)
      ||(score(candidate)===score(previous)&&item.layer==='sentinel2'&&previous.archiveLayer!=='sentinel2')){
      byDate.set(date,{...previous,...candidate,
        ndviImagePath:candidate.ndviImagePath||previous?.ndviImagePath||null,
        trueColorImagePath:candidate.trueColorImagePath||previous?.trueColorImagePath||null});
    }else if(previous&&(!previous.ndviImagePath||!previous.trueColorImagePath)){
      previous.ndviImagePath=previous.ndviImagePath||candidate.ndviImagePath;
      previous.trueColorImagePath=previous.trueColorImagePath||candidate.trueColorImagePath;
    }
  }
  return [...byDate.values()].sort((a,b)=>b.date.localeCompare(a.date));
}

async function persistSatellitePoint(userId:string,fieldId:string,date:string,r:any){
  const ndviStored=typeof r?.ndviImage==='string'?await storeReportImage(userId,fieldId,'sentinel2',date,'ndvi',r.ndviImage):null;
  const trueColorStored=typeof r?.trueColorImage==='string'?await storeReportImage(userId,fieldId,'sentinel2',date,'truecolor',r.trueColorImage):null;
  await upsertArchiveSnapshot(userId,fieldId,{
    layer:'sentinel2',source:String(r?.source??'Copernicus Sentinel-2'),observedAt:date,processingVersion:'pusulapdf-s2-v3',
    metrics:{
      ndvi:readIndex(r,'ndvi'),ndmi:readIndex(r,'ndmi'),ndre:readIndex(r,'ndre'),savi:readIndex(r,'savi'),gndvi:readIndex(r,'gndvi'),
      ndviMin:numberOrNull(r?.ndviMin),ndviMax:numberOrNull(r?.ndviMax),highPercent:numberOrNull(r?.healthyPercent),
      mediumPercent:numberOrNull(r?.warningPercent),lowPercent:numberOrNull(r?.stressedPercent),cloudCover:numberOrNull(r?.cloudCover),
    },
    details:{
      latestImageDate:r?.latestImageDate??date,
      generatedAt:r?.generatedAt??null,
      ndviImagePath:ndviStored?.path??r?.ndviImagePath??null,
      trueColorImagePath:trueColorStored?.path??r?.trueColorImagePath??null,
    },
  });
  return {ndviImage:ndviStored?.url??(typeof r?.ndviImage==='string'?r.ndviImage:null),trueColorImage:trueColorStored?.url??(typeof r?.trueColorImage==='string'?r.trueColorImage:null)};
}
async function collectSatellite(userId:string,fieldId:string,geometry:any,archive:CloudLayerSnapshot[],period:{start:string;end:string}){
  const archivedPoints=cloudSatellitePoints(archive);
  // Fetch records only in the user's selected window; never masquerade old dates as selected-period measurements.
  const historyStart=new Date(`${period.end}T00:00:00Z`);
  historyStart.setUTCDate(historyStart.getUTCDate()-(SATELLITE_HISTORY_DAYS-1));
  const recentArchived=archivedPoints.filter((point:any)=>point.date>=period.start&&point.date<=period.end);
  if(!geometry){
    return {points:recentArchived.slice(0,10).sort((a,b)=>a.date.localeCompare(b.date)),availableDates:archivedPoints.map((p:any)=>p.date),archiveUsed:Math.min(10,recentArchived.length),liveUsed:0};
  }

  const g=normalizeGeometry(geometry);
  let liveDates:string[]=[];
  try{
    const scenes=await withRetry('scene-list',()=>invokeFunction('satellite-scene-list',{geometry:g,daysBack:180,maxCloudCoverage:35}));
    liveDates=[...new Set<string>((Array.isArray(scenes?.dates)?scenes.dates:[]).filter((d:unknown)=>typeof d==='string'))].sort().reverse();
  }catch(error){
    console.warn('[PUSULAPDF] scene-list kullanılamadı:',error);
    try{
      const scenes=await withRetry('analysis-list',()=>invokeFunction('satellite-field-analysis',{geometry:g,listScenes:true,daysBack:180,maxCloudCoverage:35}),2);
      liveDates=[...new Set<string>((Array.isArray(scenes?.dates)?scenes.dates:[]).filter((d:unknown)=>typeof d==='string'))].sort().reverse();
    }catch(secondError){console.warn('[PUSULAPDF] canlı Sentinel tarih listesi kullanılamadı:',secondError)}
  }

  const archiveDates=archivedPoints.map((point:any)=>point.date);
  const dates=[...new Set([...liveDates,...archiveDates])].sort().reverse();
  const selected=dates.filter(d=>d>=period.start&&d<=period.end&&new Date(`${d}T00:00:00Z`)>=historyStart).slice(0,MAX_HISTORICAL_SCENES);
  const archiveByDate=new Map(archivedPoints.map((point:any)=>[point.date,point]));
  const points:any[]=[];let archiveUsed=0;let liveUsed=0;
  const isNumeric=(p:any)=>[p?.ndvi,p?.ndmi,p?.ndre,p?.savi,p?.gndvi]
    .some((v)=>typeof v==='number'&&Number.isFinite(v));
  let numericallyValidDates=0;

  for(const date of selected){
    if(numericallyValidDates>=MIN_NUMERIC_DATES)break;
    const saved=archiveByDate.get(date);
    const hasCompleteArchive=!!saved&&['ndvi','ndre','savi','gndvi'].every((key)=>typeof saved[key]==='number');
    if(hasCompleteArchive){
      let ndviImage=await signedArchiveImage(saved.ndviImagePath);let trueColorImage=await signedArchiveImage(saved.trueColorImagePath);
      if(!ndviImage&&!trueColorImage){
        try{
          const preview=await invokeFunction('satellite-history-preview',{geometry:g,imageDate:date,maxCloudCoverage:35});
          const persisted=await persistSatellitePoint(userId,fieldId,date,{
            source:saved.source??'Kayıtlı Sentinel-2 arşivi',latestImageDate:date,
            ndviAverage:saved.ndvi,ndmiAverage:saved.ndmi,ndreAverage:saved.ndre,saviAverage:saved.savi,gndviAverage:saved.gndvi,
            ndviImage:preview?.ndviImage,trueColorImage:preview?.trueColorImage,
          });
          ndviImage=persisted.ndviImage;trueColorImage=persisted.trueColorImage;
        }catch{/* numeric archive is still valid */}
      }
      points.push({...saved,ndviImage,trueColorImage});
      archiveUsed+=1;numericallyValidDates+=1;continue;
    }

    try{
      // Numeric-only Copernicus scene statistics are far lighter than full images.
      const statisticsOnly=points.length>=2;
      let r=await withRetry(`uydu ${date}`,()=>invokeFunction('satellite-field-analysis',{
        geometry:g,imageDate:date,maxCloudCoverage:45,statisticsOnly
      }),2);
      // More scene cloud cover does not imply every pixel in this parcel is cloudy.
      // Sentinel SCL still masks all invalid/cloud pixels; no values are fabricated.
      if(!['ndvi','ndre','savi','gndvi'].some((key)=>readIndex(r,key)!==null)){
        const firstPass=r;
        const numericRetry=await withRetry(`uydu açık piksel tekrar ${date}`,()=>invokeFunction('satellite-field-analysis',{
          geometry:g,imageDate:date,maxCloudCoverage:75,statisticsOnly:true
        }),2);
        // Preserve the valid first-pass parcel images; only replace the
        // numerical statistics when a clearer-pixel retry succeeds.
        r={...firstPass,...numericRetry,
          ndviImage:numericRetry?.ndviImage??firstPass?.ndviImage??null,
          trueColorImage:numericRetry?.trueColorImage??firstPass?.trueColorImage??null};
      }
      const point={date,ndvi:readIndex(r,'ndvi'),ndmi:readIndex(r,'ndmi'),ndre:readIndex(r,'ndre'),savi:readIndex(r,'savi'),gndvi:readIndex(r,'gndvi'),
        ndviImage:typeof r?.ndviImage==='string'?r.ndviImage:null,trueColorImage:typeof r?.trueColorImage==='string'?r.trueColorImage:null,source:'live',fromArchive:false};
      const persisted=await persistSatellitePoint(userId,fieldId,date,r);
      point.ndviImage=persisted.ndviImage??point.ndviImage;point.trueColorImage=persisted.trueColorImage??point.trueColorImage;
      points.push(point);liveUsed+=1;
      if(isNumeric(point))numericallyValidDates+=1;
    }catch(error){
      console.warn(`[PUSULAPDF] ${date} tam Sentinel analizi yok:`,error);
      if(saved&&isNumeric(saved)){points.push(saved);archiveUsed+=1;numericallyValidDates+=1;continue}
      try{
        const preview=await invokeFunction('satellite-history-preview',{geometry:g,imageDate:date,maxCloudCoverage:35});
        const storedNdvi=typeof preview?.ndviImage==='string'?await storeReportImage(userId,fieldId,'sentinel2',date,'ndvi-preview',preview.ndviImage):null;
        const storedTrue=typeof preview?.trueColorImage==='string'?await storeReportImage(userId,fieldId,'sentinel2',date,'truecolor-preview',preview.trueColorImage):null;
        points.push({date,ndvi:null,ndmi:null,ndre:null,savi:null,gndvi:null,ndviImage:storedNdvi?.url??(typeof preview?.ndviImage==='string'?preview.ndviImage:null),trueColorImage:storedTrue?.url??(typeof preview?.trueColorImage==='string'?preview.trueColorImage:null),source:'live-preview',fromArchive:false});
        liveUsed+=1;
      }catch(previewError){console.warn(`[PUSULAPDF] ${date} Sentinel önizleme yok:`,previewError)}
    }
  }

  if(!points.length&&recentArchived.length){for(const point of recentArchived.slice(0,10)){points.push(point);archiveUsed+=1}}
  return {points:points.sort((a,b)=>a.date.localeCompare(b.date)),availableDates:dates,
    archiveUsed,liveUsed,numericDates:points.filter(isNumeric).length,
    examinedDates:points.length,historyDays:SATELLITE_HISTORY_DAYS};
}

type WeatherDay={date:string;tempMin:number|null;tempMax:number|null;tempAvg:number|null;precipitation:number|null;windSpeed:number|null;et0:number|null;source:string};

function cloudWeatherHistory(archive:CloudLayerSnapshot[],period:{start:string;end:string}){
  const byDate=new Map<string,WeatherDay>();
  for(const item of archive){
    if(item.layer!=='weather-history')continue;
    const date=dateOnly(item.observedAt);if(!date||date<period.start||date>period.end)continue;
    const m=item.metrics??{};
    byDate.set(date,{date,tempMin:numberOrNull(m.tempMin),tempMax:numberOrNull(m.tempMax),tempAvg:numberOrNull(m.tempAvg),precipitation:numberOrNull(m.precipitation),windSpeed:numberOrNull(m.windSpeed),et0:numberOrNull(m.et0),source:item.source||'Open-Meteo'});
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

async function fetchOpenMeteoDaily(baseUrl:string,latitude:number,longitude:number,params:Record<string,string>){
  const url=new URL(baseUrl);
  url.searchParams.set('latitude',String(latitude));url.searchParams.set('longitude',String(longitude));
  url.searchParams.set('daily','temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,et0_fao_evapotranspiration');
  url.searchParams.set('timezone','auto');
  for(const [key,value] of Object.entries(params))url.searchParams.set(key,value);
  const response=await fetch(url,{headers:{Accept:'application/json'}});
  const data=await response.json().catch(()=>null);
  if(!response.ok||!data?.daily?.time)throw new Error(`Open-Meteo HTTP ${response.status}`);
  const daily=data.daily;const rows:WeatherDay[]=[];
  for(let i=0;i<daily.time.length;i++){
    const tempMin=numberOrNull(daily.temperature_2m_min?.[i]);const tempMax=numberOrNull(daily.temperature_2m_max?.[i]);
    rows.push({date:String(daily.time[i]),tempMin,tempMax,tempAvg:tempMin!==null&&tempMax!==null?(tempMin+tempMax)/2:null,
      precipitation:numberOrNull(daily.precipitation_sum?.[i]),windSpeed:numberOrNull(daily.wind_speed_10m_max?.[i]),et0:numberOrNull(daily.et0_fao_evapotranspiration?.[i]),source:'Open-Meteo'});
  }
  return rows;
}

async function fetchHistoricalWeather(latitude:number,longitude:number,period:{start:string;end:string}){
  const byDate=new Map<string,WeatherDay>();
  const merge=(rows:WeatherDay[],source:string)=>rows.forEach((row)=>{
    if(row.date<period.start||row.date>period.end)return;
    byDate.set(row.date,{...row,source});
  });

  // Son yıllar için operasyonel model arşivi, günlük tarla raporunda ERA5'in
  // 5 günlük gecikmesine takılmamak için birincil kaynaktır.
  try{
    merge(await fetchOpenMeteoDaily('https://historical-forecast-api.open-meteo.com/v1/forecast',latitude,longitude,{start_date:period.start,end_date:period.end}),'Open-Meteo Historical Forecast');
  }catch(error){console.warn('[PUSULAPDF] Historical Forecast kullanılamadı:',error)}

  // En yeni günleri canlı Forecast API'nin past_days arşiviyle tamamla.
  try{
    merge(await fetchOpenMeteoDaily('https://api.open-meteo.com/v1/forecast',latitude,longitude,{past_days:'10',forecast_days:'1'}),'Open-Meteo Forecast geçmişi');
  }catch(error){console.warn('[PUSULAPDF] recent weather fallback kullanılamadı:',error)}

  // Operasyonel arşiv boş kalırsa tutarlı reanalysis son fallback olur.
  if(byDate.size<Math.min(20,REPORT_DAYS-5)){
    try{
      merge(await fetchOpenMeteoDaily('https://archive-api.open-meteo.com/v1/archive',latitude,longitude,{start_date:period.start,end_date:period.end}),'Open-Meteo Historical / ERA5');
    }catch(error){console.warn('[PUSULAPDF] ERA5 fallback kullanılamadı:',error)}
  }

  const rows=[...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
  if(!rows.length)throw new Error('Open-Meteo geçmiş hava serisi boş döndü.');
  return rows;
}
async function collectWeather(userId:string,fieldId:string,latitude:number|null,longitude:number|null,archive:CloudLayerSnapshot[],period:{start:string;end:string}){
  const cached=cloudWeatherHistory(archive,period);
  const cacheByDate=new Map(cached.map((row)=>[row.date,row]));
  if(latitude===null||longitude===null)return {history:cached,source:cached.length?'archive':null,archiveUsed:cached.length,liveUsed:0};
  const windowDays=Math.round((Date.parse(period.end)-Date.parse(period.start))/86400000)+1;
   const needLive=cached.length<Math.min(windowDays,Math.max(4,windowDays-2))||!cacheByDate.has(period.start);
  if(!needLive)return {history:cached,source:'Open-Meteo geçmiş hava / arşiv',archiveUsed:cached.length,liveUsed:0};
  try{
    const live=await withRetry('geçmiş hava',()=>fetchHistoricalWeather(latitude,longitude,period),2);
    for(const day of live){
      cacheByDate.set(day.date,day);
      await upsertArchiveSnapshot(userId,fieldId,{layer:'weather-history',source:day.source,observedAt:day.date,processingVersion:'open-meteo-history-v1',metrics:{tempMin:day.tempMin,tempMax:day.tempMax,tempAvg:day.tempAvg,precipitation:day.precipitation,windSpeed:day.windSpeed,et0:day.et0},details:{latitude,longitude}});
    }
    return {history:[...cacheByDate.values()].sort((a,b)=>a.date.localeCompare(b.date)),source:'Open-Meteo geçmiş hava',archiveUsed:cached.length,liveUsed:live.length};
  }catch(error){
    console.warn('[PUSULAPDF] geçmiş hava canlı kaynağı kullanılamadı:',error);
    return {history:cached,source:cached.length?'archive':null,archiveUsed:cached.length,liveUsed:0,error:error instanceof Error?error.message:String(error)};
  }
}

type RadarPoint={date:string;vv:number|null;vh:number|null;water:number|null;vvUnit:string|null;vhUnit:string|null;waterUnit:string|null;orbitDirection?:string|null;relativeOrbit?:number|null};

function cloudRadarPoints(archive:CloudLayerSnapshot[],period:{start:string;end:string}){
  const byDate=new Map<string,RadarPoint>();
  for(const item of archive){
    const layer=String(item.layer??'');if(!['sentinel1-vv','sentinel1-vh','sentinel1-water'].includes(layer))continue;
    const date=dateOnly(item.observedAt);if(!date||date<period.start||date>period.end)continue;
    const existing=byDate.get(date)??{date,vv:null,vh:null,water:null,vvUnit:null,vhUnit:null,waterUnit:null};
    const mean=numberOrNull(item.metrics?.mean);const unit=String(item.details?.unit??'')||null;
    if(layer==='sentinel1-vv'){existing.vv=mean;existing.vvUnit=unit}
    if(layer==='sentinel1-vh'){existing.vh=mean;existing.vhUnit=unit}
    if(layer==='sentinel1-water'){existing.water=mean;existing.waterUnit=unit}
    existing.orbitDirection=String(item.details?.orbitDirection??'')||existing.orbitDirection||null;
    existing.relativeOrbit=numberOrNull(item.details?.relativeOrbit)??existing.relativeOrbit??null;
    byDate.set(date,existing);
  }
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

function dataUrlBytes(dataUrl:string){
  const match=String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);if(!match)return null;
  const binary=atob(match[2]);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
  return {contentType:match[1]||'image/png',bytes};
}

async function imageBytes(source:string){
  const direct=dataUrlBytes(source);if(direct)return direct;
  try{
    const response=await fetch(source);if(!response.ok)return null;
    return {contentType:response.headers.get('content-type')||'image/png',bytes:new Uint8Array(await response.arrayBuffer())};
  }catch{return null}
}

async function signedArchiveImage(path:unknown){
  const value=String(path??'').trim();if(!value)return null;
  const {data,error}=await admin.storage.from(FIELD_MAP_BUCKET).createSignedUrl(value,RADAR_SIGNED_URL_SECONDS);
  return error||!data?.signedUrl?null:data.signedUrl;
}

async function storeReportImage(userId:string,fieldId:string,folder:string,date:string,slot:string,source:string){
  const decoded=await imageBytes(source);if(!decoded)return null;
  const ext=decoded.contentType.includes('jpeg')||decoded.contentType.includes('jpg')?'jpg':decoded.contentType.includes('webp')?'webp':'png';
  const path=`${userId}/${fieldId}/pusulapdf/${folder}/${date}-${slot}.${ext}`;
  const {error}=await admin.storage.from(FIELD_MAP_BUCKET).upload(path,decoded.bytes,{upsert:true,contentType:decoded.contentType,cacheControl:'86400'});
  if(error){console.warn(`[PUSULAPDF] ${folder} görsel upload:`,error.message);return null}
  const url=await signedArchiveImage(path);return url?{path,url}:null;
}

async function collectRadar(userId:string,fieldId:string,latitude:number|null,longitude:number|null,geometry:any,archive:CloudLayerSnapshot[],period:{start:string;end:string}){
  const cached=cloudRadarPoints(archive,period);const byDate=new Map(cached.map((p)=>[p.date,p]));
  const fallback={points:cached,images:[] as Array<{date:string;imageUrl:string}>,availableDates:cached.map((p)=>p.date),archiveUsed:cached.length,liveUsed:0};
  if(latitude===null||longitude===null)return fallback;
  try{
    const datesResult=await withRetry('radar tarihleri',()=>invokeFunction('sentinel1-radar',{action:'dates',latitude,longitude,geometry:normalizeGeometry(geometry),days:90,mode:'composite',radiusKm:3.5}),2);
    const scenes=(Array.isArray(datesResult?.scenes)?datesResult.scenes:[]).filter((s:any)=>dateOnly(s?.datetime)&&dateOnly(s?.datetime)!>=period.start).slice(0,8);
    if(!scenes.length)return fallback;
    const current=scenes[0];const previous=scenes[1]??null;
    const metricScenes=scenes.slice(0,5);
    let liveUsed=0;

    // 30 günlük radar grafiğinin yalnız iki noktaya sıkışmaması için uygun
    // sahnelerin VV/VH/su-adayı istatistiklerini görsel üretmeden geri doldur.
    for(const scene of metricScenes){
      const sceneDate=dateOnly(scene?.datetime??scene?.date);if(!sceneDate)continue;
      const row=byDate.get(sceneDate)??{date:sceneDate,vv:null,vh:null,water:null,vvUnit:null,vhUnit:null,waterUnit:null};
      const missingModes=(['vv','vh','water'] as const).filter((mode)=>{
        if(mode==='vv')return !Number.isFinite(Number(row.vv));
        if(mode==='vh')return !Number.isFinite(Number(row.vh));
        return !Number.isFinite(Number(row.water));
      });
      if(!missingModes.length)continue;

      const results=await Promise.allSettled(missingModes.map((mode)=>withRetry(`radar ${mode} ${sceneDate}`,()=>invokeFunction('sentinel1-radar',{
        action:'stats',latitude,longitude,geometry:normalizeGeometry(geometry),days:90,mode,radiusKm:3.5,
        sceneDatetime:scene.datetime,orbitDirection:scene.orbitDirection,relativeOrbit:scene.relativeOrbit,
      }),2)));

      for(let i=0;i<results.length;i++){
        const settled=results[i];if(settled.status!=='fulfilled')continue;
        const mode=missingModes[i];const r:any=settled.value;const mean=numberOrNull(r?.stats?.mean);if(mean===null)continue;
        liveUsed+=1;const unit=String(r?.stats?.unit??'')||null;
        if(mode==='vv'){row.vv=mean;row.vvUnit=unit}
        if(mode==='vh'){row.vh=mean;row.vhUnit=unit}
        if(mode==='water'){row.water=mean;row.waterUnit=unit}
        row.orbitDirection=r?.scene?.orbitDirection??scene?.orbitDirection??null;
        row.relativeOrbit=numberOrNull(r?.scene?.relativeOrbit??scene?.relativeOrbit);
        await upsertArchiveSnapshot(userId,fieldId,{
          layer:`sentinel1-${mode}`,
          source:String(r?.source??'Copernicus Sentinel-1 GRD'),
          observedAt:sceneDate,
          processingVersion:'pusulapdf-radar-v3',
          metrics:{
            mean,
            min:numberOrNull(r?.stats?.min),
            max:numberOrNull(r?.stats?.max),
            stDev:numberOrNull(r?.stats?.stDev),
            sampleCount:numberOrNull(r?.stats?.sampleCount),
            noDataCount:numberOrNull(r?.stats?.noDataCount),
          },
          details:{
            unit:r?.stats?.unit??null,
            metric:r?.stats?.metric??null,
            sceneId:r?.scene?.id??scene?.id??null,
            datetime:r?.scene?.datetime??scene?.datetime??null,
            orbitDirection:r?.scene?.orbitDirection??scene?.orbitDirection??null,
            relativeOrbit:r?.scene?.relativeOrbit??scene?.relativeOrbit??null,
          },
        });
      }
      byDate.set(sceneDate,row);
    }
    const imageScenes=[current,previous].filter(Boolean);const imageResults=await Promise.allSettled(imageScenes.map((scene:any)=>withRetry(`radar görsel ${scene.date}`,()=>invokeFunction('sentinel1-radar',{action:'image',latitude,longitude,geometry:normalizeGeometry(geometry),days:90,mode:'composite',radiusKm:3.5,sceneDatetime:scene.datetime,orbitDirection:scene.orbitDirection,relativeOrbit:scene.relativeOrbit}),2)));
    const images:Array<{date:string;imageUrl:string}>=[];
    for(let i=0;i<imageResults.length;i++){
      const result=imageResults[i];if(result.status!=='fulfilled')continue;const data:any=result.value;if(typeof data?.imageDataUrl!=='string')continue;
      const d=dateOnly(data?.scene?.datetime??data?.dataDate)??String(imageScenes[i]?.date??'');if(!d)continue;
      const stored=await storeReportImage(userId,fieldId,'radar',d,`composite-${i}`,data.imageDataUrl);if(stored?.url)images.push({date:d,imageUrl:stored.url});
    }
    const points=[...byDate.values()].filter((p)=>p.date>=period.start&&p.date<=period.end).sort((a,b)=>a.date.localeCompare(b.date));
    return {points,images,availableDates:scenes.map((s:any)=>String(s.date??dateOnly(s.datetime)??'')).filter(Boolean),archiveUsed:cached.length,liveUsed};
  }catch(error){console.warn('[PUSULAPDF] radar geçmişi alınamadı:',error);return {...fallback,error:error instanceof Error?error.message:String(error)}}
}


async function notifyPdfOutcome(
  userId:string, jobId:string, fieldId:string, reportId:string|null,
  fieldName:string, succeeded:boolean,
){
  const {error}=await admin.from('app_notifications').upsert({
    user_id:userId,
    kind:'report',
    source:'pusulapdf',
    category:'reports',
    severity:succeeded?'info':'warning',
    title:succeeded?'PusulaPDF raporun hazır':'PusulaPDF hazırlanamadı',
    message:succeeded
      ? `${fieldName} raporunu açıp PDF olarak kaydedebilirsin.`
      : `${fieldName} raporu henüz hazır değil. Tekrar deneyebilirsin.`,
    target:succeeded?'pusulapdf':'home',
    data:{fieldId,reportId,jobId},
    dedupe_key:`pusulapdf:${succeeded?'ready':'failed'}:${jobId}`,
    push_eligible:true,
    push_critical:false,
  },{onConflict:'dedupe_key'});
  if(error) console.warn('[PUSULAPDF] notification:',error.message);
}

async function processJob(jobId:string,userId:string){
  try{
    const {data:job,error:jobError}=await admin.from('pusulapdf_jobs').select('*').eq('id',jobId).eq('user_id',userId).single();
    if(jobError||!job) throw jobError??new Error('Job bulunamadı');if(job.status==='ready') return;
    await setJob(jobId,{status:'processing',stage:'collecting',started_at:new Date().toISOString(),attempts:(job.attempts??0)+1,error_code:null,error_message:null});

    const {data:field,error:fieldError}=await admin.from('fields').select(FIELD_COLUMNS).eq('id',job.field_id).eq('user_id',userId).single();
    if(fieldError||!field) throw fieldError??new Error('Tarla bulunamadı');
    const fieldId=String(field.id);const geometry=field.parcel_geometry??null;const lat=numberOrNull(field.parcel_centroid_lat??field.latitude);const lng=numberOrNull(field.parcel_centroid_lng??field.longitude);const period=requestedPeriod(job);
    let layerArchive=(await collectCloudLayerArchive(userId,fieldId))
      .filter((row:any)=>{ const observed=dateOnly(row.observedAt??row.archivedAt); return !observed||observed<=period.end; });

    await setJob(jobId,{stage:'satellite',progress_meta:{message:'Seçilen dönemin uydu sahneleri doğrulanıyor',cloudArchiveCount:layerArchive.length}});
    const satellite=await collectSatellite(userId,fieldId,geometry,layerArchive,period).catch((error)=>{
      console.error('[PUSULAPDF] satellite collection failed:',error);const fallback=cloudSatellitePoints(layerArchive).filter((p:any)=>p.date>=period.start&&p.date<=period.end).slice(0,10);
      return {points:fallback.sort((a:any,b:any)=>a.date.localeCompare(b.date)),availableDates:fallback.map((p:any)=>p.date),archiveUsed:fallback.length,liveUsed:0};
    });
    const numericSatellitePoints=satellite.points.filter((p:any)=>[p.ndvi,p.ndmi,p.ndre,p.savi,p.gndvi].some((v)=>typeof v==='number')).length;

    await setJob(jobId,{stage:'weather',progress_meta:{satelliteScenes:satellite.points.length,numericSatellitePoints,satelliteArchiveUsed:Number(satellite.archiveUsed??0),satelliteLiveUsed:Number(satellite.liveUsed??0),message:'Seçilen dönemin gerçek hava kayıtları toplanıyor'}});
    const weather=await collectWeather(userId,fieldId,lat,lng,layerArchive,period);

    layerArchive=(await collectCloudLayerArchive(userId,fieldId))
      .filter((row:any)=>{ const observed=dateOnly(row.observedAt??row.archivedAt); return !observed||observed<=period.end; });
    await setJob(jobId,{stage:'field_memory',progress_meta:{weatherDays:weather.history.length,weatherArchiveUsed:Number(weather.archiveUsed??0),weatherLiveUsed:Number(weather.liveUsed??0),message:'Sentinel-1 VV, VH ve su adayı geçmişi birleştiriliyor'}});
    const radar=await collectRadar(userId,fieldId,lat,lng,geometry,layerArchive,period);
    // Bu raporda canlı kaynaktan çekilip yeni yazılan kayıtları da snapshot'a dahil et.
    layerArchive=(await collectCloudLayerArchive(userId,fieldId))
      .filter((row:any)=>{ const observed=dateOnly(row.observedAt??row.archivedAt); return !observed||observed<=period.end; });

    await setJob(jobId,{stage:'field_memory',progress_meta:{satelliteScenes:satellite.points.length,numericSatellitePoints,weatherDays:weather.history.length,radarPoints:radar.points.length,radarImages:radar.images.length,message:'Tarla geçmişi birleştiriliyor'}});
    const [allActivities,allSoilAnalyses,allDiagnoses,allKcSnapshots]=await Promise.all([
      optionalRows('activities',fieldId,'activity_date'),optionalRows('soil_analyses',fieldId),optionalRows('ai_diagnosis_sessions',fieldId,'updated_at'),optionalRows('field_irrigation_kc_snapshots',fieldId,'snapshot_date'),
    ]);
    const inRange=(value:unknown)=>{
      const d=dateOnly(value);return !!d&&d>=period.start&&d<=period.end;
    };
    const beforeEnd=(value:unknown)=>{
      const d=dateOnly(value);return !d||d<=period.end;
    };
    const activities=allActivities.filter((row:any)=>inRange(row.activity_date??row.created_at));
    const diagnoses=allDiagnoses.filter((row:any)=>inRange(row.updated_at??row.created_at));
    const soilAnalyses=allSoilAnalyses.filter((row:any)=>beforeEnd(row.sample_date??row.analysis_date??row.created_at));
    const kcSnapshots=allKcSnapshots.filter((row:any)=>inRange(row.snapshot_date??row.created_at));
    if(numericSatellitePoints===0&&weather.history.length<2){
      throw new Error('Seçilen dönemde güvenilir sayısal uydu veya yeterli hava ölçümü bulunamadı. Daha geniş ya da başka bir dönem seç.');
    }

    const missing:string[]=[];if(!geometry)missing.push('parcel_geometry');if(!satellite.points.length)missing.push('satellite_period');if(weather.history.length<2)missing.push('weather_history_period');if(!radar.points.length)missing.push('radar_history');if(!activities.length)missing.push('activities');if(!soilAnalyses.length)missing.push('soil_analysis');
    const resolved=diagnoses.filter((d:any)=>d.status==='resolved');if(!resolved.length)missing.push('resolved_diagnosis');if(!kcSnapshots.length)missing.push('irrigation_kc');

    const snapshot={
      schemaVersion:2,
      field:{id:fieldId,name:field.name??'Tarla',city:field.city??null,district:field.district??null,village:field.village??null,areaDecare:numberOrNull(field.area_decare),crop:field.crop??null,cropSubtype:field.crop_subtype??null,season:numberOrNull(field.season),irrigationStatus:field.irrigation_status??null,irrigationMethod:field.irrigation_method??null,geometry,latitude:lat,longitude:lng},
      period:{start:period.start,end:period.end,createdAt:new Date().toISOString()},satellite,radar,weather,layerArchive:layerArchive.slice(0,220),irrigation:{kcSnapshots},activities,soilAnalyses,diagnoses:resolved,missing,
    };

    await setJob(jobId,{stage:'interpreting',progress_meta:{satelliteScenes:satellite.points.length,numericSatellitePoints,satelliteArchiveUsed:Number(satellite.archiveUsed??0),satelliteLiveUsed:Number(satellite.liveUsed??0),weatherDays:weather.history.length,radarPoints:radar.points.length,radarImages:radar.images.length,cloudArchiveCount:layerArchive.length,activities:activities.length,soilAnalyses:soilAnalyses.length,diagnoses:resolved.length,kcSnapshots:kcSnapshots.length,message:'Pusula değerlendirmesi hazırlanıyor'}});

    const {data:existing,error:findError}=await admin.from('weekly_field_reports')
      .select('*').eq('user_id',userId).eq('field_id',field.id)
      .eq('period_start',period.start).eq('period_end',period.end).limit(1).maybeSingle();
    if(findError)throw findError;
    let report:any;
    if(existing){
      const {data,error}=await admin.from('weekly_field_reports')
        .update({status:'ready',report_data:snapshot,pdf_bucket:null,pdf_path:null,generated_at:null,updated_at:new Date().toISOString()})
        .eq('id',existing.id).eq('user_id',userId).select('*').single();
      if(error)throw error;report=data;
    }else{
      const {data,error}=await admin.from('weekly_field_reports')
        .insert({user_id:userId,field_id:field.id,period_start:period.start,period_end:period.end,status:'ready',report_data:snapshot})
        .select('*').single();
      if(error)throw error;report=data;
    }

    await setJob(jobId,{report_id:report.id,status:'ready',stage:'ready',finished_at:new Date().toISOString(),progress_meta:{satelliteScenes:satellite.points.length,numericSatellitePoints,satelliteArchiveUsed:Number(satellite.archiveUsed??0),satelliteLiveUsed:Number(satellite.liveUsed??0),weatherDays:weather.history.length,weatherArchiveUsed:Number(weather.archiveUsed??0),weatherLiveUsed:Number(weather.liveUsed??0),radarPoints:radar.points.length,radarImages:radar.images.length,radarArchiveUsed:Number(radar.archiveUsed??0),radarLiveUsed:Number(radar.liveUsed??0),cloudArchiveCount:layerArchive.length,activities:activities.length,soilAnalyses:soilAnalyses.length,diagnoses:resolved.length,kcSnapshots:kcSnapshots.length,message:'Seçilen dönemin PusulaPDF verileri doğrulandı',notificationPending:false}});
    await notifyPdfOutcome(userId,jobId,fieldId,String(report.id),String(field.name??'Tarlan'),true);
  }catch(error){
    console.error('[PUSULAPDF] worker failed:',error);await setJob(jobId,{status:'failed',stage:'failed',finished_at:new Date().toISOString(),error_code:'WORKER_FAILED',error_message:error instanceof Error?error.message:String(error)});
    // Error notice is durable too, rather than leaving an eternal spinner.
    const {data:failedJob}=await admin.from('pusulapdf_jobs').select('field_id').eq('id',jobId).maybeSingle();
    if(failedJob?.field_id) await notifyPdfOutcome(userId,jobId,String(failedJob.field_id),null,'Tarlan',false);
  }
}

Deno.serve(async(req)=>{
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers:corsHeaders});
  if(req.method!=='POST') return new Response(JSON.stringify({error:'METHOD_NOT_ALLOWED'}),{status:405,headers:{...corsHeaders,'Content-Type':'application/json'}});
  try{
    const authHeader=req.headers.get('Authorization')??'';
    const userClient=createClient(SUPABASE_URL,SUPABASE_ANON_KEY,{global:{headers:{Authorization:authHeader}},auth:{persistSession:false,autoRefreshToken:false}});
    const {data:{user},error:userError}=await userClient.auth.getUser();
    if(userError||!user) return new Response(JSON.stringify({error:'AUTH_REQUIRED'}),{status:401,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const {jobId}=await req.json();if(!jobId) return new Response(JSON.stringify({error:'JOB_ID_REQUIRED'}),{status:400,headers:{...corsHeaders,'Content-Type':'application/json'}});
    const {data:ownedJob}=await admin.from('pusulapdf_jobs').select('id,user_id,status').eq('id',jobId).eq('user_id',user.id).maybeSingle();if(!ownedJob) return new Response(JSON.stringify({error:'JOB_NOT_FOUND'}),{status:404,headers:{...corsHeaders,'Content-Type':'application/json'}});
    EdgeRuntime.waitUntil(processJob(String(jobId),user.id));
    return new Response(JSON.stringify({accepted:true,jobId}),{status:202,headers:{...corsHeaders,'Content-Type':'application/json'}});
  }catch(error){return new Response(JSON.stringify({error:error instanceof Error?error.message:String(error)}),{status:500,headers:{...corsHeaders,'Content-Type':'application/json'}})}
});
