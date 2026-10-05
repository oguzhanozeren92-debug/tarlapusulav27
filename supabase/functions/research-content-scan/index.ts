import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const clean = (v: unknown, max = 1200) => String(v ?? "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const norm = (v: unknown) => clean(v, 900).toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9çğıöşü ]/gi, " ").replace(/\s+/g, " ").trim();
const hash = async (v: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))).map(x => x.toString(16).padStart(2, "0")).join("");

type Found = { title:string; url:string; doi:string|null; summary:string; language:string; publishedAt:string|null; query:string; provider:string; };

const TR = ["buğday hastalıkları","sarı pas buğday","bitki hastalıkları","tarımsal zararlılar","azot noksanlığı bitki","bitki besleme gübreleme","toprak verimliliği","sulama yönetimi","kuraklık stresi bitki","don zararı tarım","verim tahmini tarım","hasat zamanı","mısır verimi","pamuk yetiştiriciliği","ayçiçeği yetiştiriciliği","fındık hastalıkları","zeytin hastalıkları","üzüm hastalıkları","incir yetiştiriciliği","tarımsal üretim tekniği"];
const EN = ["wheat disease","wheat yellow rust","plant disease crop","crop pest management","nitrogen deficiency crop","plant nutrition fertilization","soil fertility crop","irrigation management crop","crop drought stress","frost damage crop","crop yield prediction","harvest timing crop","maize yield","cotton production","sunflower production","hazelnut disease","olive disease","grape disease","fig production","agricultural production technique"];
const QUERY_POOL = [...TR, ...EN];

async function authorize(req: Request, admin: SupabaseClient, url: string, anon: string) {
  const cronToken = clean(req.headers.get("x-cron-token"), 500);
  if (cronToken) {
    const checked = await admin.rpc("content_engine_check_cron_token", { p_token: cronToken });
    if (!checked.error && checked.data === true) return { ok: true, mode: "cron" } as const;
  }
  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "Admin oturumu veya geçerli cron anahtarı gerekli." } as const;
  const user = createClient(url, anon, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false } });
  const auth = await user.auth.getUser(token);
  if (auth.error || !auth.data.user) return { ok: false, status: 401, error: "Geçersiz oturum." } as const;
  const isAdmin = await user.rpc("is_admin");
  if (isAdmin.error || isAdmin.data !== true) return { ok: false, status: 403, error: "Admin yetkisi gerekli." } as const;
  return { ok: true, mode: "admin" } as const;
}

function abstractFromInverted(inv:any){ if (!inv || typeof inv !== "object") return ""; const words:Array<[number,string]> = []; for (const [word, positions] of Object.entries(inv)) for (const p of (Array.isArray(positions) ? positions : [])) words.push([Number(p), word]); return clean(words.sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(" "), 5000); }
function doiUrl(doi:string|null){ return doi ? `https://doi.org/${doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")}` : null; }
function yearDate(y:any){ const n=Number(y); return Number.isInteger(n)&&n>1900&&n<2200 ? `${n}-01-01T00:00:00.000Z` : null; }
function articleScore(x:Found){ const text = norm(`${x.title} ${x.summary}`); let s = 50; if (x.doi) s += 12; if (x.summary.length >= 250) s += 12; if (/tarım|agric|crop|plant|soil|irrig|fertili|disease|pest|yield|wheat|maize|cotton|sunflower|hazelnut|olive|grape|incir|buğday|mısır|pamuk|ayçiçeği|fındık|zeytin|üzüm/.test(text)) s += 18; if (x.language === "tr") s += 8; return Math.min(100,s); }
function articleYear(x:Found){ if(!x.publishedAt) return null; const y=new Date(x.publishedAt).getUTCFullYear(); return Number.isFinite(y)?y:null; }

async function openAlex(query:string, limit:number):Promise<Found[]> {
  const p = new URLSearchParams({ search: query, per_page: String(Math.max(1, Math.min(limit, 25))), select: "id,doi,title,publication_year,language,abstract_inverted_index,primary_location" });
  const key = clean(Deno.env.get("OPENALEX_API_KEY"),300); if(key) p.set("api_key",key);
  const r=await fetch(`https://api.openalex.org/works?${p.toString()}`,{headers:{"User-Agent":"TarlaPusula-Research-Radar/5.1"},signal:AbortSignal.timeout(25000)});
  if(!r.ok){const body=clean(await r.text(),1200);throw new Error(`OpenAlex HTTP ${r.status}${body?`: ${body}`:""}`);} const d=await r.json();
  return (Array.isArray(d?.results)?d.results:[]).map((w:any)=>{ const doi=clean(w?.doi,400).replace(/^https?:\/\/(dx\.)?doi\.org\//i,"")||null; return { title:clean(w?.title,900), url:doiUrl(doi)||clean(w?.primary_location?.landing_page_url||w?.id,1200), doi, summary:abstractFromInverted(w?.abstract_inverted_index), language:clean(w?.language,20)||"unknown", publishedAt:yearDate(w?.publication_year), query, provider:"openalex" }; }).filter((x:Found)=>x.title&&x.url);
}
async function crossref(query:string, limit:number):Promise<Found[]> {
  const p=new URLSearchParams({"query.bibliographic":query,rows:String(limit),select:"DOI,title,abstract,published,URL,language",filter:"type:journal-article"});
  const r=await fetch(`https://api.crossref.org/works?${p.toString()}`,{headers:{"User-Agent":"TarlaPusula-Research-Radar/5.1 (mailto:admin@tarlapusula.app)"},signal:AbortSignal.timeout(25000)});
  if(!r.ok){const body=clean(await r.text(),1200);throw new Error(`Crossref HTTP ${r.status}${body?`: ${body}`:""}`);} const d=await r.json();
  return (Array.isArray(d?.message?.items)?d.message.items:[]).map((w:any)=>{ const doi=clean(w?.DOI,400)||null; const year=w?.published?.["date-parts"]?.[0]?.[0]; return { title:clean(Array.isArray(w?.title)?w.title[0]:w?.title,900), url:doiUrl(doi)||clean(w?.URL,1200), doi, summary:clean(w?.abstract,5000), language:clean(w?.language,20)||"unknown", publishedAt:yearDate(year), query, provider:"crossref" }; }).filter((x:Found)=>x.title&&x.url);
}
async function semantic(query:string, limit:number):Promise<Found[]> {
  const key=clean(Deno.env.get("SEMANTIC_SCHOLAR_API_KEY"),300); const h:Record<string,string>={}; if(key) h["x-api-key"]=key;
  const p=new URLSearchParams({query,limit:String(limit),fields:"title,abstract,url,externalIds,year"});
  const r=await fetch(`https://api.semanticscholar.org/graph/v1/paper/search?${p.toString()}`,{headers:h,signal:AbortSignal.timeout(25000)});
  if(!r.ok){const body=clean(await r.text(),1200);throw new Error(`Semantic Scholar HTTP ${r.status}${body?`: ${body}`:""}`);} const d=await r.json();
  return (Array.isArray(d?.data)?d.data:[]).map((w:any)=>{ const doi=clean(w?.externalIds?.DOI,400)||null; return { title:clean(w?.title,900), url:doiUrl(doi)||clean(w?.url,1200), doi, summary:clean(w?.abstract,5000), language:"unknown", publishedAt:yearDate(w?.year), query, provider:"semantic_scholar" }; }).filter((x:Found)=>x.title&&x.url);
}

async function markTranslation(admin:any, candidateId:string, status:"translated"|"failed_auto", errorMessage?:string) {
  const current = await admin.from("content_candidates").select("structured_body").eq("id", candidateId).maybeSingle();
  const structured = current.data?.structured_body && typeof current.data.structured_body === "object" ? current.data.structured_body : {};
  await admin.from("content_candidates").update({ workflow_status: status === "translated" ? "pending" : "rejected", payload_status: status === "translated" ? "ready" : "error", structured_body: { ...structured, translation_status: status, producer_summary_status: status === "translated" ? "ready" : "blocked", ...(errorMessage ? { translation_error: clean(errorMessage, 600) } : {}) } }).eq("id", candidateId);
}

Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:cors});
  if(req.method!=="POST") return json({error:"Sadece POST."},405);
  const url=Deno.env.get("SUPABASE_URL")||"", anon=Deno.env.get("SUPABASE_ANON_KEY")||"", service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service) return json({error:"Supabase sunucu yapılandırması eksik."},500);
  const admin=createClient(url,service,{auth:{persistSession:false}}); const access=await authorize(req,admin,url,anon); if(!access.ok) return json({error:access.error},access.status);
  try{
    const body=await req.json().catch(()=>({})); let sourceId=clean(body?.sourceId,100); const perQuery=Math.max(1,Math.min(Number(body?.limit)||3,5)); const batchSize=Math.max(1,Math.min(Number(body?.batchSize)||6,8)); const requestedCursor=Math.max(0,Number(body?.cursor)||0); const discoveryMode=body?.discoveryMode==="crop_targeted"?"crop_targeted":"general";
    let source:any=null;
    if(sourceId){ const s=await admin.from("content_sources").select("*").eq("id",sourceId).eq("active",true).maybeSingle(); if(s.error) throw s.error; source=s.data; if(!source) return json({error:"Makale kaynağı bulunamadı veya pasif."},404); }
    else { const s=await admin.from("content_sources").select("*").eq("active",true).eq("source_type","api").eq("metadata->>channel","article").order("trust_score",{ascending:false}).limit(1).maybeSingle(); if(s.error) throw s.error; source=s.data; sourceId=source?.id||""; if(!sourceId) return json({error:"Aktif makale kaynağı bulunamadı."},409); }
    const providerText=norm(`${source?.name||""} ${source?.base_url||""} ${source?.metadata?.provider||""} ${source?.metadata?.api_provider||""}`);
    if(/researchgate/.test(providerText)) return json({ok:true,engine:"research-v5.2",source:source?.name,skipped:true,reason:"ResearchGate otomatik taramaya uygun kaynak olarak kullanılmıyor; yayın keşfi indeks API'lerinden yapılır.",candidatesCreated:0});
    const providers = /semantic/.test(providerText) ? ["semantic"] : /crossref/.test(providerText) ? ["crossref"] : /openalex/.test(providerText) ? ["openalex"] : ["openalex","crossref","semantic"];
    const requested=Array.isArray(body?.queries)?body.queries.map((x:any)=>clean(x,240)).filter((x:string)=>x.length>2):[]; const metadataQuery=clean(source?.metadata?.query,240); const allQueries=requested.length?requested:(metadataQuery?[metadataQuery,...QUERY_POOL]:QUERY_POOL); const cursor=Math.min(requestedCursor,allQueries.length); const queries=allQueries.slice(cursor,cursor+batchSize); const nextCursor=cursor+queries.length<allQueries.length?cursor+queries.length:null;
    const found:Found[]=[]; const errors:string[]=[]; const providerStats:Record<string,{found:number;errors:number}>={}; for(const provider of providers) providerStats[provider]={found:0,errors:0};
    for(const q of queries){ for(const provider of providers){ try{ const rows=provider==="crossref"?await crossref(q,perQuery):provider==="semantic"?await semantic(q,perQuery):await openAlex(q,perQuery); found.push(...rows); providerStats[provider].found+=rows.length; }catch(e){ providerStats[provider].errors+=1; errors.push(`${provider} · ${q}: ${e instanceof Error?e.message:String(e)}`); } } }
    const unique=new Map<string,Found>(); for(const x of found){ const key=x.doi?`doi:${x.doi.toLowerCase()}`:`title:${norm(x.title)}`; if(!unique.has(key)) unique.set(key,x); }
    let created=0,duplicates=0,lowQuality=0,translated=0,translationFailed=0; const examples:string[]=[];
    for(const item of unique.values()){
      const publicationYear=articleYear(item);
      if(!publicationYear || publicationYear < 2010){ lowQuality++; continue; }
      const score=articleScore(item); if(score<45){lowQuality++;continue;} const fingerprint=await hash(`${item.doi||""}|${norm(item.title)}`);
      const saved=await admin.from("content_source_items").upsert({source_id:sourceId,external_id:item.doi||item.url,url:item.url,title:item.title,published_at:item.publishedAt,detected_language:item.language,raw_summary:item.summary||null,fingerprint,raw_metadata:{provider:item.provider,doi:item.doi,search_query:item.query,discovery_mode:discoveryMode},last_seen_at:new Date().toISOString()},{onConflict:"source_id,fingerprint"}).select("id").single();
      if(saved.error||!saved.data){errors.push(`${item.title}: ${saved.error?.message||"source item kaydedilemedi"}`);continue;}
      const ex=await admin.from("content_candidates").select("id,workflow_status,structured_body").eq("source_item_id",saved.data.id).maybeSingle(); if(ex.data){duplicates++;continue;}
      const tr=item.language==="tr";

      // Yabancı makale için admin'e gösterilecek "çeviri uyarısı" kartı üretme.
      // Gerçek kaynak başlığı ve özeti arka plandaki held kayıtta kalır;
      // content-reprocess böylece makalenin kendisini Türkçeleştirir.
      const sourceSummary =
        item.summary ||
        `Scientific article discovered from ${item.provider}: ${item.title}`;

      const ins=await admin.from("content_candidates").insert({
        source_item_id:saved.data.id,
        candidate_type:"knowledge_new",
        content_subtype:"article",
        title_suggested:item.title,
        short_summary:clean(sourceSummary,1200),
        body_draft:clean(sourceSummary,5000),
        source_refs:[{
          source_id:sourceId,
          source_name:source?.name||item.provider,
          title:item.title,
          url:item.url,
          published_at:item.publishedAt,
          language:item.language,
          doi:item.doi,
          search_query:item.query
        }],
        suggested_category:"Bilimsel Makale",
        suggested_tags:[
          "makale",
          item.provider,
          tr?"Türkçe":"yabancı",
          discoveryMode==="crop_targeted"?"ürün-odaklı":"genel-tarama"
        ],
        suggested_crops:[],
        original_language:item.language,
        relevance_score:score,
        trust_score:Number(source?.trust_score||82),
        novelty_score:70,
        copyright_status:"review",
        image_status:"missing",
        payload_status:tr?"ready":"processing",
        workflow_status:tr?"pending":"held",
        structured_body:{
          engine:"research-v5.3-background-translation-gate",
          provider:item.provider,
          doi:item.doi,
          search_query:item.query,
          discovery_mode:discoveryMode,
          publication_year:publicationYear,
          translation_status:tr?"not_needed":"processing",
          producer_summary_status:tr?"ready":"processing",
          admin_visibility:tr?"admin_ready":"background_only",
          queue_block_reason:tr?null:"translation_incomplete",
          channel:"article"
        }
      }).select("id").single();
      if(ins.error||!ins.data){errors.push(`${item.title}: ${ins.error?.message||"candidate"}`);continue;} created++; if(examples.length<6) examples.push(item.title);
      if(!tr){
        try{
          const headers:Record<string,string>={"Content-Type":"application/json"}; const auth=req.headers.get("Authorization"); const cron=req.headers.get("x-cron-token"); if(auth) headers.Authorization=auth; if(cron) headers["x-cron-token"]=cron;
          const rp=await fetch(`${url}/functions/v1/content-reprocess`,{method:"POST",headers,body:JSON.stringify({candidateId:ins.data.id,rewrite:true,forceImage:false}),signal:AbortSignal.timeout(90000)}); const rpText=await rp.text();
          if(!rp.ok){ translationFailed++; await markTranslation(admin, ins.data.id, "failed_auto", `HTTP ${rp.status} ${rpText}`); errors.push(`translation ${item.title}: HTTP ${rp.status} ${clean(rpText,300)}`); continue; }
          translated++; await markTranslation(admin, ins.data.id, "translated");
        }catch(e){ translationFailed++; const msg=e instanceof Error?e.message:String(e); await markTranslation(admin, ins.data.id, "failed_auto", msg); errors.push(`translation ${item.title}: ${msg}`); continue; }
      }
    }
    await admin.from("content_sources").update({last_scanned_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",sourceId);
    return json({ok:true,engine:"research-v5.3-background-translation-gate",authorization:access.mode,discoveryMode,providers,providerStats,source:source?.name||null,batch:{cursor,nextCursor,batchSize:queries.length,totalQueries:allQueries.length,hasMore:nextCursor!==null},queriesUsed:queries.length,found:found.length,unique:unique.size,candidatesCreated:created,translated,translationFailed,duplicates,lowQualityRejected:lowQuality,errors:errors.slice(0,10),examples});
  }catch(e){console.error("[RESEARCH_V5_2]",e);return json({error:e instanceof Error?e.message:"Makale taraması başarısız."},500);}
});