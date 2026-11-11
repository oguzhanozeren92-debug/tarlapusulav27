import { createClient } from "npm:@supabase/supabase-js@2";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.883.0";

// visual-enrichment-v7-topic-unique
// - Türkçe başlık/etiketler sözlükle İngilizce/bilimsel karşılığa çevrilir; "makale", "rehber", "haber" gibi
//   kelimeler aramaya girmez.
// - Bir görsel, konuya özel en az bir kelime (ürün, zararlı, hastalık, konu) taşımadıkça kabul edilmez.
//   "agriculture/field/crop" gibi genel kelimeler eşleşme sayılmaz.
// - Başka bir içerikte kullanılmış görsel tekrar seçilmez.
// - Genel "agriculture crop field" yedeği ve alakasız sonuç yedeği yoktur. Uygun görsel yoksa durum "no_match" olur.

const ENGINE = "visual-enrichment-v7-topic-unique";
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const clean = (v: unknown, n = 1000) => String(v ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const account = (v: unknown) => clean(v, 300).replace(/^https?:\/\//i, "").replace(/\.r2\.cloudflarestorage\.com.*$/i, "").replace(/\/.*$/, "");
const stripHtml = (v: unknown, n = 500) => clean(String(v ?? "").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;/gi, "'"), n);
const fold = (v: unknown) => String(v ?? "").toLocaleLowerCase("tr-TR").replace(/ı/g, "i").replace(/ğ/g, "g").replace(/ü/g, "u").replace(/ş/g, "s").replace(/ö/g, "o").replace(/ç/g, "c").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

function license(v: unknown) {
  const s = clean(v, 140).toLowerCase().replace(/_/g, "-").replace(/\s+/g, " ");
  if (!s) return "";
  if (/noncommercial|cc[- ]by[- ]nc|\bnc\b|no[- ]deriv|cc[- ]by[- ]nd|\bnd\b/.test(s)) return "";
  if (/cc0|creative commons zero/.test(s)) return "cc0";
  if (/public domain mark|public domain|\bpdm\b/.test(s)) return "pdm";
  if (/cc[- ]by[- ]sa|creative commons attribution[- ]sharealike|\bby-sa\b/.test(s)) return "cc-by-sa";
  if (/cc[- ]by\b|creative commons attribution|^by$/.test(s)) return "cc-by";
  return "";
}
const SAFE = new Set(["cc0", "pdm", "cc-by", "cc-by-sa"]);

type Img = { url: string; landing: string; creator: string; license: string; title: string; source: string; width?: number; height?: number; rank?: number; query?: string };
type Term = { tr: RegExp; en: string; match: string[]; organism?: boolean };

// Türkçe → İngilizce/bilimsel sözlük. `match`: görsel metninde aranacak konu kelimeleri.
const TERMS: Term[] = [
  // Ürünler
  { tr: /\bbugday/, en: "wheat", match: ["wheat", "triticum"] },
  { tr: /\barpa\b/, en: "barley", match: ["barley", "hordeum"] },
  { tr: /\bmisir\b|\bmisir(?:da|in|i)\b/, en: "maize", match: ["maize", "zea mays", "corn field", "cornfield", "corn plant", "sweet corn", "ear of corn"] },
  { tr: /\bcavdar/, en: "rye", match: ["rye", "secale"] },
  { tr: /\byulaf/, en: "oat", match: ["avena", "oats", "oat field"] },
  { tr: /\bceltik|\bpirinc/, en: "rice paddy", match: ["oryza", "paddy", "rice field", "rice plant", "rice paddy", "rice terrace"] },
  { tr: /\bpamuk/, en: "cotton", match: ["cotton", "gossypium"] },
  { tr: /aycicek/, en: "sunflower", match: ["sunflower", "helianthus"] },
  { tr: /\bkanola|\bkolza/, en: "rapeseed canola", match: ["canola", "rapeseed", "brassica napus"] },
  { tr: /\bsoya/, en: "soybean", match: ["soybean", "soya", "glycine max"] },
  { tr: /seker pancar|\bpancar/, en: "sugar beet", match: ["sugar beet", "beta vulgaris", "beets"] },
  { tr: /\bpatates/, en: "potato", match: ["potato", "solanum tuberosum"] },
  { tr: /\bdomates/, en: "tomato", match: ["tomato", "solanum lycopersicum"] },
  { tr: /\bbiber/, en: "pepper plant", match: ["pepper", "capsicum"] },
  { tr: /\bpatlican/, en: "eggplant", match: ["eggplant", "aubergine", "solanum melongena"] },
  { tr: /\bsalatalik|\bhiyar/, en: "cucumber", match: ["cucumber", "cucumis sativus"] },
  { tr: /\bkarpuz/, en: "watermelon", match: ["watermelon", "citrullus"] },
  { tr: /\bkavun/, en: "melon", match: ["melon", "cucumis melo"] },
  { tr: /\bsogan/, en: "onion", match: ["onion", "allium cepa"] },
  { tr: /\bsarimsak/, en: "garlic", match: ["garlic", "allium sativum"] },
  { tr: /\bmercimek/, en: "lentil", match: ["lentil", "lens culinaris"] },
  { tr: /\bnohut/, en: "chickpea", match: ["chickpea", "cicer"] },
  { tr: /\bfasulye/, en: "bean plant", match: ["bean", "phaseolus"] },
  { tr: /\bbezelye/, en: "pea plant", match: ["pisum", "green pea", "peas"] },
  { tr: /\byonca/, en: "alfalfa", match: ["alfalfa", "lucerne", "medicago"] },
  { tr: /\bfindik/, en: "hazelnut", match: ["hazelnut", "corylus"] },
  { tr: /antep fistig|\bfistik/, en: "pistachio", match: ["pistachio", "pistacia"] },
  { tr: /\bceviz/, en: "walnut", match: ["walnut", "juglans"] },
  { tr: /\bbadem/, en: "almond", match: ["almond", "prunus dulcis"] },
  { tr: /\bzeytin/, en: "olive", match: ["olive", "olea"] },
  { tr: /\bkiraz/, en: "sweet cherry", match: ["cherry", "prunus avium"] },
  { tr: /\bvisne/, en: "sour cherry", match: ["cherry", "prunus cerasus"] },
  { tr: /\bkayisi/, en: "apricot", match: ["apricot", "prunus armeniaca"] },
  { tr: /\bseftali|\bnektarin/, en: "peach", match: ["peach", "nectarine", "prunus persica"] },
  { tr: /\berik\b/, en: "plum", match: ["plum", "prunus domestica"] },
  { tr: /\belma\b|\belmada|\belmanin/, en: "apple", match: ["apple", "malus"] },
  { tr: /\barmut/, en: "pear", match: ["pyrus", "pear", "pears", "pear tree"] },
  { tr: /\bayva/, en: "quince", match: ["quince", "cydonia"] },
  { tr: /\buzum|\bbag(?:da|lar|larda)?\b|\basma/, en: "grapevine", match: ["grape", "vineyard", "vitis"] },
  { tr: /\bnar\b|\bnarda/, en: "pomegranate", match: ["pomegranate", "punica"] },
  { tr: /\bincir/, en: "fig", match: ["ficus carica", "fig tree", "fig fruit", "figs"] },
  { tr: /narenciye|turuncgil|\bportakal|\bmandalina|\blimon/, en: "citrus", match: ["citrus", "orange", "mandarin", "lemon"] },
  { tr: /\bcilek/, en: "strawberry", match: ["strawberry", "fragaria"] },
  { tr: /\bcay\b|\bcayda/, en: "tea plantation", match: ["camellia sinensis", "tea plant", "tea plantation", "tea garden", "tea leaves"] },
  { tr: /\btutun/, en: "tobacco", match: ["tobacco", "nicotiana"] },
  // Zararlılar (organizma)
  { tr: /yaprak bit/, en: "aphid", match: ["aphid", "aphididae"], organism: true },
  { tr: /avrupa kirmizi orumcek|panonychus/, en: "Panonychus ulmi European red mite", match: ["panonychus", "european red mite"], organism: true },
  { tr: /kirmizi orumcek|\bakar/, en: "spider mite Tetranychus", match: ["spider mite", "tetranychus", "mites"], organism: true },
  { tr: /beyaz sinek/, en: "whitefly", match: ["whitefly", "bemisia", "trialeurodes"], organism: true },
  { tr: /\btrips/, en: "thrips", match: ["thrips"], organism: true },
  { tr: /domates guvesi|tuta absoluta/, en: "Tuta absoluta", match: ["tuta absoluta", "tomato leafminer"], organism: true },
  { tr: /sune\b|suneler/, en: "Eurygaster sunn pest", match: ["eurygaster", "sunn pest"], organism: true },
  { tr: /elma ic kurdu/, en: "Cydia pomonella codling moth", match: ["cydia pomonella", "codling moth"], organism: true },
  { tr: /kiraz sinegi/, en: "Rhagoletis cerasi cherry fruit fly", match: ["rhagoletis", "cherry fruit fly"], organism: true },
  { tr: /zeytin sinegi/, en: "Bactrocera oleae olive fruit fly", match: ["bactrocera oleae", "olive fruit fly"], organism: true },
  { tr: /akdeniz meyve sinegi/, en: "Ceratitis capitata", match: ["ceratitis", "medfly", "mediterranean fruit fly"], organism: true },
  { tr: /findik kurdu/, en: "Curculio nucum hazelnut weevil", match: ["curculio", "hazelnut weevil"], organism: true },
  { tr: /kahverengi kokarca/, en: "Halyomorpha halys stink bug", match: ["halyomorpha", "stink bug"], organism: true },
  { tr: /pamuk yaprak kurdu|spodoptera/, en: "Spodoptera", match: ["spodoptera", "armyworm"], organism: true },
  { tr: /misir koçan kurdu|misir kocan kurdu|helicoverpa/, en: "Helicoverpa armigera", match: ["helicoverpa", "bollworm"], organism: true },
  { tr: /salkim guvesi/, en: "Lobesia botrana grape moth", match: ["lobesia", "grape berry moth", "grapevine moth"], organism: true },
  { tr: /koşnil|kosnil|kabuklu bit/, en: "scale insect", match: ["scale insect", "coccoidea", "mealybug"], organism: true },
  { tr: /\bunlu bit/, en: "mealybug", match: ["mealybug", "pseudococc"], organism: true },
  { tr: /tel kurdu/, en: "wireworm", match: ["wireworm", "elateridae"], organism: true },
  { tr: /\bnematod/, en: "root-knot nematode", match: ["nematode", "meloidogyne"], organism: true },
  { tr: /\bsalyangoz|\bsumuklu/, en: "slug snail crop damage", match: ["slug", "snail"], organism: true },
  // Hastalıklar (organizma)
  { tr: /sari pas/, en: "Puccinia striiformis stripe rust wheat", match: ["puccinia", "stripe rust", "yellow rust"], organism: true },
  { tr: /kahverengi pas|yaprak pasi/, en: "Puccinia triticina leaf rust", match: ["puccinia", "leaf rust", "brown rust"], organism: true },
  { tr: /\bpas hastal/, en: "rust disease leaf", match: ["puccinia", "leaf rust", "stem rust", "stripe rust", "rust fung"], organism: true },
  { tr: /kulleme/, en: "powdery mildew", match: ["powdery mildew", "erysiphe", "blumeria", "podosphaera"], organism: true },
  { tr: /mildiyo/, en: "downy mildew", match: ["downy mildew", "plasmopara", "peronospora"], organism: true },
  { tr: /kurşuni kuf|kursuni kuf|botrytis/, en: "Botrytis cinerea grey mould", match: ["botrytis", "grey mould", "gray mold"], organism: true },
  { tr: /fusarium|kok curuklugu|kök çürüklüğü/, en: "Fusarium root rot", match: ["fusarium", "root rot"], organism: true },
  { tr: /septoria/, en: "Septoria leaf blotch", match: ["septoria"], organism: true },
  { tr: /alternaria|erken yaprak yanikligi/, en: "Alternaria early blight", match: ["alternaria", "early blight"], organism: true },
  { tr: /mildiyo patates|gec yaprak yanikligi|phytophthora/, en: "Phytophthora infestans late blight", match: ["phytophthora", "late blight"], organism: true },
  { tr: /karaleke|venturia/, en: "Venturia inaequalis apple scab", match: ["venturia", "apple scab", "scab"], organism: true },
  { tr: /ates yanikligi|erwinia amylovora/, en: "Erwinia amylovora fire blight", match: ["fire blight", "erwinia"], organism: true },
  { tr: /monilya|monilinia/, en: "Monilinia brown rot", match: ["monilinia", "brown rot"], organism: true },
  { tr: /antraknoz/, en: "anthracnose", match: ["anthracnose", "colletotrichum"], organism: true },
  { tr: /halkali leke|zeytin halkali/, en: "olive peacock spot Venturia oleaginea", match: ["peacock spot", "oleaginea", "spilocaea"], organism: true },
  { tr: /cokerten/, en: "damping off seedlings", match: ["damping", "seedling"], organism: true },
  { tr: /\bvirus/, en: "plant virus symptoms leaf", match: ["virus", "mosaic"], organism: true },
  // Ürün dışı özel konular
  { tr: /safran/, en: "saffron crocus", match: ["saffron", "crocus sativus"] },
  { tr: /\bkorunga/, en: "sainfoin", match: ["sainfoin", "onobrychis"] },
  { tr: /glifosat|herbisit|pestisit|zirai ilac/, en: "herbicide spraying", match: ["herbicide", "glyphosate", "pesticide", "sprayer", "spraying"] },
  { tr: /sicaklik stres|sicak stres|isi stres|asiri sicak/, en: "heat stress plants", match: ["heat stress", "heat wave", "heatwave", "scorch", "sunburn", "wilting"] },
  { tr: /tuzlu|tuzluluk|\bsalin/, en: "soil salinity", match: ["salin", "salt"] },
  { tr: /agir metal/, en: "heavy metal soil contamination", match: ["heavy metal", "contaminat", "polluted soil"] },
  { tr: /rhizobium|nodul|azot fiksasyon/, en: "rhizobium root nodules legume", match: ["rhizobium", "nodule", "nodules"] },
  { tr: /mikoriza/, en: "mycorrhiza roots", match: ["mycorrhiz"] },
  { tr: /turba/, en: "peat bog", match: ["peat"] },
  // Konular
  { tr: /\bdon\b|\bdonu\b|zirai don|soguk zarar/, en: "frost damage crop", match: ["frost", "freez", "frozen"] },
  { tr: /kuraklik|kurak/, en: "drought crop", match: ["drought", "wilting", "parched"] },
  { tr: /\bdolu\b/, en: "hail damage crop", match: ["hail"] },
  { tr: /\bsel\b|taskin/, en: "flooded crop field", match: ["flood"] },
  { tr: /damla sulama/, en: "drip irrigation", match: ["drip irrigation", "drip line", "dripper"] },
  { tr: /yagmurlama/, en: "sprinkler irrigation", match: ["sprinkler", "pivot"] },
  { tr: /\bsulama/, en: "irrigation", match: ["irrigation", "irrigat", "sprinkler", "drip"] },
  { tr: /azot/, en: "nitrogen fertilizer crop", match: ["nitrogen", "fertili", "urea"] },
  { tr: /fosfor/, en: "phosphorus fertilizer", match: ["phosph", "fertili"] },
  { tr: /potasyum/, en: "potassium deficiency leaf", match: ["potassium", "potash"] },
  { tr: /\bgubre/, en: "fertilizer application", match: ["fertili", "manure", "compost"] },
  { tr: /toprak analiz|toprak numune/, en: "soil sampling", match: ["soil sampl", "soil test", "soil core", "soil probe"] },
  { tr: /\btoprak/, en: "agricultural soil", match: ["soil"] },
  { tr: /yabanci ot|herbisit/, en: "weeds crop", match: ["weed", "herbicide"] },
  { tr: /biyolojik mucadele|dogal dusman|faydali bocek/, en: "biological control beneficial insect", match: ["ladybird", "ladybug", "lacewing", "parasitoid", "predator", "coccinell", "beneficial"] },
  { tr: /feromon|tuzak/, en: "pheromone trap insects", match: ["pheromone trap", "sticky trap", "insect trap", "traps"] },
  { tr: /\bilaclama|pulverizat/, en: "crop sprayer", match: ["sprayer", "spraying"] },
  { tr: /\bhasat/, en: "harvest", match: ["harvest", "combine"] },
  { tr: /\btohum|\bekim\b/, en: "seed sowing", match: ["seeds", "sowing", "seedling", "seed drill"] },
  { tr: /\bfide/, en: "seedlings nursery", match: ["seedling", "nursery", "transplant"] },
  { tr: /budama/, en: "fruit tree pruning", match: ["pruning", "pruned", "pruner"] },
  { tr: /\bari\b|tozlasma|\bpolen/, en: "bee pollination flower", match: ["honey bee", "honeybee", "bumblebee", "apis mellifera", "pollinat", "blossom"] },
  { tr: /sera\b|seracilik|serada/, en: "greenhouse vegetables", match: ["greenhouse", "glasshouse", "polytunnel"] },
  { tr: /\bdron|\bdrone|\biha\b/, en: "agricultural drone", match: ["drone", "uav"] },
  { tr: /\buydu|ndvi/, en: "satellite image farmland", match: ["satellite", "ndvi", "landsat", "sentinel"] },
  { tr: /\btraktor/, en: "tractor field", match: ["tractor"] },
  { tr: /\bdepolama|\bsilo/, en: "grain storage silo", match: ["silo", "grain storage", "granary"] },
  { tr: /\bmikotoksin|aflatoksin/, en: "moldy grain", match: ["mold", "mould", "aflatoxin", "mycotoxin"] },
];

// Aramaya girmemesi gereken kelimeler (Türkçe yayın türleri ve anlamsız genel kelimeler)
const DROP_WORDS = /\b(makale|makalesi|bilgi|rehber|rehberi|rehberleri|haber|haberi|haberleri|guncel|gundem|tarim|tarimsal|tarimda|uretici|ureticiler|ciftci|ciftciler|bilimsel|arastirma|calisma|sonuc|sonuclari|turkiye|kaynak|kart|icerik)\b/g;
// Konuya özel sayılmayan genel kelimeler
const GENERIC = new Set(["agriculture", "agricultural", "crop", "crops", "field", "fields", "farm", "farms", "farmer", "farmers", "farming", "plant", "plants", "food", "production", "management", "program", "guide", "study", "research", "analysis", "quality", "the", "and", "with", "from", "for", "of", "a", "an", "in", "on", "new", "image", "photo", "leaf", "leaves", "damage", "symptoms", "disease", "pest", "control", "growth", "yield", "season", "market", "price", "prices", "turkey", "china", "usa", "germany", "europe", "european", "india", "russia", "ukraine", "report", "reports", "data", "chart", "technical", "rises", "again", "record", "global", "world", "effects", "effect", "role", "review", "stress", "alleviation", "nutrient", "nutrients", "farmers", "protest", "office", "sign", "cargo", "ship", "train", "container", "stall", "basket", "fruit", "fruits", "tree", "trees", "orchard", "orchards", "harvesting", "rural", "village", "landscape", "risk", "sustainable", "climate", "change", "water", "soils", "laboratory", "level", "levels"]);

function escapeRe(v: string) { return v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
const wordReCache = new Map<string, RegExp>();
// Kısa kelimeler tam kelime (çoğul eki serbest), uzun kelimeler kelime başından eşleşir: "rice" ≠ "price", "bee" ≠ "beetle"
function hasWord(h: string, w: string) {
  let re = wordReCache.get(w);
  if (!re) { re = w.length <= 5 ? new RegExp(`\\b${escapeRe(w)}(?:s|es)?\\b`) : new RegExp(`\\b${escapeRe(w)}`); wordReCache.set(w, re); }
  return re.test(h);
}
function tokens(v: string) {
  return [...new Set(fold(v).replace(/[^a-z0-9\s-]/g, " ").split(/\s+/).filter((x) => x.length > 2))];
}
function specificTokens(v: string) { return tokens(v).filter((t) => !GENERIC.has(t)); }
function asciiShare(v: string) { const s = v.replace(/\s/g, ""); if (!s) return 0; return (s.match(/[a-z0-9-]/gi) || []).length / s.length; }

async function allowed(req: Request, db: any) {
  const cron = req.headers.get("x-cron-token")?.trim() || "";
  if (cron) { const c = await db.rpc("content_engine_check_cron_token", { p_token: cron }); if (!c.error && c.data === true) return true; }
  const internal = req.headers.get("x-content-image-secret")?.trim() || "";
  if (internal) { const c = await db.rpc("verify_content_image_secret", { p_secret: internal }); if (!c.error && c.data === true) return true; }
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return false;
  const u = await db.auth.getUser(token); if (u.error || !u.data.user) return false;
  const a = await db.from("admin_users").select("user_id").eq("user_id", u.data.user.id).maybeSingle();
  return Boolean(a.data);
}

function compactSourceTitle(v: unknown) {
  let s = clean(v, 500);
  if (!s) return "";
  s = s.split(/\s[|/]\s/)[0].trim();
  s = s.replace(/\s+-\s+(UC IPM|Penn State Extension|Purdue Extension|CropWatch|Nebraska).*$/i, "").trim();
  return s.slice(0, 180);
}

// İçerikten konu terimlerini çıkar (başlık + etiket + ürün + anahtar kelime)
function topicTerms(row: any, candidate: boolean) {
  const tags = Array.isArray(candidate ? row.suggested_tags : row.tags) ? (candidate ? row.suggested_tags : row.tags) : [];
  const crops = Array.isArray(candidate ? row.suggested_crops : row.crop_tags) ? (candidate ? row.suggested_crops : row.crop_tags) : [];
  const title = clean(candidate ? row.title_suggested : row.title, 400);
  const guideTopic = clean(row?.structured_body?.guide?.problem_or_goal || row?.structured_body?.topic, 200);
  const text = fold([title, guideTopic, tags.join(" "), crops.join(" ")].join(" "));
  const titleText = fold(title + " " + guideTopic);
  const hits = TERMS.filter((t) => t.tr.test(text));
  // Başlıkta geçenler önce
  hits.sort((a, b) => Number(b.tr.test(titleText)) - Number(a.tr.test(titleText)) || Number(Boolean(b.organism)) - Number(Boolean(a.organism)));
  return hits;
}

function sanitizeQuery(q: string) {
  let s = fold(q).replace(DROP_WORDS, " ");
  // Türkçe kelimeleri sözlükle çevir
  const translated: string[] = [];
  for (const t of TERMS) if (t.tr.test(s)) translated.push(t.en);
  s = s.replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim();
  // Ağırlıklı olarak Türkçe ise (orijinal metinde Türkçe karakter yoğunsa) yalnızca çevirileri kullan
  const turkishHeavy = /[çğıöşü]/i.test(q) && translated.length > 0;
  const out = turkishHeavy ? translated.slice(0, 2).join(" ") : s;
  return clean(out, 160);
}

function queryCandidates(row: any, body: any, candidate: boolean, terms: Term[]) {
  const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
  const english = refs.find((r: any) => clean(r?.language, 20).toLowerCase().startsWith("en") && clean(r?.title, 500));
  const sourceTitle = english ? compactSourceTitle(english.title) : "";
  const keyword = clean(body.keyword || row.image_search_keyword, 220);
  const organism = terms.find((t) => t.organism);
  const crop = terms.find((t) => isCropTerm(t));
  const topics = terms.filter((t) => !t.organism && !isCropTerm(t));
  const topic = topics[0];
  const isGuide = clean(row.content_subtype, 80) === "guide" || row?.structured_body?.channel === "guide";
  const vals: string[] = [];
  if (organism) {
    vals.push(organism.en);
    if (crop) vals.push(`${organism.en} ${crop.en}`);
  }
  if (keyword && asciiShare(keyword) > 0.9) vals.push(sanitizeQuery(keyword));
  if (crop && topic) vals.push(`${crop.en} ${topic.en}`);
  if (sourceTitle && !isGuide) vals.push(sanitizeQuery(sourceTitle));
  if (crop) vals.push(crop.en);
  if (topic) vals.push(topic.en);
  if (topics[1]) vals.push(crop ? `${crop.en} ${topics[1].en}` : topics[1].en);
  const out = [...new Set(vals.map((v) => clean(v, 160)).filter((v) => v && specificTokens(v).length > 0))];
  return out.slice(0, 5);
}

const FIRST_ORGANISM = TERMS.findIndex((x) => x.organism);
const isCropTerm = (t: Term) => !t.organism && TERMS.indexOf(t) < FIRST_ORGANISM;
type Subject = { words: string[]; res: RegExp[] };
// Görselde aranacak konu: sözlük eşleşmeleri (İngilizce + Türkçe) + anahtar kelimenin baştaki konu kelimeleri.
// Rehberlerde zararlı/hastalık/konu varsa yalnız ürün fotoğrafı yeterli sayılmaz.
function subjectFor(terms: Term[], queries: string[], keyword: string, isGuide: boolean): Subject {
  const nonCrop = terms.filter((t) => !isCropTerm(t));
  const used = isGuide && nonCrop.length ? nonCrop : terms;
  const words = new Set<string>();
  for (const t of used) for (const m of t.match) words.add(fold(m).trim());
  // Anahtar kelime yalnızca sözlükten terim çıkmadığında konu kaynağı olur (yer adları vb. karışmasın)
  if (!terms.length && keyword && asciiShare(keyword) > 0.9) for (const t of specificTokens(keyword).slice(0, 2)) words.add(t);
  if (!words.size) for (const q of queries) for (const t of specificTokens(q).slice(0, 3)) words.add(t);
  return { words: [...words].filter((w) => w.length > 2), res: used.map((t) => t.tr) };
}
function subjectWords(terms: Term[], queries: string[]) { return subjectFor(terms, queries, "", false).words; }

async function commons(q: string): Promise<Img[]> {
  const p = new URLSearchParams({ action: "query", format: "json", origin: "*", generator: "search", gsrsearch: `${q} filetype:bitmap`, gsrnamespace: "6", gsrlimit: "40", prop: "imageinfo", iiprop: "url|extmetadata|size|mime", iiurlwidth: "1400", iiextmetadatafilter: "LicenseShortName|Artist|Credit|ImageDescription|UsageTerms|ObjectName" });
  const r = await fetch(`https://commons.wikimedia.org/w/api.php?${p}`, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "TarlaPusula-Visual/7.0 (agricultural knowledge guide)" } });
  if (!r.ok) throw new Error(`Wikimedia HTTP ${r.status}`);
  const j = await r.json();
  return (Object.values(j?.query?.pages || {}) as any[]).map((page: any) => {
    const ii = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null, m = ii?.extmetadata || {}, l = license(m?.LicenseShortName?.value || m?.UsageTerms?.value);
    const mime = clean(ii?.mime, 60).toLowerCase();
    return { url: mime && !/^image\/(jpeg|png|webp)$/.test(mime) ? "" : clean(ii?.thumburl || ii?.url, 1800), landing: clean(ii?.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page?.title || "")}`, 1800), creator: stripHtml(m?.Artist?.value || m?.Credit?.value, 320), license: l, title: stripHtml([m?.ObjectName?.value, m?.ImageDescription?.value, page?.title].filter(Boolean).join(" · "), 700), source: "commons.wikimedia.org", width: Number(ii?.width) || undefined, height: Number(ii?.height) || undefined, rank: Number(page?.index) || 0 } as Img;
  }).filter((x: Img) => x.url && SAFE.has(x.license));
}

async function inat(q: string): Promise<Img[]> {
  const p = new URLSearchParams({ q, photos: "true", photo_license: "cc0,cc-by,cc-by-sa", per_page: "30", order_by: "votes", order: "desc", quality_grade: "research" });
  const r = await fetch(`https://api.inaturalist.org/v1/observations?${p}`, { signal: AbortSignal.timeout(15000), headers: { "User-Agent": "TarlaPusula-Visual/7.0" } });
  if (!r.ok) throw new Error(`iNaturalist HTTP ${r.status}`);
  const j = await r.json(), out: Img[] = [];
  const rows = Array.isArray(j?.results) ? j.results : [];
  for (let oi = 0; oi < rows.length; oi++) {
    const obs = rows[oi], photos = Array.isArray(obs?.photos) ? obs.photos.slice(0, 2) : [];
    for (let pi = 0; pi < photos.length; pi++) {
      const ph = photos[pi], l = license(ph?.license_code); if (!SAFE.has(l)) continue;
      const base = clean(ph?.url, 1800); if (!base) continue;
      const taxon = [obs?.taxon?.preferred_common_name, obs?.taxon?.name, obs?.species_guess].filter(Boolean).join(" · ");
      out.push({ url: base.replace(/\/(square|small|medium)\./i, "/large."), landing: clean(obs?.uri || `https://www.inaturalist.org/observations/${obs?.id || ""}`, 1800), creator: clean(ph?.attribution || obs?.user?.login, 360), license: l, title: clean(taxon, 420), source: "inaturalist.org", rank: oi * 2 + pi });
    }
  }
  return out;
}

function imageText(x: Img) { return fold(`${x.title} ${decodeURIComponent(x.landing || "")}`).replace(/[_]/g, " "); }
function documentLike(x: Img) {
  const h = imageText(x);
  return /\.(pdf|djvu|tif|tiff|svg|gif)(?:$|[?#\s])|annual report|proceedings|conference|government publications|title from cover|cover title|periodicals|ia cat\d|internet archive|book digitized|digitized by|scanned book|bulletin \(|report \(|\bpage \d+\b|\bmap of\b|\blogo\b|\bdiagram\b|\bchart\b|\bgraph\b|\binfographic/.test(h);
}
function offTopic(x: Img) {
  const h = imageText(x);
  return /portrait of|selfie|wedding|museum collection|tropenmuseum|souvenir|church|cathedral|house near|street in|car show|football|concert/.test(h);
}
function relevant(x: Img, subject: Subject | string[]) {
  if (documentLike(x) || offTopic(x)) return false;
  const sub: Subject = Array.isArray(subject) ? { words: subject, res: [] } : subject;
  if (!sub.words.length && !sub.res.length) return false;
  const h = imageText(x);
  return sub.words.some((w) => hasWord(h, w)) || sub.res.some((re) => re.test(h));
}
function score(x: Img, subject: Subject, q: string) {
  const words = subject.words;
  const h = imageText(x);
  const hit = words.reduce((n, w) => n + (hasWord(h, w) ? 1 : 0), 0);
  const qhit = specificTokens(q).reduce((n, t) => n + (hasWord(h, t) ? 1 : 0), 0);
  const src = x.source === "inaturalist.org" ? 26 : 24;
  const rank = Math.max(0, 15 - Number(x.rank || 0) * 0.4);
  const size = (Number(x.width || 0) >= 1000 || Number(x.height || 0) >= 800) ? 4 : 0;
  return src + hit * 12 + qhit * 6 + rank + size;
}

async function search(queries: string[], subject: Subject, organismFirst: boolean) {
  const all: Img[] = [], failures: string[] = []; let okSources = 0;
  for (const q of queries) {
    const calls = organismFirst ? [inat(q), commons(q)] : [commons(q), inat(q)];
    const settled = await Promise.allSettled(calls);
    for (const s of settled) {
      if (s.status === "fulfilled") {
        okSources++;
        all.push(...s.value.filter((x) => relevant(x, subject)).map((x) => ({ ...x, query: q })));
      } else failures.push(clean((s.reason as any)?.message || s.reason, 260));
    }
    if (all.length >= 24) break;
  }
  const seen = new Set<string>(), unique = all.filter((x) => { const k = (x.landing || x.url).toLowerCase(); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  unique.sort((a, b) => score(b, subject, b.query || "") - score(a, subject, a.query || ""));
  return { images: unique, failures: [...new Set(failures)], okSources };
}

async function download(url: string) {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(18000), headers: { "User-Agent": "TarlaPusula-Visual/7.0" } }); if (!r.ok) throw new Error(`Görsel HTTP ${r.status}`);
  const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase(); if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error(`Desteklenmeyen tür ${type || "?"}`);
  const bytes = new Uint8Array(await r.arrayBuffer()); if (!bytes.length || bytes.length > 3 * 1024 * 1024) throw new Error("Görsel 3 MB sınırını aşıyor");
  return { bytes, type, ext: type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg" };
}

// Başka bir içerikte (aday veya yayın) kullanılmış görselleri bul
async function usedElsewhere(db: any, landings: string[], ownerCol: string, id: string) {
  const used = new Set<string>();
  for (let i = 0; i < landings.length; i += 25) {
    const chunk = landings.slice(i, i + 25);
    const q = await db.from("content_images").select("original_url,candidate_id,content_id").in("original_url", chunk).neq("status", "rejected");
    if (q.error) throw q.error;
    for (const r of q.data || []) {
      if (String(r[ownerCol] || "") === id) continue;
      used.add(clean(r.original_url, 1800).toLowerCase());
    }
  }
  return used;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors }); if (req.method !== "POST") return reply({ error: "Sadece POST" }, 405);
  const su = clean(Deno.env.get("SUPABASE_URL"), 500), sk = clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 1400), rid = account(Deno.env.get("R2_ACCOUNT_ID")), ra = clean(Deno.env.get("R2_ACCESS_KEY_ID"), 500), rs = clean(Deno.env.get("R2_SECRET_ACCESS_KEY"), 1400), bucket = clean(Deno.env.get("R2_BUCKET_NAME"), 500);
  if (!su || !sk || !rid || !ra || !rs || !bucket) return reply({ error: "R2/Supabase yapılandırması eksik" }, 500);
  const db = createClient(su, sk, { auth: { persistSession: false } }); if (!(await allowed(req, db))) return reply({ error: "Yetki gerekli" }, 403);
  let id = "", table = "";
  try {
    const body = await req.json().catch(() => ({})), candidateId = clean(body.candidateId, 100), contentId = clean(body.contentId, 100); if (!candidateId && !contentId) return reply({ error: "candidateId/contentId gerekli" }, 400);
    id = candidateId || contentId; table = candidateId ? "content_candidates" : "content_items";
    const fields = candidateId ? "title_suggested,image_search_keyword,suggested_crops,suggested_tags,suggested_category,content_subtype,structured_body,source_refs" : "title,image_search_keyword,crop_tags,tags,category,content_subtype,structured_body,source_refs";
    const qr = await db.from(table).select(fields).eq("id", id).maybeSingle(); if (qr.error) throw qr.error; if (!qr.data) return reply({ error: "İçerik bulunamadı" }, 404);
    const row: any = qr.data, isGuide = clean(row.content_subtype, 80) === "guide" || row?.structured_body?.channel === "guide";
    const terms = topicTerms(row, Boolean(candidateId));
    const queries = queryCandidates(row, body, Boolean(candidateId), terms);
    const subject = subjectFor(terms, queries, clean(body.keyword || row.image_search_keyword, 220), isGuide);
    const words = subject.words;
    const organismFirst = terms.some((t) => t.organism);
    const requested = Number(body.maxImages), target = Math.max(1, Math.min(Number.isFinite(requested) ? requested : (isGuide ? 4 : 1), 6)), required = isGuide ? Math.min(3, target) : 1, ownerCol = candidateId ? "candidate_id" : "content_id";
    const structured = row.structured_body && typeof row.structured_body === "object" ? row.structured_body : {};
    // DB yalnız missing|processing|ready|error|review_needed kabul ediyor; "no_match" görsel detayında tutulur.
    const finish = async (status: string, extra: Record<string, unknown>) => {
      const dbStatus = status === "no_match" ? "review_needed" : status;
      const up = await db.from(table).update({ image_status: dbStatus, image_processing_at: new Date().toISOString(), structured_body: { ...structured, visual_enrichment: { engine: ENGINE, status, required_count: required, target_count: target, queries, subject_words: words.slice(0, 12), updated_at: new Date().toISOString(), ...extra } } }).eq("id", id);
      if (up.error) throw up.error;
    };

    // Mevcut görseller: konu dışı olanları veya başka içerikle paylaşılanları ayıkla
    const exq = await db.from("content_images").select("id,original_url,caption,source_domain,license_type,is_cover,sort_order,status").eq(ownerCol, id).order("sort_order", { ascending: true }); if (exq.error) throw exq.error;
    const previous = Array.isArray(exq.data) ? exq.data.filter((x: any) => x.status !== "rejected" && x.source_domain !== "admin-upload") : [];
    const adminUploads = Array.isArray(exq.data) ? exq.data.filter((x: any) => x.status !== "rejected" && x.source_domain === "admin-upload") : [];
    const sharedPrev = await usedElsewhere(db, previous.map((x: any) => clean(x.original_url, 1800)).filter(Boolean), ownerCol, id);
    const invalid = previous.filter((x: any) => {
      const img: Img = { title: clean(x.caption, 700), landing: clean(x.original_url, 1800), url: "", source: "", creator: "", license: "" };
      return !relevant(img, subject) || sharedPrev.has(clean(x.original_url, 1800).toLowerCase());
    });
    if (invalid.length) {
      const rej = await db.from("content_images").update({ status: "rejected", is_cover: false }).in("id", invalid.map((x: any) => x.id)).eq(ownerCol, id);
      if (rej.error) throw rej.error;
    }
    const invalidIds = new Set(invalid.map((x: any) => x.id));
    const existing = [...adminUploads, ...previous.filter((x: any) => !invalidIds.has(x.id))];
    const keys = new Set(existing.map((x: any) => clean(x.original_url, 1800).toLowerCase()).filter(Boolean));
    let hasCover = existing.some((x: any) => x.is_cover === true);
    if (body.replaceCover === true && hasCover) { await db.from("content_images").update({ is_cover: false }).eq(ownerCol, id).eq("is_cover", true); hasCover = false; }
    const initial = existing.length, slots = Math.max(0, target - initial + (body.replaceCover === true ? 1 : 0));
    if (slots === 0 && hasCover) {
      const status = initial >= required ? "ready" : "review_needed";
      await finish(status, { image_count: initial, cover_count: 1, reused: true, rejected_previous: invalid.length });
      return reply({ ok: true, id, status, imageCount: initial, requiredCount: required, targetCount: target, reused: true, queries, rejectedPrevious: invalid.length });
    }
    if (!queries.length || (!words.length && !subject.res.length)) {
      await finish("no_match", { image_count: initial, reason: "Konuya özel arama terimi çıkarılamadı", rejected_previous: invalid.length });
      return reply({ ok: true, id, status: "no_match", reason: "no_topic_terms", queries, rejectedPrevious: invalid.length });
    }
    await db.from(table).update({ image_status: "processing", image_processing_at: new Date().toISOString() }).eq("id", id);
    const found = await search(queries, subject, organismFirst); if (found.okSources === 0) throw new Error(`Görsel kaynaklarına ulaşılamadı: ${found.failures.join(" | ")}`);
    const used = await usedElsewhere(db, found.images.map((x) => clean(x.landing || x.url, 1800)), ownerCol, id);
    const pool = found.images.filter((x) => !used.has(clean(x.landing || x.url, 1800).toLowerCase()));
    const s3 = new S3Client({ region: "auto", endpoint: `https://${rid}.r2.cloudflarestorage.com`, credentials: { accessKeyId: ra, secretAccessKey: rs } }), owner = candidateId ? `candidate-${candidateId}` : `content-${contentId}`, inserted: any[] = [], errors: string[] = [];
    for (const c of pool) {
      if (inserted.length >= slots) break;
      const dk = clean(c.landing || c.url, 1800).toLowerCase(); if (!dk || keys.has(dk)) continue;
      try {
        const im = await download(c.url), isCover = !hasCover && inserted.every((x) => !x.is_cover), sortOrder = isCover ? 0 : Math.max(1, initial + inserted.length), key = `content-images/library/${owner}/${crypto.randomUUID()}.${im.ext}`;
        await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: im.bytes, ContentType: im.type, CacheControl: "public, max-age=31536000, immutable" }));
        const ins = await db.from("content_images").insert({ candidate_id: candidateId || null, content_id: contentId || null, r2_key: key, public_url: null, original_url: c.landing || c.url, source_domain: c.source, license_type: c.license, credit_text: [c.creator, c.license.toUpperCase(), c.source].filter(Boolean).join(" · ") || c.source, alt_text: clean(candidateId ? row.title_suggested : row.title, 500) || queries[0], caption: c.title || null, image_type: isCover ? "cover" : "gallery", status: contentId ? "approved" : "pending_review", is_cover: isCover, sort_order: sortOrder }).select("id").single();
        if (ins.error || !ins.data) throw ins.error || new Error("Görsel kaydı oluşturulamadı");
        // Paralel işler aynı fotoğrafı aynı anda seçebilir: daha önce kaydeden kazanır, biz geri çekilip sıradakini deneriz
        const race = await db.from("content_images").select("id,created_at,candidate_id,content_id").eq("original_url", c.landing || c.url).neq("status", "rejected");
        const mine = (race.data || []).find((x: any) => x.id === ins.data.id);
        const lost = mine && (race.data || []).some((x: any) => x.id !== ins.data.id && x[ownerCol] !== id && (x.created_at < mine.created_at || (x.created_at === mine.created_at && x.id < mine.id)));
        if (lost) { await db.from("content_images").update({ status: "rejected", is_cover: false }).eq("id", ins.data.id); keys.add(dk); continue; }
        const url = `${su}/functions/v1/content-image-public?id=${encodeURIComponent(ins.data.id)}`;
        await db.from("content_images").update({ public_url: url }).eq("id", ins.data.id);
        if (isCover) { await db.from("content_images").update({ is_cover: false }).eq(ownerCol, id).neq("id", ins.data.id); hasCover = true; }
        keys.add(dk); inserted.push({ id: ins.data.id, url, source: c.source, license: c.license, is_cover: isCover, caption: c.title, bytes: im.bytes.length });
      } catch (e) { errors.push(clean(e instanceof Error ? e.message : e, 260)); }
    }
    // Kapak yoksa mevcut ilk görseli kapak yap
    if (!hasCover && existing.length) {
      await db.from("content_images").update({ is_cover: true, image_type: "cover", sort_order: 0 }).eq("id", existing[0].id);
      hasCover = true;
    }
    const fq = await db.from("content_images").select("id,is_cover,source_domain,license_type,status").eq(ownerCol, id); if (fq.error) throw fq.error;
    const imgs = Array.isArray(fq.data) ? fq.data.filter((x: any) => x.status !== "rejected") : [], count = imgs.length, covers = imgs.filter((x: any) => x.is_cover).length, sources = [...new Set(imgs.map((x: any) => clean(x.source_domain, 120)).filter(Boolean))];
    let status = "review_needed";
    if (covers > 0 && count >= required) status = "ready";
    else if (count === 0 && !pool.length) status = "no_match";
    else if (count === 0 && errors.length) status = "error";
    await finish(status, { image_count: count, cover_count: covers, sources, candidates_found: found.images.length, skipped_used_elsewhere: found.images.length - pool.length, rejected_previous: invalid.length, source_failures: found.failures });
    return reply({ ok: status !== "error", id, status, imageCount: count, coverCount: covers, requiredCount: required, targetCount: target, inserted: inserted.length, queries, subjectWords: words.slice(0, 12), sources, candidatesFound: found.images.length, skippedUsedElsewhere: found.images.length - pool.length, rejectedPrevious: invalid.length, sourceFailures: found.failures, errors: errors.slice(0, 6), images: inserted }, status === "error" ? 500 : 200);
  } catch (e) {
    console.error("[CONTENT_IMAGE_JOB_V7]", e);
    if (id && table) { try { await db.from(table).update({ image_status: "error", image_processing_at: new Date().toISOString() }).eq("id", id); } catch { /* ignore */ } }
    const msg = e instanceof Error ? e.message : (e && typeof e === "object" ? clean((e as any).message || JSON.stringify(e), 600) : String(e));
    return reply({ error: msg }, 500);
  }
});
