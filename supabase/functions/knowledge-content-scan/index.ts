import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1.0.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const clean = (v: unknown, n = 12000) => String(v ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const norm = (v: unknown) => clean(v, 2000).toLocaleLowerCase("tr-TR").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").trim();
const AGRI = /(crop|plant|agric|pest|disease|weed|insect|fung|virus|bacter|nemat|irrig|fertili|nutrient|nitrogen|soil|harvest|storage|yield|cultivar|variety|drought|frost|heat|wheat|barley|corn|maize|cotton|olive|grape|fig|citrus|pistach|hazelnut|almond|apple|cherry|potato|tomato|rice|tarım|bitki|hastalık|zararlı|yabancı.ot|sulama|gübre|besin|azot|toprak|hasat|verim|çeşit|kurak|don|sıcak|buğday|arpa|mısır|pamuk|zeytin|üzüm|incir|fındık|badem|elma|kiraz|fıstık|turunçgil|narenciye|bahçe)/i;
const PRACTICAL = /(symptom|sign|diagnos|identify|management|control|prevent|monitor|scout|threshold|sampling|checklist|rotation|resistant|application|timing|treatment|irrig|fertili|harvest|storage|planting|soil|nutrition|variety|yield|drought|frost|heat|belirti|teşhis|tanı|mücadele|önle|izle|eşik|örnek|kontrol|münavebe|dayanıklı|uygula|zamanlama|sulama|gübre|hasat|depolama|ekim|toprak|besleme|çeşit|verim|kurak|don|sıcak)/i;
const SPECIFIC = /(anthracnose|blight|rot|rust|mildew|canker|wilt|scab|mite|aphid|borer|scale|moth|nematode|weed|dormancy|bloom|postbloom|postharvest|fruit development|hull split|sampling|monitor|threshold|antraknoz|yanıklık|çürüklük|pas|külleme|kanser|solgunluk|akar|yaprak biti|kurt|nematod|yabancı ot|çiçeklenme|hasat sonrası|örnekleme|izleme|eşik)/i;
const JUNK = /(minister|ministry visit|meeting|ceremony|festival|fair|award|appointment|personnel|director|delegation|press release|bakan|ziyaret|toplantı|tören|festival|fuar|ödül|atama|personel|müdür|başkan|heyet|protokol|basın açıklaması)/i;
const SKIP = /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|docx?|xlsx?|pptx?|mp4|mp3)(\?|$)/i;
const UA = "TarlaPusula-Knowledge/18.1";

type Source = { id: string; name: string; base_url: string; language: string | null; trust_score: number | null; metadata: any };
type Crop = { crop_name: string; crop_key: string; field_count: number; user_count: number; priority_score: number };
type Item = { url: string; title: string; body: string; summary: string; score: number; crops: string[]; topic: string; practicalSignals: number };

const CROP_EN: Record<string, string[]> = {
  "aci bakla":["lupin"],"adacayi":["sage"],"ahududu":["raspberry"],"alabas":["kohlrabi"],"anason":["anise"],"antep fistigi":["pistachio"],"armut":["pear"],"arpa":["barley","small grains"],"aronya":["chokeberry"],"aycicegi":["sunflower"],"ayva":["quince"],"badem":["almond"],"bakla":["faba bean","broad bean"],"bal kabagi":["pumpkin"],"bamya":["okra"],"beyaz lahana":["cabbage"],"bezelye":["pea"],"biber":["pepper"],"biberiye":["rosemary"],"bogurtlen":["blackberry"],"brokoli":["broccoli"],"bruksel lahanasi":["brussels sprouts"],"bugday":["wheat","small grains"],"cavdar":["rye","small grains"],"cay":["tea"],"cayir otu":["grass","forage"],"cemen":["fenugreek"],"cerezlik kabak":["pumpkin","squash"],"cilek":["strawberry"],"corek otu":["black cumin","nigella"],"coven":["gypsophila"],"cukurova pamugu":["cotton"],"dari":["millet"],"defne":["bay laurel"],"dereotu":["dill"],"domates":["tomato"],"dut":["mulberry"],"elma":["apple"],"enginar":["artichoke"],"erik":["plum"],"fasulye":["bean"],"fig":["vetch"],"findik":["hazelnut"],"frenk uzumu":["currant"],"gazanya":["gazania"],"geven":["astragalus"],"greyfurt":["grapefruit"],"gul":["rose"],"havuc":["carrot"],"hashas":["poppy"],"hiyar":["cucumber"],"hindiba":["chicory"],"hunnap":["jujube"],"ispanak":["spinach"],"isirgan":["nettle"],"igde":["oleaster","russian olive"],"incir":["fig"],"italyan cimi":["italian ryegrass"],"kabak":["squash"],"karnabahar":["cauliflower"],"karpuz":["watermelon"],"kavun":["melon"],"kayisi":["apricot"],"keciboynuzu":["carob"],"kekik":["thyme","oregano"],"kereviz":["celery"],"keten":["flax"],"kestane":["chestnut"],"kirmizi lahana":["red cabbage"],"kiraz":["cherry"],"kisnis":["coriander"],"kivi":["kiwifruit"],"kolza kanola":["canola","rapeseed"],"korunga":["sainfoin"],"kuskonmaz":["asparagus"],"kus uzumu":["gooseberry","currant"],"kuru fasulye":["dry bean"],"lavanta":["lavender"],"limon":["lemon"],"macar figi":["hungarian vetch"],"mandalina":["mandarin"],"marul":["lettuce"],"mercankosk":["marjoram"],"mercimek":["lentil"],"misir":["maize","corn"],"musmula":["medlar"],"murdumuk":["grass pea"],"nane":["mint"],"nar":["pomegranate"],"nektarin":["nectarine"],"nohut":["chickpea"],"pamuk":["cotton"],"pancar":["beet"],"patates":["potato"],"patlican":["eggplant","aubergine"],"pazi":["chard"],"pekan cevizi":["pecan"],"pirasa":["leek"],"portakal":["orange"],"reyhan":["basil"],"roka":["rocket","arugula"],"safran":["saffron"],"sarimsak":["garlic"],"semizotu":["purslane"],"seftali":["peach"],"seker pancari":["sugar beet"],"seker misiri":["sweet corn"],"susam":["sesame"],"soya fasulyesi":["soybean"],"sogan":["onion"],"sorgum":["sorghum"],"sudan otu":["sudan grass"],"taflan":["cherry laurel"],"tarhun":["tarragon"],"tatli patates":["sweet potato"],"tere":["cress"],"tibbi papatya":["chamomile"],"tritikale":["triticale"],"turp":["radish"],"trabzon hurmasi":["persimmon"],"ucgul":["clover"],"uzum":["grape","vineyard"],"visne":["sour cherry"],"yaban mersini":["blueberry"],"yer elmasi":["jerusalem artichoke"],"yer fistigi":["peanut","groundnut"],"yonca":["alfalfa"],"yulaf":["oat","small grains"],"zeytin":["olive"],"pirinc":["rice"],"celtik":["rice"]
};
const UC_SLUG: Record<string, string> = { "arpa":"small-grains","bugday":"small-grains","badem":"almond","antep fistigi":"pistachio","elma":"apple","kiraz":"cherry","uzum":"grape","misir":"corn","pamuk":"cotton","domates":"tomato","pirinc":"rice","celtik":"rice","patates":"potato","cilek":"strawberry","armut":"pear","seftali":"peach","erik":"plum" };

function aliases(c: Crop) { const key = norm(c.crop_key); return [...new Set([c.crop_name, key, ...(CROP_EN[key] || [])].map(norm).filter(Boolean))]; }
function cropHits(text: string, crops: Crop[]) { const n = norm(text); return crops.filter(c => aliases(c).some(a => a.length > 2 && n.includes(a))).map(c => c.crop_name); }
function topicFrom(text: string) {
  const n = norm(text);
  if (/disease|fung|virus|bacter|hastalik|rot|mildew|rust|blight|canker/.test(n)) return "Hastalık";
  if (/pest|insect|mite|aphid|nemat|zararli|borer|scale|moth/.test(n)) return "Zararlı";
  if (/irrig|water|sulama|soil moisture/.test(n)) return "Sulama";
  if (/fertili|nutrient|nitrogen|phosph|potassium|gubre|besin|azot/.test(n)) return "Bitki Besleme";
  if (/soil|toprak|salinity|compaction/.test(n)) return "Toprak";
  if (/harvest|storage|hasat|depolama/.test(n)) return "Hasat ve Depolama";
  if (/variety|cultivar|cesit/.test(n)) return "Çeşit";
  if (/drought|heat|frost|kurak|sicak|don/.test(n)) return "İklim Riski";
  if (/planting|sowing|ekim|dikim/.test(n)) return "Ekim-Dikim";
  if (/yield|verim/.test(n)) return "Verim";
  return "Yetiştiricilik";
}
function abs(base: string, href: string) { try { const u = new URL(href, base); u.hash = ""; return u.toString(); } catch { return ""; } }
function sameHost(a: string, b: string) { try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); } catch { return false; } }
function isHubLike(url: string, title: string, body: string) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    if (u.hostname.replace(/^www\./, "") === "ipm.ucanr.edu" && /^\/agriculture\/[^/]+\/?$/.test(u.pathname)) return true;
    const shortTitle = norm(title).split(" ").length <= 3;
    const actionCount = (body.match(/\b(monitor|management|control|threshold|sampling|checklist|symptom|timing|treatment|izle|mücadele|eşik|örnekleme|belirti|zamanlama)\b/gi) || []).length;
    if (parts.length <= 1 && shortTitle && actionCount < 3) return true;
  } catch { }
  return false;
}
function practicalSignals(text: string) {
  const n = norm(text);
  const buckets = [
    /symptom|sign|belirti|leke|solgun|curuk|yaniklik|nekroz/,
    /monitor|scout|sample|inspect|izle|kontrol|ornek|sayim/,
    /threshold|if more than|when .* exceeds|esik|fazla ise|ustunde ise/,
    /management|control|prevent|remove|prune|destroy|mucadele|onle|temizle|budama|imha/,
    /timing|bloom|dormancy|harvest|postharvest|when to|zaman|ciceklenme|hasat|dinlenme/,
    /irrig|fertili|soil|water|sulama|gubre|toprak|su/,
  ];
  return buckets.reduce((sum, re) => sum + (re.test(n) ? 1 : 0), 0);
}

function sourceSentences(value: string) {
  return clean(value, 18000)
    .split(/(?<=[.!?])\s+/)
    .map((x) => clean(x, 700))
    .filter((x) => x.length >= 35)
    .filter((x) => !/(tiklayiniz|gosterim sayisi|^arsiv$|degerli .* ureticiler|bereketli .* sezon|firat erkal)/i.test(norm(x)));
}

function uniqueSentences(values: string[], limit = 6) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = norm(value);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean(value, 700));
    if (out.length >= limit) break;
  }
  return out;
}

function directTurkishTitle(item: Item) {
  const n = norm(item.title);
  const body = norm(item.body);
  if (/turuncgil .* dikkatine/.test(n) && /biyolojik .* mucadele/.test(body)) {
    return "Turunçgil Bahçesinde Biyolojik Mücadele: Önce İzle, Faydalıları Koru";
  }
  return clean(item.title.replace(/\s*[-|/]\s*(?:T\.C\.|Tarım ve Orman Bakanlığı).*$/i, ""), 320);
}

function directTurkishGuide(item: Item, source: Source) {
  const ss = sourceSentences(item.body || item.summary);
  const pick = (re: RegExp, n: number) => uniqueSentences(ss.filter((x) => re.test(norm(x))), n);
  const when = pick(/zaman|donem|erken|gec|once|sonra|cicek|hasat|ilkbahar|yaz|kis|sonbahar|ekim|dikim|gelisim/, 5);
  const look = pick(/belirti|isaret|gozle|kontrol|izle|leke|yaprak|meyve|cicek|zararli|hastalik|nem|renk|kok|govde|tuzak|analiz/, 6);
  const check = pick(/kontrol|incele|izle|ornek|olc|say|tuzak|analiz|gozlem|bak|kaydet|numune/, 6);
  const decision = pick(/eger|ise|durumda|goruldugunde|gerekiyorsa|asarsa|altinda|ustunde/, 5);
  const manage = pick(/yonet|mucadele|uygula|temizle|budama|sulama|gubre|hasat|koru|uzaklastir|havalandir|azalt|artir/, 6);
  const prevent = pick(/onle|koru|kacin|temiz|hijyen|dayanikli|munavebe|rotasyon|havalandir/, 5);
  const first = uniqueSentences(ss, 3);
  const quickParts = uniqueSentences([...check, ...manage, ...prevent, ...first], 2);
  const quick = clean(quickParts.join(" ") || item.summary || first.slice(0, 2).join(" "), 650);
  const why = clean(
    ss.find((x) => /verim|kalite|kayip|risk|maliyet|zarar|gelisim|urun/.test(norm(x))) ||
    first[1] ||
    first[0] ||
    item.summary,
    900
  );
  const sufficiency = item.body.split(/\s+/).length >= 220 && item.practicalSignals >= 3 ? "strong" : "medium";
  const score = Math.min(95, Math.max(65, Number(item.score || 65)));

  return {
    quick_answer: quick,
    problem_or_goal: clean(first[0] || item.summary || item.title, 850),
    why_it_matters: why,
    when_to_check: when,
    what_to_look_for: look,
    field_check_steps: check,
    decision_rules: decision,
    management_steps: manage,
    prevention: prevent,
    common_mistakes: [],
    avoid: [],
    season_notes: when.slice(0, 3),
    turkey_note: source.country === "TR" || source.language === "tr"
      ? "Kaynak Türkiye koşullarına yönelik Türkçe teknik içeriktir."
      : "",
    source_limits: "Kart yalnız kaynakta açıkça bulunan bilgilerden derlenmiştir; kaynakta olmayan doz, eşik veya uygulama ayrıntısı eklenmemiştir.",
    source_sufficiency: sufficiency,
    producer_value_score: score,
  };
}

async function fetchHtml(url: string) {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const isAntalya = host === "antalya.tarimorman.gov.tr";
  const r = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(isAntalya ? 22000 : 10000),
    headers: {
      "User-Agent": isAntalya
        ? "Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/126.0 Safari/537.36"
        : UA,
      Accept: "text/html,application/xhtml+xml",
      "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.6",
    }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("html")) return "";
  return (await r.text()).slice(0, 700_000);
}

function diagnoseHtml(html: string, url: string, crops: Crop[], allowGeneric = false) {
  try {
    const $ = cheerio.load(html);
    $("script,style,nav,header,footer,aside,button,input,select,textarea,svg,noscript,.share,.social,.breadcrumbs").remove();
    const title = contentPageTitle($);
    let root = $("article").first();
    if (!root.length) root = $("main").first();
    if (!root.length) root = $("body").first();
    const text = clean(root.text(), 30000);
    const summary = clean($("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || text, 1400);
    const hay = `${title} ${summary} ${text.slice(0,10000)}`;
    const hits = cropHits(hay, crops);
    return {
      html_chars: html.length,
      title,
      root_words: text ? text.split(/\s+/).length : 0,
      agri: AGRI.test(hay),
      junk_title: JUNK.test(title),
      practical_signals: practicalSignals(hay),
      specific: SPECIFIC.test(`${title} ${url}`),
      crop_hits: hits,
      allow_generic: allowGeneric,
      hub_like: isHubLike(url,title,text),
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function contentPageTitle($: cheerio.CheerioAPI) {
  const candidates = [
    clean($("meta[property='og:title']").attr("content"), 400),
    clean($("title").first().text(), 400),
    ...$("h1,h2,h3").toArray().map((e) => clean($(e).text(), 400)),
  ].filter(Boolean);
  const generic = /^(t c )?tarim ve orman bakanligi$|^antalya il tarim ve orman mudurlugu$|^tarim ve orman bakanligi$/i;
  const chosen = candidates.find((x) => x.length >= 8 && !generic.test(norm(x)) && !/^ana sayfa$/i.test(norm(x)));
  return chosen || candidates[0] || "";
}

function extract(html: string, url: string, crops: Crop[], allowGeneric = false): Item | null {
  const $ = cheerio.load(html);
  $("script,style,nav,header,footer,aside,button,input,select,textarea,svg,noscript,.share,.social,.breadcrumbs").remove();
  const title = contentPageTitle($);
  let root = $("article").first();
  if (!root.length) root = $("main").first();
  if (!root.length) root = $("body").first();
  const paras: string[] = [];
  root.find("h2,h3,h4,p,li,table tr,.content,.detail,.haberIcerik,.haber-icerik,.icerik,.field-item").each((_, e) => {
    const t = clean($(e).text(), 2600);
    if (t.length >= 35) paras.push(t);
  });
  let body = clean([...new Set(paras)].slice(0, 160).join("\n\n"), 30000);
  if (body.split(/\s+/).length < 90) {
    const fallbackRoot = root.clone();
    fallbackRoot.find("script,style,nav,header,footer,aside,button,input,select,textarea,svg,noscript").remove();
    const fallbackText = clean(fallbackRoot.text(), 30000);
    if (fallbackText.split(/\s+/).length > body.split(/\s+/).length) body = fallbackText;
  }
  const summary = clean($("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || body, 1400);
  const hay = `${title} ${summary} ${body.slice(0, 10000)}`;
  const junkProbe = allowGeneric ? title : `${title} ${summary}`;
  if (title.length < 8 || body.split(/\s+/).length < 90 || !AGRI.test(hay) || JUNK.test(junkProbe)) return null;
  if (isHubLike(url, title, body)) return null;
  const signals = practicalSignals(hay);
  if (signals < 2 && !SPECIFIC.test(`${title} ${url}`)) return null;
  const hits = cropHits(hay, crops);
  if (crops.length && !hits.length && !allowGeneric) return null;
  let score = 48 + signals * 8;
  if (PRACTICAL.test(title)) score += 8;
  if (SPECIFIC.test(`${title} ${url}`)) score += 12;
  if (hits.length) score += 10;
  if (body.split(/\s+/).length >= 300) score += 6;
  return { url, title, body, summary, score: Math.min(100, score), crops: hits, topic: topicFrom(hay), practicalSignals: signals };
}

function seeds(s: Source, crops: Crop[]) {
  let host = "";
  try { host = new URL(s.base_url).hostname.replace(/^www\./, ""); } catch { }
  const out = [s.base_url];
  if (host === "ipm.ucanr.edu") {
    for (const c of crops) { const slug = UC_SLUG[norm(c.crop_key)]; if (slug) out.push(`https://ipm.ucanr.edu/agriculture/${slug}/`); }
  }
  if (host.includes("extension.umn.edu")) out.push("https://extension.umn.edu/agriculture/crop-production");
  if (host.includes("cropwatch.unl.edu")) out.push("https://cropwatch.unl.edu/plant-disease/", "https://cropwatch.unl.edu/crops/");
  if (host.includes("grdc.com.au")) out.push("https://grdc.com.au/resources-and-publications/grownotes", "https://grdc.com.au/resources-and-publications/resources/crop-diseases");
  if (host.includes("extension.psu.edu")) out.push("https://extension.psu.edu/forage-and-food-crops/agronomic-crops/pests-and-diseases");
  if (host.includes("ahdb.org.uk")) out.push("https://ahdb.org.uk/integrated-pest-management-ipm-hub", "https://ahdb.org.uk/knowledge-library/encyclopaedia-of-cereal-diseases");
  return [...new Set(out)];
}

async function discover(s: Source, crops: Crop[], limit: number) {
  const urls = new Map<string, number>();
  const seedSet = new Set(seeds(s, crops));
  const found: Item[] = [];
  const errors: string[] = [];

  // Kaynağın ana/seed sayfası da teknik içerik taşıyabilir.
  // Özellikle kamu/extension sayfalarında bütün rehber tek sayfa içinde olabiliyor.
  for (const seed of seedSet) {
    if (found.length >= limit) break;
    try {
      const seedHtml = await fetchHtml(seed);
      if (seedHtml) {
        const allowGeneric = s.language === "tr" || s.metadata?.allow_generic_guide === true;
        const seedItem = extract(seedHtml, seed, crops, allowGeneric);
        if (seedItem) found.push(seedItem);
        else if (s.language === "tr") errors.push(`diagnostic:${JSON.stringify(diagnoseHtml(seedHtml, seed, crops, allowGeneric))}`);
      }
    } catch (e) {
      errors.push(`${seed}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  for (const seed of seedSet) {
    try {
      const h = await fetchHtml(seed);
      const $ = cheerio.load(h);
      $("a[href]").each((_, e) => {
        const a = $(e), u = abs(seed, a.attr("href") || ""), t = clean(a.text(), 300), hay = `${t} ${u}`;
        if (!u || seedSet.has(u) || !sameHost(s.base_url, u) || SKIP.test(u) || JUNK.test(hay)) return;
        const hits = cropHits(hay, crops);
        const practical = PRACTICAL.test(hay), specific = SPECIFIC.test(hay);
        if (hits.length || practical || specific || AGRI.test(hay)) {
          let sc = 2;
          if (practical) sc += 6;
          if (specific) sc += 8;
          if (hits.length) sc += 8;
          try { if (new URL(u).pathname.split("/").filter(Boolean).length >= 3) sc += 3; } catch { }
          urls.set(u, Math.max(urls.get(u) || 0, sc));
        }
      });
    } catch { }
  }

  for (const [u] of [...urls.entries()].sort((a, b) => b[1] - a[1]).slice(0, 36)) {
    if (found.length >= limit) break;
    try {
      const h = await fetchHtml(u);
      if (!h) continue;
      const item = extract(h, u, crops, s.language === "tr" || s.metadata?.allow_generic_guide === true);
      if (item && !found.some((existing) => existing.url === item.url)) found.push(item);
    } catch (e) { errors.push(`${u}: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return { found, errors };
}

async function sha(v: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v)))].map(x => x.toString(16).padStart(2, "0")).join("");
}

async function reprocess(baseUrl: string, id: string, req: Request) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const cron = req.headers.get("x-cron-token"), auth = req.headers.get("Authorization");
  if (cron) headers["x-cron-token"] = cron;
  else if (auth) headers.Authorization = auth;
  try {
    const r = await fetch(`${baseUrl}/functions/v1/content-reprocess`, { method: "POST", headers, body: JSON.stringify({ candidateId: id, rewrite: true, forceImage: false }), signal: AbortSignal.timeout(95000) });
    const text = clean(await r.text(), 1600);
    let data: any = null;
    try { data = JSON.parse(text); } catch { }
    return { ok: r.ok, status: r.status, text, data };
  } catch (e) { return { ok: false, status: 0, text: e instanceof Error ? e.message : String(e), data: null }; }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST gerekli" }, 405);
  try {
    const su = Deno.env.get("SUPABASE_URL") || "", sk = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const db = createClient(su, sk, { auth: { persistSession: false } });
    const b = await req.json().catch(() => ({})), sourceId = clean(b.sourceId, 100), limit = Math.min(Math.max(Number(b.limit) || 1, 1), 3);
    const cp = await db.rpc("tp_active_crop_interest_pool", { p_limit: 30 });
    if (cp.error) throw cp.error;
    const crops = (cp.data || []) as Crop[];
    const publishedGuideRows = (
      await db.from("content_items")
        .select("id,title,source_refs")
        .eq("content_type","knowledge")
        .eq("content_subtype","guide")
        .in("status",["approved","published"])
        .limit(500)
    ).data || [];
    const publishedGuideUrls = new Set<string>();
    for (const row of publishedGuideRows as any[]) {
      for (const ref of Array.isArray(row.source_refs) ? row.source_refs : []) {
        const u = clean(ref?.url, 1200);
        if (u) publishedGuideUrls.add(u);
      }
    }
    let q = db.from("content_sources").select("id,name,base_url,language,trust_score,metadata,active").eq("active", true);
    if (sourceId) q = q.eq("id", sourceId);
    const src = await q;
    if (src.error) throw src.error;
    const sources = (src.data || []).filter((s: any) => ["guide","guide_reference","guide_catalog"].includes(String(s.metadata?.channel || ""))) as Source[];
    let created = 0, reprocessed = 0, held = 0, duplicates = 0, lowValueHeld = 0;
    const report: any[] = [];

    for (const s of sources) {
      const discoveryLimit = Math.min(Math.max(limit * 8, 8), 16);
      const d = await discover(s, crops, discoveryLimit);
      const r: any = { source: s.name, qualified: d.found.length, created: 0, reprocessed: 0, held: 0, lowValueHeld: 0, duplicates: 0, examples: d.found.slice(0, 5).map(x => ({ title: x.title, url: x.url, score: x.score, practicalSignals: x.practicalSignals })), errors: d.errors.slice(0, 6) };

      for (const item of d.found) {
        if (r.created >= limit) break;
        if (publishedGuideUrls.has(item.url)) {
          duplicates++;
          r.duplicates++;
          continue;
        }
        const matched = crops.filter(c => item.crops.includes(c.crop_name));
        const userMatchCount = matched.reduce((sum, c) => sum + Number(c.user_count || 0), 0);
        const cropPriority = matched.reduce((max, c) => Math.max(max, Number(c.priority_score || 0)), 0);
        const fp = await sha(`${s.id}|${item.url}|${norm(item.title)}`);
        const meta = { guide_score: item.score, practical_signals: item.practicalSignals, crop_matches: item.crops, crop_driven: true, topic: item.topic, user_crop_match_count: userMatchCount, crop_priority: cropPriority, discovery_mode: "crop_targeted_deep" };
        const si = await db.from("content_source_items").upsert({ source_id: s.id, external_id: item.url, url: item.url, title: item.title, detected_language: s.language || "en", raw_summary: item.summary, fingerprint: fp, raw_metadata: meta, last_seen_at: new Date().toISOString() }, { onConflict: "source_id,fingerprint" }).select("id").single();
        if (si.error || !si.data) { r.errors.push(si.error?.message || "source item"); continue; }
        const ex = await db.from("content_candidates").select("id,workflow_status,structured_body,original_language").eq("source_item_id", si.data.id).maybeSingle();
        if (ex.data) {
          const translationStatus = String(ex.data.structured_body?.translation_status || "");
          const shouldRetryHeld =
            ex.data.workflow_status === "held" &&
            String(ex.data.original_language || "").toLowerCase() !== "tr" &&
            ["pending_ai","processing","failed_auto",""].includes(translationStatus);

          if (shouldRetryHeld) {
            const processed = await reprocess(su, ex.data.id, req);
            if (processed.ok) {
              const refreshed = await db.from("content_candidates")
                .select("workflow_status")
                .eq("id", ex.data.id)
                .maybeSingle();
              if (refreshed.data?.workflow_status === "pending") {
                reprocessed++;
                r.reprocessed++;
              } else {
                held++;
                r.held++;
              }
            } else {
              held++;
              r.held++;
              if (r.errors.length < 8) {
                r.errors.push(`retry ${item.title}: ${processed.status} ${processed.text}`);
              }
            }
          } else {
            duplicates++;
            r.duplicates++;
          }
          continue;
        }
        const sourceIsTurkish = (s.language || "").toLowerCase().startsWith("tr");
        const localGuide = sourceIsTurkish ? directTurkishGuide(item, s) : null;
        const localReady = Boolean(
          localGuide &&
          localGuide.producer_value_score >= 65 &&
          ["strong","medium"].includes(localGuide.source_sufficiency) &&
          localGuide.quick_answer.length >= 40 &&
          localGuide.what_to_look_for.length >= 2 &&
          localGuide.field_check_steps.length >= 2
        );
        const ins = await db.from("content_candidates").insert({
          source_item_id: si.data.id,
          candidate_type: "knowledge_new",
          content_subtype: "guide",
          title_suggested: sourceIsTurkish ? directTurkishTitle(item) : item.title,
          short_summary: localGuide?.quick_answer || item.summary,
          body_draft: item.body,
          structured_body: {
            channel: "guide",
            discovery_engine: "knowledge-v28-retry-held-auto-tr",
            translation_status: sourceIsTurkish ? "not_required" : "pending_ai",
            source_body: item.body,
            source_score: item.score,
            practical_signals: item.practicalSignals,
            crop_matches: item.crops,
            crop_driven: item.crops.length > 0,
            topic: item.topic,
            user_crop_match_count: userMatchCount,
            crop_priority: cropPriority,
            producer_practicality_score: item.score,
            guide_format: "information_screen_v2",
            discovery_mode: sourceIsTurkish ? "trusted_tr_direct" : "crop_targeted_deep",
            ...(localGuide ? { guide: localGuide } : {}),
          },
          source_refs: [{ source_id: s.id, source_name: s.name, title: item.title, url: item.url, language: s.language || "en" }],
          suggested_category: item.topic || "Bilgi Rehberi",
          suggested_tags: ["Bilgi Rehberi", item.topic, ...item.crops],
          suggested_crops: item.crops,
          original_language: s.language || "en",
          relevance_score: item.score,
          trust_score: Number(s.trust_score || 85),
          novelty_score: 80,
          copyright_status: "review",
          workflow_status: localReady ? "pending" : "held",
          image_status: "missing",
          payload_status: localReady ? "ready" : "processing",
          admin_note: localReady
            ? "Türkçe teknik kaynak: AI beklemeden bilgi kartına dönüştürüldü; admin incelemesine hazır."
            : "Bilgi Rehberi: tarama tamamlandı, Türkçeleştirme/kalite kuyruğunda.",
          generated_at: new Date().toISOString(),
        }).select("id").single();
        if (ins.error || !ins.data) { r.errors.push(ins.error?.message || "candidate"); continue; }
        created++; r.created++;
        if (localReady) {
          r.reprocessed++;
          reprocessed++;
        } else {
          const processed = await reprocess(su, ins.data.id, req);
          if (processed.ok) {
            const refreshed = await db.from("content_candidates")
              .select("workflow_status,title_suggested,structured_body")
              .eq("id", ins.data.id)
              .maybeSingle();
            if (refreshed.data?.workflow_status === "pending") {
              r.reprocessed++;
              reprocessed++;
            } else {
              held++;
              r.held++;
            }
          } else {
            held++;
            r.held++;
            if (r.errors.length < 8) {
              r.errors.push(`reprocess ${item.title}: ${processed.status} ${processed.text}`);
            }
          }
        }
      }

      await db.from("content_sources").update({ last_scanned_at: new Date().toISOString(), updated_at: new Date().toISOString(), metadata: { ...(s.metadata || {}), channel: "guide", knowledge_engine: "knowledge-v28-retry-held-auto-tr", active_crop_count: crops.length, last_guide_qualified: r.qualified, last_guide_created: r.created, last_guide_reprocessed: r.reprocessed, last_guide_held: r.held, last_guide_low_value_held: r.lowValueHeld } }).eq("id", s.id);
      report.push(r);
    }

    return json({ ok: true, engine: "knowledge-v28-retry-held-auto-tr", activeCrops: crops.map(c => ({ crop: c.crop_name, key: c.crop_key, fields: c.field_count, users: c.user_count, priority: c.priority_score })), sourcesScanned: sources.length, candidatesCreated: created, reprocessed, held, lowValueHeld, duplicates, report });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});