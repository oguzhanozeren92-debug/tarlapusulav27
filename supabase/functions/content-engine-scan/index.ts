import { createClient } from "npm:@supabase/supabase-js@2";
import * as cheerio from "npm:cheerio@1.0.0";

const NVIDIA_API_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const PRIMARY_MODEL = "z-ai/glm-5.3-flash";
const FALLBACK_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const SAFE_LICENSES = new Set(["cc0", "cc-by", "cc-by-sa", "public-domain", "public_domain"]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Source = {
  id: string; name: string; base_url: string; source_type: string; language: string;
  country: string | null; trust_score: number; scan_frequency_hours: number;
  last_scanned_at: string | null; metadata: Record<string, any> | null;
};

type Found = {
  title: string; url: string; publishedAt: string | null; summary: string; body: string;
  language: string; imageUrl: string | null; imageLicense: string | null; imageCredit: string | null;
};

type Gate = {
  pass: boolean;
  score: number;
  reasons: string[];
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function clean(value: unknown, max = 2000) {
  return String(value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

function list(value: unknown, max = 10) {
  return Array.isArray(value)
    ? [...new Set(value.map((v) => clean(v, 80)).filter(Boolean))].slice(0, max)
    : [];
}

function score(value: unknown, fallback = 50) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : fallback;
}

function license(value: unknown) {
  return clean(value, 80).toLowerCase().replace(/\s+/g, "-");
}

function abs(value: string, base: string) {
  try { return new URL(value, base).toString(); } catch { return ""; }
}

function date(value: unknown) {
  const t = Date.parse(clean(value, 120));
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

async function hash(value: string) {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function norm(value: unknown) {
  return clean(value, 20000)
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

const HARD_JUNK = [
  /\b(bakan|bakanimiz|bakanlığı|bakanligi|vali|valimiz|milletvekili|başkanımız|baskanimiz)\b/i,
  /\b(ziyaret|ziyaret etti|ziyarette bulundu|kabul etti|bir araya geldi|heyet)\b/i,
  /\b(festival|şenlik|senlik|kutlama|tören|toren|açılış|acilis|etkinlik)\b/i,
  /\b(atama|göreve başladı|goreve basladi|personel|teknik koordinatör|teknik koordinator)\b/i,
  /\b(müdürlüğü|mudurlugu|başkanlığı|baskanligi|hakkımızda|hakkimizda|iletişim|iletisim)\b/i,
  /\b(yaralandı|yaralandilar|hayatını kaybetti|hayatini kaybetti|kaza|yangın işçisi|orman işçisi)\b/i,
  /\b(renkli görüntüler|renkli goruntuler|coşkuyla|coskuyla|protokol)\b/i,
  /\b(ödül töreni|odul toreni|fuar açılışı|fuar acilisi|basın açıklaması|basin aciklamasi)\b/i,
];

const SCIENCE_SIGNALS = [
  /\b(araştırma|arastirma|çalışma|calisma|deneme|bulgu|sonuç|sonuc|analiz|veri|model|tahmin)\b/i,
  /\b(research|study|trial|experiment|finding|result|analysis|data|model|forecast)\b/i,
  /\b(verim|yield|biomass|fenoloji|phenology|çiçeklenme|ciceklenme|flowering|tane dolum|grain filling)\b/i,
  /\b(kuraklık|kuraklik|drought|su stresi|water stress|toprak nemi|soil moisture)\b/i,
  /\b(sulama|irrigation|evapotranspiration|et0|water use efficiency)\b/i,
  /\b(gübre|gubre|fertiliz|azot|nitrogen|fosfor|phosphorus|potasyum|potassium|besin|nutrient)\b/i,
  /\b(hastalık|hastalik|disease|pathogen|fungicide|fungus|mantar|pas hastalığı|septoria)\b/i,
  /\b(zararlı|zararli|pest|insect|böcek|bocek|yabancı ot|yabanci ot|weed)\b/i,
  /\b(ıslah|islah|breeding|genetic|genomic|çeşit|cesit|variety|cultivar|resistance|dayanıkl)\b/i,
  /\b(toprak|soil|salinity|tuzluluk|organic matter|mikrob|microb)\b/i,
  /\b(uydu|satellite|remote sensing|sentinel|earth observation|ndvi|lai)\b/i,
  /\b(don|frost|dolu|hail|sıcaklık stresi|sicaklik stresi|heat stress|iklim|climate)\b/i,
  /\b(rekolte|harvest|quality|kalite|depolama|storage)\b/i,
];

const CROP_SIGNALS = [
  /\b(buğday|bugday|wheat|arpa|barley|mısır|misir|maize|corn|ayçiçeği|aycicegi|sunflower)\b/i,
  /\b(pamuk|cotton|pirinç|pirinc|rice|soya|soybean|kanola|rapeseed|şeker pancarı|sugar beet)\b/i,
  /\b(fındık|findik|hazelnut|zeytin|olive|üzüm|uzum|grape|incir|fig|turunçgil|citrus)\b/i,
  /\b(domates|tomato|patates|potato|nohut|chickpea|mercimek|lentil|fasulye|bean)\b/i,
  /\b(crop|cereal|hububat|bitki|plant|orchard|bahçe|bahce|pasture|mera)\b/i,
  /\b(çeltik|celtik|paddy|kiraz|cherry|badem|almond|antep fıstığı|antep fistigi|pistachio|yer fıstığı|yer fistigi|peanut)\b/i,
  /\b(mandalina|mandarin|narenciye|citrus|elma|apple|armut|pear|şeftali|seftali|peach|kayısı|kayisi|apricot)\b/i,
  /\b(haşhaş|hashas|poppy|korunga|sainfoin|yonca|alfalfa|çay|cay|tea|ceviz|walnut|şeker pancarı|seker pancari|sugar beet)\b/i,
  /\b(meyve|fruit|sebze|vegetable|bakliyat|pulse|mercimek|lentil|nohut|chickpea|fasulye|bean)\b/i,
];

const NEWS_HARD_JUNK = [
  /\b(livestock|cattle|beef|dairy|meat processing|methane|hayvancilik|hayvancılık|besicilik|buyukbas|büyükbaş|kucukbas|küçükbaş|çiğ süt|cig sut|sığır|sigir|kırmızı et|kirmizi et|canlı hayvan|canli hayvan)\b/i,
  /\b(alkollü içecek|alkollu icecek|minimum birim fiyat|viski|whisky|lager|beer price|alcohol price)\b/i,
  /\b(funding|fundraise|raises? \$|venture capital|investable|investor|startup funding|series [a-z]|yatirim turu|yatırım turu|girişim sermayesi)\b/i,
  /\b(podcast|webinar|conference|summit|expo|trade show|festival|fuar|zirve|etkinlik)\b/i,
  /\b(company profile|milling company|food-grade oats|niche in .*milling|processing company)\b/i,
  /\b(whats in your shed|what.s in your shed|disease management)\b/i,
];

const MARKET_SIGNALS = [
  /\b(fiyat|price|piyasa|market|arz|supply|talep|demand|stok|stock|ithalat|import|ihracat|export)\b/i,
  /\b(alım fiyat|alim fiyat|satış fiyat|satis fiyat|taban fiyat|tarla fiyat|ürün fiyat|urun fiyat)\b/i,
  /\b(girdi maliyet|input cost|gubre fiy|gübre fiy|tohum fiy|mazot|uretim maliyet|üretim maliyet)\b/i,
  /\b(rekolte|production forecast|uretim tahmin|üretim tahmin|harvest forecast)\b/i,
];

const PRODUCER_VALUE = [
  /\b(verim|yield|ürün kayb|urun kayb|yield loss|quality|kalite)\b/i,
  /\b(destek|hibe|teşvik|tesvik|subsidy|grant|başvuru|basvuru)\b/i,
  /\b(sulama kanalı|sulama kanali|irrigation canal|water allocation|su tahsisi|baraj doluluk)\b/i,
  /\b(risk|uyarı|uyari|threat|damage|zarar|kayıp|kayip)\b/i,
  /\b(sulama|irrigation|gübre|gubre|fertiliz|ilaçlama|ilaclama|fungicide|pesticide)\b/i,
  /\b(hastalık|hastalik|disease|zararlı|zararli|pest|weed|yabancı ot)\b/i,
  /\b(kuraklık|kuraklik|drought|don|frost|heat|sıcak|sicak|soil moisture|toprak nem)\b/i,
  /\b(çeşit|cesit|variety|breeding|dayanıkl|resistan|management|yönetim|yonetim)\b/i,
  /\b(uygulama|practice|recommend|öner|oner|strategy|strateji|efficiency|verimlilik)\b/i,
];

const NEWS_EVENT_SIGNALS = [
  /\b(başladı|basladi|başlıyor|basliyor|hasat başladı|ekim başladı|sezon başladı)\b/i,
  /\b(açıklandı|aciklandi|duyurdu|duyuruldu|yayımlandı|yayinlandi|karar alındı|karar alindi)\b/i,
  /\b(arttı|artti|artacak|yükseldi|yukseldi|yükselecek|yukselecek|azaldı|azaldi|azalacak|düştü|dustu|geriledi)\b/i,
  /\b(bekleniyor|tahmin ediliyor|öngörülüyor|ongoruluyor|rekolte|üretim tahmini|uretim tahmini)\b/i,
  /\b(uyarı|uyari|alarm|risk|zarar|vur(?:du|du)|don|dolu|kuraklık|kuraklik|salgın|salgin|hastalık görüldü|zararlı görüldü)\b/i,
  /\b(yasak|serbest bırakıldı|serbest birakildi|vergi|gümrük|gumruk|destek|hibe|teşvik|tesvik|ödeme|odeme|ithalat|ihracat|fiyat|başvuru|basvuru|çağrı|cagri)\b/i,
  /\b(sulama kanalı|sulama kanali|su tahsisi|baraj|kuraklık tedbiri|kuraklik tedbiri|proje başladı|proje basladi|çalışma başladı|calisma basladi)\b/i,
  /\b(started|harvest|announced|released|rose|rises|fell|falls|forecast|expected|warning|alert|outbreak|drought|frost|hail|ban|tariff|import|export|price|production)\b/i,
];

const EVERGREEN_NEWS_JUNK = [
  /\b(nedir|nasıl ekilir|nasil ekilir|nasıl yetiştirilir|nasil yetistirilir|nasıl yapılır|nasil yapilir|kaç kilo|kac kilo|hangi gübre|hangi gubre)\b/i,
  /\b(rehber|yetiştiriciliği|yetistiriciligi|ipuçları|ipuclari|temel bilgiler|adım adım|adim adim)\b/i,
  /\b(how to|guide to|what is|tips for|tips on|principles and practices)\b/i,
];

const GENERIC_FINANCE_PR = [
  /\b(ziraat bankası|ziraat bankasi|banka kredisi|kredi desteği|kredi destegi|finansman|yatırım kredisi|yatirim kredisi|tarım yatırımı|tarim yatirimi|gıda yatırımı|gida yatirimi)\b/i,
  /\b(tkdk|ipard|girişimcilik|girisimcilik|girişimci|girisimci|protokol|iş birliği|is birligi|finans paketi|yatırım paketi|yatirim paketi)\b/i,
];

const DIRECT_FIELD_SUPPORT = [
  /\b(dekar|hektar|tohum|sertifikalı tohum|sertifikali tohum|gübre|gubre|mazot|sulama|fidan|fide|sera|bitkisel üretim|bitkisel uretim)\b/i,
  /\b(destekleme ödemesi|destekleme odemesi|prim ödemesi|prim odemesi|ürün primi|urun primi|başvuru son tarihi|basvuru son tarihi|üretici başvurusu|uretici basvurusu)\b/i,
];

function matchesAny(text: string, patterns: RegExp[]) {
  return patterns.some((p) => p.test(text));
}

function countMatches(text: string, patterns: RegExp[]) {
  return patterns.reduce((n, p) => n + (p.test(text) ? 1 : 0), 0);
}

function scientificNewsGate(item: Found, source?: Source): Gate {
  const title = norm(item.title);
  const content = norm(`${item.title} ${item.summary} ${item.body}`);
  const bodyLen = clean(item.body || item.summary, 20000).length;
  const reasons: string[] = [];

  if (matchesAny(title, HARD_JUNK) || matchesAny(content, NEWS_HARD_JUNK)) {
    return { pass: false, score: 0, reasons: ["TarlaPusula üretici gündemi dışında"] };
  }

  if (matchesAny(content, GENERIC_FINANCE_PR) && !matchesAny(content, DIRECT_FIELD_SUPPORT)) {
    return { pass: false, score: 0, reasons: ["Genel kredi/yatırım/kurumsal destek haberi; doğrudan saha kararı değil"] };
  }

  if (!item.publishedAt) {
    return { pass: false, score: 0, reasons: ["Yayın tarihi doğrulanamadı"] };
  }

  const publishedMs = Date.parse(item.publishedAt);
  const ageMs = Date.now() - publishedMs;
  const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
  if (!Number.isFinite(publishedMs) || ageMs > maxAgeMs || ageMs < -12 * 60 * 60 * 1000) {
    return { pass: false, score: 0, reasons: ["Haber güncel değil"] };
  }

  const sourceIsWorld = Boolean(source && source.language !== "tr" && source.country !== "TR");
  const trustedWorld = sourceIsWorld && Number(source?.trust_score || 0) >= 84;

  const science = countMatches(content, SCIENCE_SIGNALS);
  const crops = countMatches(content, CROP_SIGNALS);
  const producer = countMatches(content, PRODUCER_VALUE);
  const market = countMatches(content, MARKET_SIGNALS);
  const event = countMatches(content, NEWS_EVENT_SIGNALS);
  const evergreen = matchesAny(title, EVERGREEN_NEWS_JUNK);

  const aggregatorRss = Boolean(source && source.source_type === "rss");
  const minimumBody = aggregatorRss
    ? 55
    : trustedWorld && (market >= 1 || science >= 1 || producer >= 1)
      ? 45
      : 140;
  if (bodyLen < minimumBody) {
    return { pass: false, score: 0, reasons: ["Yeterli kaynak metni yok"] };
  }

  if (evergreen && event < 1 && market < 1) {
    return { pass: false, score: 0, reasons: ["Bilgi/rehber içeriği; güncel haber değil"] };
  }

  let gateScore =
    event * 18 +
    crops * 15 +
    producer * 14 +
    market * 16 +
    science * 4 +
    8;
  gateScore = Math.min(100, gateScore);

  if (event < 1) reasons.push("Güncel gelişme sinyali zayıf");
  if (crops < 1) reasons.push("Bitkisel üretim/ürün bağı zayıf");
  if (producer < 1 && market < 1) reasons.push("Üretici kararına etkisi belirsiz");

  const sourceTrusted = Number(source?.trust_score || 0) >= 72;
  const decisionValue =
    producer >= 1 ||
    market >= 1 ||
    (trustedWorld && science >= 1) ||
    (aggregatorRss && crops >= 1);
  const scopeMatch = trustedWorld
    ? (crops >= 1 || market >= 1 || science >= 1)
    : (crops >= 1 || market >= 1 || (sourceTrusted && producer >= 1));
  const freshSignal =
    event >= 1 ||
    market >= 1 ||
    (sourceTrusted && producer >= 1) ||
    (trustedWorld && science >= 1);
  const minScore = aggregatorRss ? 22 : trustedWorld ? 40 : 44;
  return {
    pass: freshSignal && scopeMatch && decisionValue && gateScore >= minScore,
    score: gateScore,
    reasons,
  };
}

function articleStructuredData($: cheerio.CheerioAPI) {
  let body = "";
  let publishedAt: string | null = null;

  const visit = (value: any) => {
    if (!value || (body && publishedAt)) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item);
      return;
    }
    if (typeof value !== "object") return;

    const type = Array.isArray(value["@type"]) ? value["@type"].join(" ") : String(value["@type"] ?? "");
    const looksArticle = /Article|NewsArticle|ReportageNewsArticle|BlogPosting/i.test(type);

    if (looksArticle || value.articleBody) {
      if (!body) body = clean(value.articleBody ?? value.description, 14000);
      if (!publishedAt) publishedAt = date(value.datePublished ?? value.dateCreated ?? value.dateModified);
    }

    if (value["@graph"]) visit(value["@graph"]);
  };

  $("script[type='application/ld+json']").each((_, node) => {
    if (body && publishedAt) return false;
    const raw = $(node).html();
    if (!raw) return;
    try {
      visit(JSON.parse(raw));
    } catch {
      // Geçersiz JSON-LD sayfanın kalan HTML ayrıştırmasını engellemez.
    }
  });

  return { body, publishedAt };
}

function bodyText($: cheerio.CheerioAPI) {
  for (const selector of [
    "article",
    "main",
    ".content",
    ".detail",
    ".news-detail",
    ".page-content",
    ".field--name-body",
    ".article-body",
  ]) {
    const node = $(selector).first();
    if (!node.length) continue;
    const clone = node.clone();
    clone.find("script,style,nav,header,footer,aside,form,button,.share,.social,.menu,.breadcrumb").remove();
    const value = clean(clone.text(), 14000);
    if (value.length > 180) return value;
  }
  return "";
}

function imageFrom($: cheerio.CheerioAPI, pageUrl: string) {
  const meta = $("meta[property='og:image']").attr("content") ?? $("meta[name='twitter:image']").attr("content");
  if (meta) return abs(meta, pageUrl);

  const candidates = $("article img, main img, .content img, .field--name-body img").toArray();
  for (const node of candidates) {
    const image = $(node);
    const src = abs(clean(image.attr("src") ?? image.attr("data-src"), 1200), pageUrl);
    const alt = norm(`${image.attr("alt") ?? ""} ${image.attr("title") ?? ""} ${src}`);
    if (!src) continue;
    if (/(logo|icon|avatar|banner|author|profile|social|placeholder)/i.test(alt)) continue;
    return src;
  }
  return null;
}

async function enrich(item: Found) {
  try {
    const res = await fetch(item.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(7000),
      headers: { "User-Agent": "TarlaPusula-ContentEngine/2.0" },
    });
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("html")) return item;
    const $ = cheerio.load(await res.text());
    const structured = articleStructuredData($);
    return {
      ...item,
      url: res.url || item.url,
      publishedAt: item.publishedAt || structured.publishedAt || date(
        $("meta[property='article:published_time']").attr("content") ??
        $("meta[name='date']").attr("content") ??
        $("meta[itemprop='datePublished']").attr("content") ??
        $("time").first().attr("datetime") ??
        $("time,.date,.tarih,.published,.post-date").first().text()
      ),
      body: structured.body || bodyText($) || item.body,
      summary: item.summary || clean(
        $("meta[name='description']").attr("content") ??
        $("meta[property='og:description']").attr("content"),
        1600,
      ),
      imageUrl: item.imageUrl || imageFrom($, item.url),
    };
  } catch {
    return item;
  }
}

function feedText(value: string) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const fragment = cheerio.load(raw);
    return clean(fragment.text(), 2200);
  } catch {
    return clean(raw.replace(/<[^>]+>/g, " "), 2200);
  }
}

function parseFeed(raw: string, source: Source, limit: number): Found[] {
  const $ = cheerio.load(raw, { xmlMode: true });
  const out: Found[] = [];
  $("item,entry").each((_, el) => {
    if (out.length >= limit) return false;
    const n = $(el);
    const rawTitle = clean(n.find("title").first().text(), 700);
    const title = /news\.google\.com/i.test(source.base_url)
      ? clean(rawTitle.replace(/\s+-\s+[^-]{2,100}$/i, ""), 700)
      : rawTitle;
    const linkNode = n.find("link").first();
    const url = abs(clean(linkNode.attr("href") ?? linkNode.text(), 1200), source.base_url);
    if (!title || !url) return;
    const media = clean(n.find("media\\:content,media\\:thumbnail,enclosure").first().attr("url"), 1200);
    out.push({
      title,
      url,
      publishedAt: date(n.find("pubDate,published,updated,date").first().text()),
      summary: feedText(n.find("description,summary,content\\:encoded,content").first().text()),
      body: "",
      language: source.language || "tr",
      imageUrl: media ? abs(media, source.base_url) : null,
      imageLicense: clean(source.metadata?.image_license, 80) || null,
      imageCredit: clean(source.metadata?.image_credit, 180) || null,
    });
  });
  return out;
}

function parseHtml(raw: string, source: Source, limit: number): Found[] {
  const $ = cheerio.load(raw);
  const out: Found[] = [];
  const seen = new Set<string>();
  const meta = source.metadata ?? {};
  const selector = clean(meta.item_selector, 300) ||
    "article a[href], main article a[href], .news a[href], .post a[href], .views-row a[href]";
  let include: RegExp | null = null;
  let exclude: RegExp | null = null;
  try { if (clean(meta.include_pattern, 500)) include = new RegExp(clean(meta.include_pattern, 500), "i"); } catch {}
  try { if (clean(meta.exclude_pattern, 500)) exclude = new RegExp(clean(meta.exclude_pattern, 500), "i"); } catch {}

  $(selector).each((_, el) => {
    if (out.length >= limit) return false;
    const a = $(el);
    const title = clean(a.attr("title") || a.text(), 700);
    const url = abs(clean(a.attr("href"), 1200), source.base_url);
    if (!title || title.length < 18 || !url || seen.has(url)) return;

    try {
      if (new URL(url).hostname.replace(/^www\./, "") !== new URL(source.base_url).hostname.replace(/^www\./, "")) return;
    } catch {
      return;
    }

    const hay = `${title} ${url}`;
    if (include && !include.test(hay)) return;
    if (exclude && exclude.test(hay)) return;
    if (matchesAny(norm(title), HARD_JUNK)) return;

    seen.add(url);
    const box = a.closest("article,li,.item,.row,.news,.post,.views-row,div");
    const img = clean(box.find("img").first().attr("src") ?? box.find("img").first().attr("data-src"), 1200);
    out.push({
      title,
      url,
      publishedAt: date(box.find("time").first().attr("datetime") ?? box.find("time,.date,.tarih").first().text()),
      summary: clean(box.find("p,.summary,.spot,.excerpt").first().text(), 1800),
      body: "",
      language: source.language || "tr",
      imageUrl: img ? abs(img, source.base_url) : null,
      imageLicense: clean(meta.image_license, 80) || null,
      imageCredit: clean(meta.image_credit, 180) || null,
    });
  });
  // Fallback discovery for modern news sites whose cards do not use <article>/.news.
  // It is intentionally topic-gated so navigation, politics, sports and generic links do not enter the queue.
  if (out.length < limit) {
    const navJunk = /(rss|iletisim|iletişim|kunye|künye|uyelik|üyelik|giris|giriş|hava-durumu|trafik|puan-durumu|super-lig|foto-galeri|videolar|yazarlar|hakkimizda|hakkımızda|privacy|cookie|search|arama)/i;

    $("main a[href], body a[href]").each((_, el) => {
      if (out.length >= limit) return false;
      const a = $(el);
      const title = clean(a.attr("title") || a.attr("aria-label") || a.text(), 700);
      const url = abs(clean(a.attr("href"), 1200), source.base_url);
      if (!title || title.length < 24 || !url || seen.has(url)) return;

      try {
        const target = new URL(url);
        const base = new URL(source.base_url);
        if (target.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) return;
        if (navJunk.test(target.pathname)) return;
      } catch {
        return;
      }

      const hay = norm(`${title} ${url}`);
      if (include && !include.test(`${title} ${url}`)) return;
      if (exclude && exclude.test(`${title} ${url}`)) return;
      if (matchesAny(hay, HARD_JUNK) || matchesAny(hay, NEWS_HARD_JUNK)) return;

      const topicRelevant =
        matchesAny(hay, CROP_SIGNALS) ||
        matchesAny(hay, PRODUCER_VALUE) ||
        matchesAny(hay, MARKET_SIGNALS);
      if (!topicRelevant) return;

      seen.add(url);
      const box = a.closest("article,li,.item,.row,.card,.news,.post,.story,.headline,section,div");
      const img = clean(box.find("img").first().attr("src") ?? box.find("img").first().attr("data-src"), 1200);

      out.push({
        title,
        url,
        publishedAt: date(
          box.find("time").first().attr("datetime") ??
          box.find("time,.date,.tarih,.published,.post-date").first().text()
        ),
        summary: clean(box.find("p,.summary,.spot,.excerpt,.description").first().text(), 1800),
        body: "",
        language: source.language || "tr",
        imageUrl: img ? abs(img, source.base_url) : null,
        imageLicense: clean(meta.image_license, 80) || null,
        imageCredit: clean(meta.image_credit, 180) || null,
      });
    });
  }

  return out;
}

async function discover(source: Source, limit: number) {
  if (["api", "image_library"].includes(source.source_type)) return [];
  const res = await fetch(source.base_url, {
    redirect: "follow",
    signal: AbortSignal.timeout(9000),
    headers: {
      "User-Agent": "TarlaPusula-ContentEngine/2.0",
      Accept: "text/html,application/rss+xml,application/atom+xml,application/xml,*/*",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw = await res.text();
  const base = source.source_type === "rss" || /<rss\b|<feed\b/i.test(raw.slice(0, 1000))
    ? parseFeed(raw, source, limit)
    : parseHtml(raw, source, limit);

  const out: Found[] = [];
  for (const item of base.slice(0, limit)) out.push(await enrich(item));
  return out;
}

function parseAi(raw: string) {
  let value = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/, "");
  const a = value.indexOf("{");
  const b = value.lastIndexOf("}");
  if (a >= 0 && b > a) value = value.slice(a, b + 1);
  return JSON.parse(value);
}

function looksTurkish(value: string) {
  const t = norm(value);
  if (!t) return false;
  const trWords = (t.match(/\b(bir|ve|ile|icin|olarak|olan|bu|da|de|uretim|verim|tarim|bitki|toprak|su|hastalik|arastirma|calisma)\b/g) ?? []).length;
  const enWords = (t.match(/\b(the|and|with|for|this|that|research|study|crop|soil|water|wheat|maize|yield)\b/g) ?? []).length;
  return trWords >= 2 && trWords >= enWords;
}

async function invokeNewsModel(model: string, messages: Array<{ role: string; content: string }>, apiKey: string) {
  const requestBody: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.08,
     max_tokens: 1800,
    stream: false,
  };
  if (model.startsWith("nvidia/")) {
    requestBody.chat_template_kwargs = { enable_thinking: false };
  }
  if (model === "z-ai/glm-5.3-flash") {
    requestBody.reasoning_effort = "low";
  }
  if (model === "deepseek-ai/deepseek-v4.1-flash") {
    requestBody.reasoning_effort = "none";
  }

  const res = await fetch(NVIDIA_API_URL, {
    method: "POST",
    signal: AbortSignal.timeout(model === "microsoft/phi-4-mini-instruct" ? 18000 : 30000),
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`${model} HTTP ${res.status}: ${detail.slice(0, 240)}`);
  }

  const provider = await res.json();
  const raw = provider?.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`${model} boş cevap`);
  return raw as string;
}

async function callNewsAi(messages: Array<{ role: string; content: string }>, apiKey: string) {
  try {
    return await invokeNewsModel(PRIMARY_MODEL, messages, apiKey);
  } catch (primaryError) {
    console.warn("[content-engine-scan] primary AI failed:", primaryError);
    return await invokeNewsModel(FALLBACK_MODEL, messages, apiKey);
  }
}

function inferNewsCategory(text: string) {
  const t = norm(text);
  if (/\b(fiyat|piyasa|ithalat|ihracat|arz|talep|stok|rekolte|alım|alim|satış|satis|price|market|import|export)\b/i.test(t)) return "piyasa";
  if (/\b(destek|hibe|ödeme|odeme|teşvik|tesvik|subsidy|grant)\b/i.test(t)) return "destek-mevzuat";
  if (/\b(mevzuat|yönetmelik|yonetmelik|tebliğ|teblig|yasak|izin|karar)\b/i.test(t)) return "destek-mevzuat";
  if (/\b(don|dolu|kurak|sıcak|sicak|iklim|frost|hail|drought|heat)\b/i.test(t)) return "iklim-riski";
  if (/\b(sulama|su durumu|su kıt|su kit|irrigation|water)\b/i.test(t)) return "sulama";
  if (/\b(hastalık|hastalik|zararlı|zararli|yabancı ot|yabanci ot|disease|pest|weed)\b/i.test(t)) return "hastalik-zararli";
  if (/\b(gübre|gubre|azot|fosfor|potasyum|fertiliz|nutrient)\b/i.test(t)) return "bitki-besleme";
  if (/\b(toprak|soil|tuzluluk|salinity)\b/i.test(t)) return "toprak";
  if (/\b(çeşit|cesit|ıslah|islah|tohum|variety|breeding|seed)\b/i.test(t)) return "cesit-islah";
  if (/\b(verim|kalite|hasat|yield|quality|harvest)\b/i.test(t)) return "verim-kalite";
  return "yetistiricilik";
}

function inferNewsCrops(text: string) {
  const t = norm(text);
  const defs: Array<[RegExp,string]> = [
    [/\b(buğday|bugday|wheat)\b/i,"buğday"],
    [/\b(arpa|barley)\b/i,"arpa"],
    [/\b(mısır|misir|maize|corn)\b/i,"mısır"],
    [/\b(ayçiçeği|aycicegi|sunflower)\b/i,"ayçiçeği"],
    [/\b(pamuk|cotton)\b/i,"pamuk"],
    [/\b(çeltik|celtik|pirinç|pirinc|rice|paddy)\b/i,"çeltik"],
    [/\b(soya|soybean)\b/i,"soya"],
    [/\b(kanola|rapeseed)\b/i,"kanola"],
    [/\b(şeker pancarı|seker pancari|pancar|sugar beet)\b/i,"şeker pancarı"],
    [/\b(fındık|findik|hazelnut)\b/i,"fındık"],
    [/\b(antep fıstığı|antep fistigi|pistachio)\b/i,"Antep fıstığı"],
    [/\b(badem|almond)\b/i,"badem"],
    [/\b(zeytin|olive)\b/i,"zeytin"],
    [/\b(üzüm|uzum|grape)\b/i,"üzüm"],
    [/\b(kiraz|cherry)\b/i,"kiraz"],
    [/\b(limon|mandalina|narenciye|citrus)\b/i,"narenciye"],
    [/\b(domates|tomato)\b/i,"domates"],
    [/\b(patates|potato)\b/i,"patates"],
    [/\b(nohut|chickpea)\b/i,"nohut"],
    [/\b(mercimek|lentil)\b/i,"mercimek"],
    [/\b(fasulye|bean)\b/i,"fasulye"],
    [/\b(haşhaş|hashas|poppy)\b/i,"haşhaş"],
    [/\b(korunga|sainfoin)\b/i,"korunga"],
    [/\b(yonca|alfalfa)\b/i,"yonca"]
  ];
  return defs.filter(([re])=>re.test(t)).map(([,name])=>name).slice(0,8);
}

function directTurkishDraft(item: Found, source: Source, gate: Gate) {
  let rawTitle = item.title
    .replace(/\s*(Devamını Oku|Devamını oku)\s*(?:->|→)?\s*.*$/i, "")
    .replace(/\b(son dakika|şok gelişme|dikkat çeken)\b\s*[:!-]?\s*/gi, "")
    .replace(/\s*!+\s*/g, ": ")
    .replace(/\s{2,}/g, " ")
    .replace(/:\s*:/g, ":")
    .trim();
  const title = clean(rawTitle, 700);
  const body = clean(item.body || item.summary, 18000);
  const sourceSummary = clean(item.summary, 1800);
  let summary = sourceSummary;
  if (summary.length < 100) {
    const sentences = body.split(/(?<=[.!?])\s+/).filter(Boolean).slice(0,3).join(" ");
    summary = clean(sentences || body.slice(0,900), 1800);
  }
  const context = `${title} ${summary}`;
  return {
    accept: true,
    rejectReason: "",
    type: "news",
    target: null,
    title,
    summary,
    body,
    category: inferNewsCategory(context),
    tags: [],
    crops: inferNewsCrops(context),
    relevance: Math.max(65, Math.min(100, gate.score + 8)),
    novelty: 75,
    imageQueryTr: title,
    imageQueryEn: "",
    copyright: SAFE_LICENSES.has(license(source.metadata?.content_license)) ? "safe" : "review",
  };
}

async function synthesize(item: Found, source: Source, apiKey: string, knowledge: any[], feedback: any[], gate: Gate) {
  const preferred = feedback
    .filter((x) => x.admin_score === 5)
    .slice(0, 10)
    .map((x) => ({ title: x.title_suggested, type: x.candidate_type, category: x.suggested_category, tags: x.suggested_tags ?? [] }));
  const disliked = feedback
    .filter((x) => Number(x.admin_score) <= 2)
    .slice(0, 8)
    .map((x) => x.title_suggested);
  const existing = knowledge
    .slice(0, 70)
    .map((x) => ({ id: x.id, title: x.title, tags: x.tags ?? [], crops: x.crop_tags ?? [] }));

  const prompt = `Sen TarlaPusula'nın üretici odaklı tarım haber editörüsün.
Bu motor genel haber portalı DEĞİLDİR. HABER demek son 7 gündeki gerçek bir gelişme/olay/değişim demektir. Nasıl yapılır, nedir, rehber, yetiştiricilik anlatımı gibi zamansız bilgi içeriklerini haber diye kabul etme. Bakan, ziyaret, protokol, festival, tören, personel, kaza, magazin, kurum PR'ı ve insan hikâyesi istemiyoruz.
ÖNCELİK bitkisel üreticinin bugün kararını etkileyen GELİŞMELERDİR: hasat/ekim başlangıcı, ürün fiyatı, rekolte ve üretim tahmini, ithalat-ihracat, girdi maliyeti, don-dolu-kuraklık, hastalık/zararlı alarmı, sulama-su durumu, gübre/ilaç erişimi, destek/mevzuat değişikliği ve yeni saha bulgusu.
Hayvancılık, et-süt, şirket finansmanı/yatırım turu, startup haberi, yatırımcı içeriği, şirket profili, genel gıda sanayisi ve üreticiye doğrudan etkisi olmayan iş dünyası haberlerini REDDET.
Yabancı bir gelişme Türkiye üreticisi için anlamlı değilse yalnız tarımla ilgili olduğu için kabul etme. Ancak küresel tahıl/yağlı tohum fiyatı, üretim, rekolte, ithalat-ihracat, kuraklık, don, ürün hastalığı, gübre maliyeti ve arz-talep gelişmeleri Türkiye üreticisini dolaylı etkileyebileceği için kabul edilebilir. Yabancı ülkeye özgü marka/ruhsatlı ilaç uygulaması, yerel mevzuat veya sadece o bölgedeki üreticiye yarayan operasyonel tavsiye Türkiye için aktarılabilir güçlü bir bulgu taşımıyorsa REDDET.
Kaynak metni kısa ise sadece kaynakta açıkça bulunan bilgileri kullan; boşlukları tahminle doldurma. Kısa haber kısa kalabilir.

Yabancı içerikse başlık, özet ve gövdenin TAMAMI doğal, düzgün ve anlaşılır TÜRKÇE olmalı.
Başlıkta, özette veya gövdede İngilizce cümle/paragraf bırakma. Kaynak adı, kurum adı, ürün/çeşit özel adı ve zorunlu teknik kısaltmalar dışında yabancı dil metin bırakmak YASAK.
Kelime kelime çeviri yapma; anlamı koruyup Türkiye'deki üreticinin anlayacağı sade Türkçeye aktar.
Kaynakta olmayan sayı, sonuç, doz, tavsiye, neden veya teşhis UYDURMA.
Haber başlığı clickbait olmasın; araştırmanın gerçek bulgusunu söylesin.
short_summary_tr 2-4 cümle olsun: ne bulundu + hangi koşul/ürün + üretici için anlamı.
body_tr kaynak yeterliyse ayrıntılı ama sade olsun.
relevance_score kaynak güveni değildir. Yalnız ÜRETİCİ KARAR DEĞERİNİ puanla:
90-100 doğrudan saha kararı/değerli yeni bulgu,
70-89 güçlü pratik bilimsel değer,
50-69 dolaylı/niş değer,
0-49 TarlaPusula gündemine uygun değil.
category mümkünse şu eksenlerden biri: iklim-riski, sulama, toprak, bitki-besleme, hastalik-zararli, cesit-islah, verim-kalite, hassas-tarim, yetistiricilik.
SADECE JSON:
{"accept":true,"reject_reason":"","candidate_type":"news","title_tr":"","short_summary_tr":"","body_tr":"","category":"","tags":[],"crops":[],"relevance_score":0,"novelty_score":0,"image_query_tr":"","image_query_en":"","copyright_status":"safe|review|blocked"}`;

  const payload = {
    source: {
      name: source.name,
      url: item.url,
      language: item.language,
      trust_score: source.trust_score,
      content_license: source.metadata?.content_license ?? null,
    },
    scientific_gate: gate,
    article: {
      title: item.title,
      published_at: item.publishedAt,
      summary: item.summary,
      body: item.body.slice(0, 12000),
    },
    // Haber çevirisinde eski içerik kataloğunu modele taşımıyoruz.
    // Bu, yabancı kaynaklarda timeout riskini ciddi biçimde düşürür.
    existing_knowledge: [],
    admin_preferences_5_of_5: preferred.slice(0, 3),
    admin_disliked_1_2: disliked.slice(0, 3),
  };

  const raw = await callNewsAi([
    { role: "system", content: prompt },
    { role: "user", content: JSON.stringify(payload) },
  ], apiKey);

  const p = parseAi(raw);
  const cp = ["safe", "review", "blocked"].includes(p.copyright_status)
    ? p.copyright_status
    : "review";

  const title = clean(p.title_tr, 700);
  const summary = clean(p.short_summary_tr, 1800);
  const body = String(p.body_tr ?? "").trim().slice(0, 18000);
  const relevance = Math.min(score(p.relevance_score, gate.score), gate.score + 15);

  return {
    accept: p.accept !== false && relevance >= 65,
    rejectReason: clean(p.reject_reason, 400),
    type: "news",
    target: null,
    title,
    summary,
    body,
    category: clean(p.category, 100) || "genel",
    tags: list(p.tags, 12),
    crops: list(p.crops, 8),
    relevance,
    novelty: score(p.novelty_score, 70),
    imageQueryTr: clean(p.image_query_tr, 240),
    imageQueryEn: clean(p.image_query_en, 240),
    copyright: SAFE_LICENSES.has(license(source.metadata?.content_license))
      ? (cp === "blocked" ? "blocked" : "safe")
      : cp,
  };
}

async function authorized(req: Request, admin: any) {
  const cron = req.headers.get("x-cron-token")?.trim() ?? "";
  if (cron) {
    const c = await admin.rpc("content_engine_check_cron_token", { p_token: cron });
    if (!c.error && c.data === true) return "cron";
  }

  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return "";
  const auth = await admin.auth.getUser(token);
  if (auth.error || !auth.data.user) return "";
  const m = await admin.from("admin_users").select("user_id").eq("user_id", auth.data.user.id).maybeSingle();
  return m.data ? "admin" : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Sadece POST." }, 405);

  const url = Deno.env.get("SUPABASE_URL") ?? "";
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const aiKey = Deno.env.get("NVIDIA_API_KEY") ?? "";
  if (!url || !service) return json({ error: "Sunucu yapılandırması eksik." }, 500);

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const mode = await authorized(req, admin);
  if (!mode) return json({ error: "Admin veya cron yetkisi gerekli." }, 403);

  try {
    const request = await req.json().catch(() => ({}));
    const maxSources = Math.min(Math.max(Number(request.maxSources) || 4, 1), 6);
    const maxItems = Math.min(Math.max(Number(request.maxItemsPerSource) || 8, 1), 12);

    let q = admin.from("content_sources").select("*")
      .eq("active", true)
      .neq("source_type", "image_library")
      .contains("metadata", { channel: "news" })
      .limit(20);

    if (request.sourceId) q = q.eq("id", clean(request.sourceId, 100));

    const src = await q;
    if (src.error) throw src.error;
    const sourcePriority = (source: Source) => {
      const meta = source.metadata ?? {};
      return (
        (source.language === "tr" ? 300 : 0) +
        (source.country === "TR" ? 180 : 0) +
        (meta.producer_focus === true ? 120 : 0) +
        (meta.priority === "high" ? 80 : meta.priority === "normal" ? 30 : 0) +
        Number(source.trust_score || 0)
      );
    };
    const allSources = (src.data as Source[]).sort((a, b) => sourcePriority(b) - sourcePriority(a));
    const sources = request.sourceId
      ? allSources.slice(0, maxSources)
      : (() => {
          const turkish = allSources.filter((source) => source.language === "tr" || source.country === "TR");
          const world = allSources.filter((source) => source.language !== "tr" && source.country !== "TR");
          const turkishSlots = Math.ceil(maxSources / 2);
          const worldSlots = Math.floor(maxSources / 2);
          const balanced = [
            ...turkish.slice(0, turkishSlots),
            ...world.slice(0, worldSlots),
          ];
          if (balanced.length < maxSources) {
            for (const source of allSources) {
              if (balanced.some((item) => item.id === source.id)) continue;
              balanced.push(source);
              if (balanced.length >= maxSources) break;
            }
          }
          return balanced;
        })();

    const knowledge = (
      await admin.from("content_items")
        .select("id,title,tags,crop_tags")
        .eq("content_type", "knowledge")
        .in("status", ["approved", "published"])
        .order("updated_at", { ascending: false })
        .limit(100)
    ).data ?? [];

    const feedback = (
      await admin.from("content_candidates")
        .select("title_suggested,candidate_type,suggested_category,suggested_tags,admin_score")
        .not("admin_score", "is", null)
        .order("reviewed_at", { ascending: false })
        .limit(40)
    ).data ?? [];

    let created = 0;
    let found = 0;
    let fresh = 0;
    let duplicates = 0;
    let gateRejected = 0;
    let aiRejected = 0;
    let translationRejected = 0;
    let aiErrors = 0;
    const report: any[] = [];

    for (const source of sources) {
      const r: any = {
        source: source.name,
        found: 0,
        new: 0,
        candidates: 0,
        duplicates: 0,
        gateRejected: 0,
        aiRejected: 0,
        translationRejected: 0,
        aiErrors: 0,
        lastAiError: "",
        rejectedExamples: [],
      };

      try {
        const sourceIsTurkishForScan = source.language === "tr" || source.country === "TR";
        const sourceItemLimit = sourceIsTurkishForScan ? maxItems : Math.min(maxItems, 8);
        const items = await discover(source, sourceItemLimit);
        r.found = items.length;
        found += items.length;

        for (const item of items) {
          const gate = scientificNewsGate(item, source);
          if (!gate.pass) {
            gateRejected++;
            r.gateRejected++;
            if (r.rejectedExamples.length < 4) {
              r.rejectedExamples.push({
                title: item.title,
                publishedAt: item.publishedAt,
                reasons: gate.reasons,
              });
            }
            continue;
          }

          const fingerprint = await hash(`${source.id}|${item.url}|${item.title}`);
          const saved = await admin.from("content_source_items").upsert({
            source_id: source.id,
            external_id: item.url,
            url: item.url,
            title: item.title,
            published_at: item.publishedAt,
            detected_language: item.language,
            raw_summary: item.summary || item.body.slice(0, 2000) || null,
            fingerprint,
            raw_metadata: {
              image_url: item.imageUrl,
              image_license: item.imageLicense,
              image_credit: item.imageCredit,
              scientific_gate_score: gate.score,
            },
            last_seen_at: new Date().toISOString(),
          }, { onConflict: "source_id,fingerprint" }).select("id").single();

          if (saved.error || !saved.data) throw saved.error;

          const exists = await admin.from("content_candidates")
            .select("id")
            .eq("source_item_id", saved.data.id)
            .maybeSingle();

          if (exists.data) {
            duplicates++;
            r.duplicates++;
            continue;
          }

          fresh++;
          r.new++;

          const sourceIsTurkish =
            String(item.language || source.language || "").toLowerCase().startsWith("tr") ||
            source.country === "TR";

          // Türkçe kaynaklarda haber adayı AI servisine bağlı değildir.
          // Yabancı içerikte ise tam Türkçe çeviri için AI zorunludur.
          if (!sourceIsTurkish && !aiKey) {
            aiErrors++;
            r.aiErrors++;
            continue;
          }

          let draft: any;
          if (sourceIsTurkish) {
            draft = directTurkishDraft(item, source, gate);
          } else {
            try {
              draft = await synthesize(item, source, aiKey, knowledge, feedback, gate);
            } catch (error) {
              aiErrors++;
              r.aiErrors++;
              r.lastAiError = error instanceof Error ? error.message : String(error);
              console.error("[content-engine-scan] AI edit failed", source.name, item.url, r.lastAiError);
              continue;
            }
          }

          if (!draft.accept || draft.copyright === "blocked" || draft.relevance < 65) {
            aiRejected++;
            r.aiRejected++;
            continue;
          }

          const minimumDraftBody = source.source_type === "rss" ? 70 : sourceIsTurkish ? 140 : 100;
          if (!draft.title || !draft.summary || !draft.body || draft.body.length < minimumDraftBody) {
            aiRejected++;
            r.aiRejected++;
            continue;
          }

          if (
            !sourceIsTurkish &&
            (
              !looksTurkish(draft.title) ||
              !looksTurkish(draft.summary) ||
              !looksTurkish(clean(draft.body, 5000))
            )
          ) {
            translationRejected++;
            r.translationRejected++;
            continue;
          }

          // Kaynak fotoğrafı yalnız lisans bilgisi güvenliyse otomatik hazır sayılır.
          const sourceImageLicense = license(item.imageLicense);
          const sourceImageSafe = Boolean(item.imageUrl && SAFE_LICENSES.has(sourceImageLicense));

          const candidate = await admin.from("content_candidates").insert({
            source_item_id: saved.data.id,
            candidate_type: "news",
            content_subtype: "general",
            target_content_id: null,
            title_suggested: draft.title,
            short_summary: draft.summary,
            body_draft: draft.body,
            structured_body: {
              discovery_engine: "news-v19-field-value-tr",
              editorial_mode: "producer_first_agriculture",
              source_language: item.language,
              translation_status: item.language === "tr" ? "not_required" : "translated_full_tr",
              translation_policy: item.language === "tr" ? "source_tr" : "title_summary_body_required_tr",
              scientific_gate_score: gate.score,
              scientific_gate_reasons: gate.reasons,
              source_title: item.title,
              source_summary: item.summary || null,
              image_query_tr: draft.imageQueryTr || null,
              image_query_en: draft.imageQueryEn || null,
              source_image_url: item.imageUrl || null,
              source_image_license: item.imageLicense || null,
              image_policy: sourceImageSafe
                ? "source_image_license_safe"
                : "topic_image_required_or_manual_review",
            },
            source_refs: [{
              source_id: source.id,
              source_name: source.name,
              title: item.title,
              url: item.url,
              published_at: item.publishedAt,
              language: item.language,
            }],
            suggested_category: draft.category,
            suggested_tags: draft.tags,
            suggested_crops: draft.crops,
            original_language: item.language,
            relevance_score: draft.relevance,
            trust_score: score(source.trust_score, 70),
            novelty_score: draft.novelty,
            copyright_status: draft.copyright,
            workflow_status: "pending",
            coverage_scope: String(source.metadata?.coverage_scope || "") === "turkey" ? "turkey" : "world",
            image_status: sourceImageSafe ? "ready" : "missing",
            payload_status: "ready",
            generated_at: new Date().toISOString(),
          }).select("id").single();

          if (candidate.error || !candidate.data) throw candidate.error;

          // Alakasız veya lisansı belirsiz kaynak görselini otomatik karta bağlama.
          if (sourceImageSafe && item.imageUrl) {
            let domain = "";
            try { domain = new URL(item.imageUrl).hostname; } catch {}
            await admin.from("content_images").insert({
              candidate_id: candidate.data.id,
              original_url: item.imageUrl,
              source_domain: domain || null,
              license_type: sourceImageLicense,
              credit_text: item.imageCredit,
              alt_text: draft.title,
              image_type: "cover",
              status: "pending_review",
              is_cover: true,
            });
          }

          created++;
          r.candidates++;
        }

        await admin.from("content_sources").update({
          last_scanned_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...(source.metadata || {}),
            channel: "news",
            editorial_mode: "producer_first_agriculture",
            last_news_found: r.found,
            last_news_new: r.new,
            last_news_candidates: r.candidates,
            last_news_gate_rejected: r.gateRejected,
            last_news_ai_rejected: r.aiRejected,
            last_news_translation_rejected: r.translationRejected,
            last_news_ai_errors: r.aiErrors,
            news_engine: "news-v19-field-value-tr",
          },
        }).eq("id", source.id);
      } catch (error) {
        r.error = error instanceof Error ? error.message : String(error);
      }

      report.push(r);
    }

    return json({
      ok: true,
      engine: "news-v19-field-value-tr",
      editorialMode: "producer_first_agriculture",
      mode,
      sourcesChecked: sources.length,
      found,
      newItems: fresh,
      candidatesCreated: created,
      duplicates,
      gateRejected,
      aiRejected,
      translationRejected,
      aiErrors,
      report,
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Tarama başarısız." }, 500);
  }
});
