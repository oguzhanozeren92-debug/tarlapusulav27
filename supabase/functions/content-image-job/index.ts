import { createClient } from "npm:@supabase/supabase-js@2";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.883.0";

const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-cron-token","Access-Control-Allow-Methods":"POST, OPTIONS"};
const reply=(x:unknown,s=200)=>new Response(JSON.stringify(x),{status:s,headers:{...cors,"Content-Type":"application/json; charset=utf-8"}});
const clean=(v:unknown,n=1000)=>String(v??"").replace(/\u00a0/g," ").replace(/\s+/g," ").trim().slice(0,n);
const account=(v:unknown)=>clean(v,300).replace(/^https?:\/\//i,"").replace(/\.r2\.cloudflarestorage\.com.*$/i,"").replace(/\/.*$/,"");
const stripHtml=(v:unknown,n=500)=>clean(String(v??"").replace(/<[^>]*>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&quot;/gi,'"').replace(/&#39;/gi,"'"),n);

function license(v:unknown){
  const s=clean(v,140).toLowerCase().replace(/_/g,"-").replace(/\s+/g," ");
  if(!s)return"";
  if(/noncommercial|cc[- ]by[- ]nc|\bnc\b|no[- ]deriv|cc[- ]by[- ]nd|\bnd\b/.test(s))return"";
  if(/cc0|creative commons zero/.test(s))return"cc0";
  if(/public domain mark|public domain|\bpdm\b/.test(s))return"pdm";
  if(/cc[- ]by[- ]sa|creative commons attribution[- ]sharealike|\bby-sa\b/.test(s))return"cc-by-sa";
  if(/cc[- ]by\b|creative commons attribution|^by$/.test(s))return"cc-by";
  return"";
}
const SAFE=new Set(["cc0","pdm","cc-by","cc-by-sa"]);

type Img={url:string;landing:string;creator:string;license:string;title:string;source:string;width?:number;height?:number;rank?:number;query?:string};

async function allowed(req:Request,db:any){
  const cron=req.headers.get("x-cron-token")?.trim()||"";
  if(cron){const c=await db.rpc("content_engine_check_cron_token",{p_token:cron});if(!c.error&&c.data===true)return true}
  const internal=req.headers.get("x-content-image-secret")?.trim()||"";
  if(internal){const c=await db.rpc("verify_content_image_secret",{p_secret:internal});if(!c.error&&c.data===true)return true}
  const token=(req.headers.get("Authorization")||"").replace(/^Bearer\s+/i,"").trim();
  if(!token)return false;
  const u=await db.auth.getUser(token);if(u.error||!u.data.user)return false;
  const a=await db.from("admin_users").select("user_id").eq("user_id",u.data.user.id).maybeSingle();
  return Boolean(a.data);
}

function compactSourceTitle(v:unknown){
  let s=clean(v,500);
  if(!s)return"";
  s=s.split(/\s[|/]\s/)[0].trim();
  s=s.replace(/\s+-\s+(UC IPM|Penn State Extension|Purdue Extension|CropWatch|Nebraska).*$/i,"").trim();
  return s.slice(0,180);
}

function visualKeyword(v:string){
  const q=clean(v,220).toLowerCase();
  if(!q)return"";
  if(/sulama kanalı|sulama kanali|sulama projes|sulama yatırımı|sulama yatirimi|sulama/.test(q))return"agricultural irrigation canal crop field";
  if(/tarımsal destek|tarimsal destek|üretim planlam|uretim planlam/.test(q))return"farmer crop field agriculture";
  if(/hasat|rekolte/.test(q))return"crop harvest field farmer";
  if(/melas|şeker pancarı|seker pancari|şeker fabrik|seker fabrik/.test(q))return"sugar beet field harvest";
  if(/buğday|bugday/.test(q)&&/mısır|misir/.test(q))return"wheat corn grain field";
  if(/gıda fiyat|gida fiyat|tahıl fiyat|tahil fiyat/.test(q))return"wheat grain corn agriculture";
  if(/foot[ -]?and[ -]?mouth|foot mouth/.test(q))return"foot-and-mouth disease cattle livestock";
  if(/heavy metals?/.test(q))return"heavy metal soil contamination plants";
  if(/agricultural risk|farm risk/.test(q))return"farm crop field agricultural risk";
  if(/potassium/.test(q))return"potassium deficiency plant leaves crop";
  if(/temperature stress|heat stress/.test(q))return"heat stress crop plants leaves";
  if(/robotic pruning|robot pruning/.test(q))return"orchard pruning robot apple cherry";
  if(/wheat drought|drought wheat/.test(q))return"wheat drought field crop";
  if(/climate agriculture|agriculture climate/.test(q))return"agricultural field drought irrigation climate";
  if(/durum wheat/.test(q))return"durum wheat grain field";
  if(/crop protection/.test(q))return"crop protection field pest disease";
  if(/pistachio/.test(q))return"pistachio nuts kernels orchard";
  if(/soil analysis/.test(q))return"soil sample laboratory agriculture";
  if(/organic potato/.test(q))return"organic potato field crop";
  if(/entomopathogenic|aphid fungus/.test(q))return"aphid entomopathogenic fungus biological control";
  return clean(v,220);
}


type Subject={kind:string;search:string[]};
function subjectFor(row:any):Subject|null {
 const t=[row.title,row.title_suggested,row.structured_body?.guide_card?.title,row.structured_body?.guide_card?.topic,row.structured_body?.guide_card?.summary]
 .map(x=>clean(x,300)).join(" ").toLocaleLowerCase("tr-TR");
 const crop=/arpa|barley/.test(t)?"barley":/buğday|bugday|wheat|hububat|tahıl/.test(t)?"wheat":"cereal";
 if(/don|soğuk|soguk|frost|freez/.test(t))return {kind:"frost",search:[crop+" frost damage leaves",crop+" freezing injury plants","frost injury wheat barley leaves"]};
 if(/çökerten|cokerten|damping.off/.test(t))return {kind:"damping",search:["damping off damaged crop seedlings","seedling damping off root rot"]};
 if(/sarı pas|sari pas|yellow rust|rust disease/.test(t))return {kind:"rust",search:["wheat stripe rust leaf disease","Puccinia striiformis symptoms wheat leaf"]};
 if(/azot eksik|nitrogen deficien|nitrojen eksik/.test(t))return {kind:"nitrogen",search:["nitrogen deficiency wheat yellow leaves","nitrogen chlorosis cereal leaves"]};
 if(/kurak|drought stress|drought damage/.test(t))return {kind:"drought",search:["wheat drought stress damaged leaves","drought damaged crop plants"]};
 if(/zararlı|zararli|yaprak biti|aphid|insect pest/.test(t))return {kind:"pest",search:["crop plant insect pest infestation","wheat aphid infestation leaves"]};
 return null;
}
function subjectMatch(image:Img,subject:Subject|null){
 if(!subject)return true;
 const t=imageText(image);
 if(/harvest|harvesting|combine|thresh|baler|tractor|grain trailer|mow|fertili[sz]er spread|spray boom/.test(t))return false;
 switch(subject.kind){
 case "frost":return /frost|freez|frozen|winterkill|cold injury|cold damage|don zarar/.test(t)&&/wheat|barley|cereal|grain|plant|leaf|leaves|crop|field|arpa|buğday/.test(t);
 case "damping":return /damping.off|seedling rot|root rot|seedling blight/.test(t)&&/seedling|plant|crop|stem|root|vegetable/.test(t);
 case "rust":return /rust|puccinia/.test(t)&&/wheat|barley|cereal|leaf|leaves|crop|triticum/.test(t);
 case "nitrogen":return /nitrogen|nitrojen|azot|chlorosis/.test(t)&&/deficien|yellow|chloros|leaf|leaves|wheat|plant/.test(t);
 case "drought":return /drought|wilting|water stress|kurak/.test(t)&&/wheat|cereal|crop|field|plant|leaves/.test(t);
 case "pest":return /aphid|insect|pest|beetle|mite|weevil|borer|larva/.test(t)&&/crop|plant|leaf|leaves|wheat|cereal|barley/.test(t);
 default:return false;
 }
}

function queryCandidates(row:any,body:any,candidate:boolean){
  const refs=Array.isArray(row.source_refs)?row.source_refs:[];
  const english=refs.find((r:any)=>clean(r?.language,20).toLowerCase().startsWith("en")&&clean(r?.title,500));
  const anyRef=refs.find((r:any)=>clean(r?.title,500));
  const sourceTitle=compactSourceTitle(english?.title||anyRef?.title);
  const keyword=visualKeyword(clean(body.keyword||row.image_search_keyword,220));
  const tags=Array.isArray(candidate?row.suggested_tags:row.tags)?(candidate?row.suggested_tags:row.tags):[];
  const crops=Array.isArray(candidate?row.suggested_crops:row.crop_tags)?(candidate?row.suggested_crops:row.crop_tags):[];
  const localTitle=clean(candidate?row.title_suggested:row.title,300);
  const scientific=tags.find((x:any)=>/[A-Z][a-z]{3,}\s+[a-z]{3,}|Puccinia|Fusarium|Septoria|Alternaria|Phytophthora|Mildew|Rust|Aphid|Mite|Weevil|Myzus/i.test(clean(x,120)));
  const crop=clean(crops[0],80);
  const isGuide=clean(row.content_subtype,80)==="guide"||row?.structured_body?.channel==="guide";
  const subject=isGuide?subjectFor(row):null;
  if(subject)return subject.search;
  const vals=[
    [keyword,crop].filter(Boolean).join(" "),
    scientific?`${clean(scientific,100)} ${keyword}`:"",
    sourceTitle&&/[a-z]{4}/i.test(sourceTitle)?sourceTitle:"",
    keyword,
    localTitle
  ].map(x=>clean(x,220)).filter(Boolean);
  return [...new Set(vals.map(x=>x.toLowerCase()))].map(k=>vals.find(x=>x.toLowerCase()===k)!).slice(0,4);
}

async function commons(q:string):Promise<Img[]>{
  const p=new URLSearchParams({action:"query",format:"json",origin:"*",generator:"search",gsrsearch:q,gsrnamespace:"6",gsrlimit:"32",prop:"imageinfo",iiprop:"url|extmetadata|size",iiurlwidth:"1400",iiextmetadatafilter:"LicenseShortName|Artist|Credit|ImageDescription|UsageTerms"});
  const r=await fetch(`https://commons.wikimedia.org/w/api.php?${p}`,{signal:AbortSignal.timeout(15000),headers:{"User-Agent":"TarlaPusula-Visual/5.0 (agricultural knowledge guide)"}});
  if(!r.ok)throw new Error(`Wikimedia HTTP ${r.status}`);
  const j=await r.json();
  return (Object.values(j?.query?.pages||{}) as any[]).map((page:any,rank:number)=>{
    const ii=Array.isArray(page?.imageinfo)?page.imageinfo[0]:null,m=ii?.extmetadata||{},l=license(m?.LicenseShortName?.value||m?.UsageTerms?.value);
    return{url:clean(ii?.thumburl||ii?.url,1800),landing:clean(ii?.descriptionurl||`https://commons.wikimedia.org/wiki/${encodeURIComponent(page?.title||"")}`,1800),creator:stripHtml(m?.Artist?.value||m?.Credit?.value,320),license:l,title:stripHtml(m?.ImageDescription?.value||page?.title,520),source:"commons.wikimedia.org",width:Number(ii?.width)||undefined,height:Number(ii?.height)||undefined,rank} as Img;
  }).filter((x:Img)=>x.url&&SAFE.has(x.license));
}

async function inat(q:string):Promise<Img[]>{
  const p=new URLSearchParams({q,photos:"true",photo_license:"cc0,cc-by,cc-by-sa",per_page:"30",order_by:"votes",order:"desc"});
  const r=await fetch(`https://api.inaturalist.org/v1/observations?${p}`,{signal:AbortSignal.timeout(15000),headers:{"User-Agent":"TarlaPusula-Visual/5.0"}});
  if(!r.ok)throw new Error(`iNaturalist HTTP ${r.status}`);
  const j=await r.json(),out:Img[]=[];
  const rows=Array.isArray(j?.results)?j.results:[];
  for(let oi=0;oi<rows.length;oi++){
    const obs=rows[oi],photos=Array.isArray(obs?.photos)?obs.photos.slice(0,2):[];
    for(let pi=0;pi<photos.length;pi++){
      const ph=photos[pi],l=license(ph?.license_code);if(!SAFE.has(l))continue;
      const base=clean(ph?.url,1800);if(!base)continue;
      out.push({url:base.replace(/\/(square|small|medium)\./i,"/large."),landing:clean(obs?.uri||`https://www.inaturalist.org/observations/${obs?.id||""}`,1800),creator:clean(ph?.attribution||obs?.user?.login,360),license:l,title:clean(obs?.taxon?.preferred_common_name||obs?.taxon?.name||obs?.species_guess,420),source:"inaturalist.org",rank:oi*2+pi});
    }
  }
  return out;
}

const IMAGE_STOP=new Set(["the","and","with","from","for","of","a","an","management","program","guide","study","research","analysis","quality"]);
function tokens(v:string){return [...new Set(v.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g," ").split(/\s+/).filter(x=>x.length>2&&!IMAGE_STOP.has(x)))].slice(0,14)}
function imageText(x:Img){return `${x.title} ${x.landing}`.toLowerCase().normalize("NFKD")}
function documentLike(x:Img){const h=imageText(x);return /\.pdf(?:$|[?#])|annual report|proceedings|conference|government publications|title from cover|cover title|periodicals/.test(h)}
function biologicalQuery(q:string){return /disease|pest|aphid|mite|weevil|fung|rust|mildew|insect|bacteria|virus|myzus|puccinia|fusarium|phytophthora|foot-and-mouth/.test(q.toLowerCase())}
function relevant(x:Img,q:string){
  const h=imageText(x),qt=tokens(q);
  if(documentLike(x))return false;
  if(/foot-and-mouth|foot mouth/.test(q.toLowerCase())&&/hand.?foot|hand, foot|child|human|scaly-foot|bird/.test(h))return false;
  const special:(string[]|null)=
    /heavy metal/.test(q.toLowerCase())?["soil","plant","water","contamin","cadmium","lead","crop","agricultur"]:
    /potassium/.test(q.toLowerCase())?["potassium","plant","leaf","leaves","crop","deficien"]:
    /agricultural risk|farm risk/.test(q.toLowerCase())?["farm","farmer","field","crop","agricultur","drought","insurance"]:
    /robotic pruning|orchard pruning/.test(q.toLowerCase())?["prun","orchard","tree","apple","cherry","robot"]:
    /wheat drought/.test(q.toLowerCase())?["wheat","triticum","grain","drought"]:
    /pistachio/.test(q.toLowerCase())?["pistachio"]:
    /soil sample|soil analysis/.test(q.toLowerCase())?["soil"]:
    /organic potato/.test(q.toLowerCase())?["potato"]:
    /heat stress|temperature stress/.test(q.toLowerCase())?["plant","crop","leaf","heat","temperature"]:
    /foot-and-mouth|foot mouth/.test(q.toLowerCase())?["cattle","cow","bovine","livestock","hoof","foot-and-mouth"]:
    null;
  if(special&&!special.some(t=>h.includes(t)))return false;
  const overlap=qt.reduce((n,t)=>n+(h.includes(t)?1:0),0);
  return overlap>=1;
}
function score(x:Img,q:string){const h=imageText(x),over=tokens(q).reduce((n,t)=>n+(h.includes(t)?1:0),0),src=x.source==="commons.wikimedia.org"?28:23,rank=Math.max(0,15-Number(x.rank||0)*.45),size=(Number(x.width||0)>=1000||Number(x.height||0)>=800)?4:0,lic=(x.license==="cc0"||x.license==="pdm")?4:2;return src+over*10+rank+size+lic}

function visualFallbackQueries(queries:string[]){
  const h=queries.join(" ").toLowerCase();
  const out:string[]=[];
  const add=(q:string)=>{if(q&&!out.includes(q))out.push(q)};
  if(/pistachio|fıstık|fistik/.test(h))add("Pistacia vera pistachio orchard");
  if(/cherry|kiraz/.test(h))add("Prunus avium cherry orchard");
  if(/apricot|kayısı|kayisi/.test(h))add("Prunus armeniaca apricot orchard");
  if(/wheat|buğday|bugday/.test(h))add("wheat field agriculture");
  if(/corn|maize|mısır|misir/.test(h))add("maize corn field agriculture");
  if(/cotton|pamuk/.test(h))add("cotton field agriculture");
  if(/tea|çay/.test(h))add("tea plantation agriculture");
  if(/rice|pirinç|pirinc/.test(h))add("rice field agriculture");
  if(/potato|patates/.test(h))add("potato field agriculture");
  if(/grape|üzüm|uzum/.test(h))add("grape vineyard agriculture");
  if(/apple|elma/.test(h))add("apple orchard agriculture");
  if(/almond|badem/.test(h))add("almond orchard agriculture");
  if(/glyphosate|herbicide|pesticide|glifosat/.test(h))add("crop field tractor spraying agriculture");
  if(/fertiliz|gübre|gubre|nitrogen|phosphor|potassium/.test(h))add("crop field fertilizer agriculture");
  if(/drought|kurak/.test(h))add("drought crop field agriculture");
  if(/irrigat|sulama/.test(h))add("irrigation crop field agriculture");
  if(/grain|tahıl|tahil|food price|gıda fiyat|gida fiyat/.test(h))add("wheat grain agriculture");
  add("agriculture crop field");
  return out.slice(0,4);
}

function visualPlantQuery(q:string){
  return biologicalQuery(q)||/pistachio|pistacia|cherry|prunus|apricot|wheat|triticum|maize|corn|cotton|tea|rice|potato|grape|vineyard|apple|almond|crop|plant/.test(q.toLowerCase());
}

async function search(queries:string[],subject:Subject|null){
  const all:Img[]=[],fallback:Img[]=[],failures:string[]=[];let okSources=0;
  const run=async(q:string,strict:boolean)=>{
    const calls=visualPlantQuery(q)?[commons(q),inat(q)]:[commons(q)];
    const settled=await Promise.allSettled(calls);
    for(const s of settled){
      if(s.status==="fulfilled"){
        okSources++;
        const rows=s.value.filter((x:Img)=>!documentLike(x));
        fallback.push(...rows.map((x:Img)=>({...x,query:q})));
        all.push(...rows.filter((x:Img)=>(strict?relevant(x,q):true)&&subjectMatch(x,subject)).map((x:Img)=>({...x,query:q})));
      }else failures.push(clean((s.reason as any)?.message||s.reason,260))
    }
  };
  for(const q of queries){
    await run(q,true);
    if(all.length>=18)break;
  }
  if(!all.length&&!subject){
     for(const q of visualFallbackQueries(queries)){
      await run(q,true);
      if(all.length>=12)break;
    }
  }
  if(!all.length&&!subject&&fallback.length){
    all.push(...fallback.filter((x:Img)=>!documentLike(x)).slice(0,12));
  }
  const seen=new Set<string>(),unique=all.filter(x=>{const k=(x.landing||x.url).toLowerCase();if(!k||seen.has(k))return false;seen.add(k);return true});
  unique.sort((a,b)=>score(b,b.query||queries[0]||"")-score(a,a.query||queries[0]||""));
  return{images:unique,failures:[...new Set(failures)],okSources};
}

async function download(url:string){
  const r=await fetch(url,{redirect:"follow",signal:AbortSignal.timeout(18000),headers:{"User-Agent":"TarlaPusula-Visual/5.0"}});if(!r.ok)throw new Error(`Görsel HTTP ${r.status}`);
  const type=(r.headers.get("content-type")||"").split(";")[0].trim().toLowerCase();if(!["image/jpeg","image/png","image/webp"].includes(type))throw new Error(`Desteklenmeyen tür ${type||"?"}`);
  const bytes=new Uint8Array(await r.arrayBuffer());if(!bytes.length||bytes.length>3*1024*1024)throw new Error("Görsel 3 MB sınırını aşıyor");
  return{bytes,type,ext:type==="image/png"?"png":type==="image/webp"?"webp":"jpg"};
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});if(req.method!=="POST")return reply({error:"Sadece POST"},405);
  const su=clean(Deno.env.get("SUPABASE_URL"),500),sk=clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),1400),rid=account(Deno.env.get("R2_ACCOUNT_ID")),ra=clean(Deno.env.get("R2_ACCESS_KEY_ID"),500),rs=clean(Deno.env.get("R2_SECRET_ACCESS_KEY"),1400),bucket=clean(Deno.env.get("R2_BUCKET_NAME"),500);
  if(!su||!sk||!rid||!ra||!rs||!bucket)return reply({error:"R2/Supabase yapılandırması eksik"},500);
  const db=createClient(su,sk,{auth:{persistSession:false}});if(!(await allowed(req,db)))return reply({error:"Yetki gerekli"},403);
  let id="",table="";
  try{
    const body=await req.json().catch(()=>({})),candidateId=clean(body.candidateId,100),contentId=clean(body.contentId,100);if(!candidateId&&!contentId)return reply({error:"candidateId/contentId gerekli"},400);
    id=candidateId||contentId;table=candidateId?"content_candidates":"content_items";
    const fields=candidateId?"title_suggested,image_search_keyword,suggested_crops,suggested_tags,suggested_category,content_subtype,structured_body,source_refs":"title,image_search_keyword,crop_tags,tags,category,content_subtype,structured_body,source_refs";
    const qr=await db.from(table).select(fields).eq("id",id).maybeSingle();if(qr.error)throw qr.error;if(!qr.data)return reply({error:"İçerik bulunamadı"},404);
    const row:any=qr.data,isGuide=clean(row.content_subtype,80)==="guide"||row?.structured_body?.channel==="guide",subject=isGuide?subjectFor(row):null,queries=queryCandidates(row,body,Boolean(candidateId));
    if(!queries.length)queries.push("crop disease symptoms");
    const requested=Number(body.maxImages),target=Math.max(1,Math.min(Number.isFinite(requested)?requested:(isGuide?4:1),6)),required=isGuide?Math.min(3,target):1,ownerCol=candidateId?"candidate_id":"content_id";
    const exq=await db.from("content_images").select("id,original_url,caption,source_domain,license_type,is_cover,sort_order,status").eq(ownerCol,id).order("sort_order",{ascending:true});if(exq.error)throw exq.error;
    const previous=Array.isArray(exq.data)?exq.data.filter((x:any)=>x.status!=="rejected"):[];
     const mismatched=isGuide&&subject?previous.filter((x:any)=>!subjectMatch({
       title:clean(x.caption,520),landing:clean(x.original_url,1800),url:"",source:"",creator:"",license:clean(x.license_type,60)
     },subject)):[];
     if(mismatched.length){
       const rejected=await db.from("content_images").update({status:"rejected",is_cover:false})
         .in("id",mismatched.map((x:any)=>x.id)).eq(ownerCol,id);
       if(rejected.error)throw rejected.error;
     }
     const invalidIds=new Set(mismatched.map((x:any)=>x.id));
     const existing=previous.filter((x:any)=>!invalidIds.has(x.id));
     const keys=new Set(existing.map((x:any)=>clean(x.original_url,1800).toLowerCase()).filter(Boolean));
     let hasCover=existing.some((x:any)=>x.is_cover===true);
    if(body.replaceCover===true&&hasCover){await db.from("content_images").update({is_cover:false}).eq(ownerCol,id).eq("is_cover",true);hasCover=false}
    const initial=existing.length,slots=Math.max(0,target-initial+(body.replaceCover===true?1:0));
    if(slots===0&&hasCover){const status=initial>=required?"ready":"review_needed",structured=row.structured_body&&typeof row.structured_body==="object"?row.structured_body:{};await db.from(table).update({image_status:status,image_processing_at:new Date().toISOString(),structured_body:{...structured,visual_enrichment:{engine:"visual-enrichment-v6-subject-match",status,image_count:initial,cover_count:1,required_count:required,target_count:target,queries,updated_at:new Date().toISOString()}}}).eq("id",id);return reply({ok:true,id,status,imageCount:initial,requiredCount:required,targetCount:target,reused:true,queries})}
    await db.from(table).update({image_status:"processing",image_processing_at:new Date().toISOString()}).eq("id",id);
    const found=await search(queries,subject);if(found.okSources===0)throw new Error(`Görsel kaynaklarına ulaşılamadı: ${found.failures.join(" | ")}`);
    const s3=new S3Client({region:"auto",endpoint:`https://${rid}.r2.cloudflarestorage.com`,credentials:{accessKeyId:ra,secretAccessKey:rs}}),owner=candidateId?`candidate-${candidateId}`:`content-${contentId}`,inserted:any[]=[],errors:string=[];
    for(const c of found.images){if(inserted.length>=slots)break;const dk=clean(c.landing||c.url,1800).toLowerCase();if(!dk||keys.has(dk))continue;try{const im=await download(c.url),isCover=!hasCover&&inserted.every(x=>!x.is_cover),sortOrder=isCover?0:Math.max(1,initial+inserted.length),key=`content-images/library/${owner}/${crypto.randomUUID()}.${im.ext}`;await s3.send(new PutObjectCommand({Bucket:bucket,Key:key,Body:im.bytes,ContentType:im.type,CacheControl:"public, max-age=31536000, immutable"}));const ins=await db.from("content_images").insert({candidate_id:candidateId||null,content_id:contentId||null,r2_key:key,public_url:null,original_url:c.landing||c.url,source_domain:c.source,license_type:c.license,credit_text:[c.creator,c.license.toUpperCase(),c.source].filter(Boolean).join(" · ")||c.source,alt_text:clean(candidateId?row.title_suggested:row.title,500)||queries[0],caption:c.title||null,image_type:isCover?"cover":"gallery",status:contentId?"approved":"pending_review",is_cover:isCover,sort_order:sortOrder}).select("id").single();if(ins.error||!ins.data)throw ins.error||new Error("Görsel kaydı oluşturulamadı");const url=`${su}/functions/v1/content-image-public?id=${encodeURIComponent(ins.data.id)}`;await db.from("content_images").update({public_url:url}).eq("id",ins.data.id);if(isCover){await db.from("content_images").update({is_cover:false}).eq(ownerCol,id).neq("id",ins.data.id);hasCover=true}keys.add(dk);inserted.push({id:ins.data.id,url,source:c.source,license:c.license,is_cover:isCover,bytes:im.bytes.length})}catch(e){errors.push(clean(e instanceof Error?e.message:e,260))}}
    const fq=await db.from("content_images").select("id,is_cover,source_domain,license_type,status").eq(ownerCol,id);if(fq.error)throw fq.error;const imgs=Array.isArray(fq.data)?fq.data.filter((x:any)=>x.status!=="rejected"):[],count=imgs.length,covers=imgs.filter((x:any)=>x.is_cover).length,sources=[...new Set(imgs.map((x:any)=>clean(x.source_domain,120)).filter(Boolean))];let status="review_needed";if(covers>0&&count>=required)status="ready";else if(count===0&&errors.length&&found.images.length>0)status="error";
    const structured=row.structured_body&&typeof row.structured_body==="object"?row.structured_body:{};const up=await db.from(table).update({image_status:status,image_processing_at:new Date().toISOString(),structured_body:{...structured,visual_enrichment:{engine:"visual-enrichment-v6-subject-match",status,image_count:count,cover_count:covers,required_count:required,target_count:target,queries,sources,source_failures:found.failures,updated_at:new Date().toISOString()}}}).eq("id",id);if(up.error)throw up.error;
    return reply({ok:status!=="error",id,status,imageCount:count,coverCount:covers,requiredCount:required,targetCount:target,inserted:inserted.length,queries,sources,sourceFailures:found.failures,errors:errors.slice(0,6),images:inserted},status==="error"?500:200);
  }catch(e){console.error("[CONTENT_IMAGE_JOB_V4]",e);if(id&&table){try{await db.from(table).update({image_status:"error",image_processing_at:new Date().toISOString()}).eq("id",id)}catch{}}return reply({error:e instanceof Error?e.message:String(e)},500)}
});