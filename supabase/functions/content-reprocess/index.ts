import { createClient } from "npm:@supabase/supabase-js@2";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.883.0";
import * as cheerio from "npm:cheerio@1.0.0";

const AI_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const PRIMARY_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const FALLBACK_MODEL = "z-ai/glm-5.3-flash";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token, x-tp-maintenance",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const out = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const clean = (v: unknown, n = 2000) => String(v ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const arr = (v: unknown, n = 12) => Array.isArray(v) ? [...new Set(v.map(x => clean(x, 500)).filter(Boolean))].slice(0, n) : [];
const date = (v: unknown) => { const t = Date.parse(clean(v, 120)); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const account = (v: unknown) => clean(v, 300).replace(/^https?:\/\//i, "").replace(/\.r2\.cloudflarestorage\.com.*$/i, "").replace(/\/.*$/, "");
const lic = (v: unknown) => clean(v, 80).toLowerCase().replace(/^cc-/, "");
const SAFE = new Set(["cc0", "pdm", "by", "by-sa", "cc-by", "cc-by-sa", "public-domain"]);
const PRACTICAL_LINK = /(symptom|sign|monitor|scout|management|control|prevent|threshold|timing|treatment|application|checklist|sampling|disease|pest|mite|aphid|rot|blight|rust|mildew|harvest|postharvest|dormancy|bloom|fruit development|irrig|fertili|nutrient|soil|weed|belirti|izle|mücadele|kontrol|eşik|zamanlama|uygulama|örnek|hastalık|zararlı|hasat|sulama|gübre|toprak)/i;
const SKIP = /\.(jpg|jpeg|png|gif|svg|webp|pdf|zip|docx?|xlsx?|pptx?|mp4|mp3)(\?|$)/i;

function jsonFrom(raw: string) {
  let v = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  const a = v.indexOf("{"), b = v.lastIndexOf("}");
  if (a >= 0 && b > a) v = v.slice(a, b + 1);
  return JSON.parse(v);
}

async function auth(req: Request, db: any) {
  const c = req.headers.get("x-cron-token")?.trim() || "";
  if (c) {
    const r = await db.rpc("content_engine_check_cron_token", { p_token: c });
    if (!r.error && r.data === true) return true;
  }
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!t) return false;
  const u = await db.auth.getUser(t);
  if (u.error || !u.data.user) return false;
  const a = await db.from("admin_users").select("user_id").eq("user_id", u.data.user.id).maybeSingle();
  return Boolean(a.data);
}

function sameHost(a: string, b: string) {
  try { return new URL(a).hostname.replace(/^www\./, "") === new URL(b).hostname.replace(/^www\./, ""); } catch { return false; }
}
function abs(base: string, href: string) {
  try { const u = new URL(href, base); u.hash = ""; return u.toString(); } catch { return ""; }
}

async function fetchHtml(url: string, timeout = 14000) {
  const r = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeout),
    headers: { "User-Agent": "TarlaPusula-Editorial/3.0", Accept: "text/html,application/xhtml+xml" },
  });
  if (!r.ok) return "";
  const ct = r.headers.get("content-type") || "";
  if (!ct.includes("html") && !ct.includes("text")) return "";
  return (await r.text()).slice(0, 1_800_000);
}

function extractReadable(html: string, max = 18000) {
  if (!html) return "";
  const $ = cheerio.load(html);
  $("script,style,nav,header,footer,aside,form,button,svg,noscript,.share,.social,.cookie,.breadcrumbs").remove();
  let root = $("article").first();
  if (!root.length) root = $("main").first();
  if (!root.length) root = $(".article-content,.content,.detail,.news-detail").first();
  if (!root.length) root = $("body").first();
  const parts: string[] = [];
  root.find("h1,h2,h3,p,li,table tr").each((_, el) => {
    const t = clean($(el).text(), 2400);
    if (t.length >= 24) parts.push(t);
  });
  return clean([...new Set(parts)].join("\n"), max);
}

async function pageText(url: string) {
  if (!url) return "";
  try { return extractReadable(await fetchHtml(url), 18000); } catch { return ""; }
}

type GuideBundle = { text: string; pages: Array<{ title: string; url: string; score: number }> };

async function guidePageText(url: string): Promise<GuideBundle> {
  if (!url) return { text: "", pages: [] };
  try {
    const rootHtml = await fetchHtml(url);
    if (!rootHtml) return { text: "", pages: [] };
    const $ = cheerio.load(rootHtml);
    const rootTitle = clean($("h1").first().text() || $("title").text(), 300);
    const rootText = extractReadable(rootHtml, 12000);
    const candidates = new Map<string, { title: string; score: number }>();

    $("main a[href], article a[href], body a[href]").each((_, el) => {
      const a = $(el);
      const href = abs(url, a.attr("href") || "");
      const title = clean(a.text(), 260);
      if (!href || href === url || !sameHost(url, href) || SKIP.test(href)) return;
      const hay = `${title} ${href}`;
      if (!PRACTICAL_LINK.test(hay)) return;
      let score = 2;
      if (/symptom|monitor|management|control|threshold|timing|checklist|sampling|belirti|izle|mücadele|eşik/i.test(hay)) score += 6;
      if (/dormancy|bloom|fruit development|harvest|postharvest|disease|pest|mite|rot|blight|rust|mildew|weed|irrig|fertili|soil/i.test(hay)) score += 4;
      const depth = new URL(href).pathname.split("/").filter(Boolean).length;
      if (depth >= 3) score += 3;
      const prev = candidates.get(href);
      if (!prev || score > prev.score) candidates.set(href, { title, score });
    });

    const picked = [...candidates.entries()]
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, 6);

    const pages: Array<{ title: string; url: string; score: number }> = [];
    const chunks = [`[ANA SAYFA: ${rootTitle || url}]\n${rootText}`];
    for (const [childUrl, meta] of picked) {
      try {
        const html = await fetchHtml(childUrl, 12000);
        const text = extractReadable(html, 8500);
        if (text.split(/\s+/).length < 90) continue;
        pages.push({ title: meta.title || childUrl, url: childUrl, score: meta.score });
        chunks.push(`[ALT TEKNİK SAYFA: ${meta.title || childUrl}]\n${text}`);
      } catch { }
      if (chunks.join("\n\n").length > 36000) break;
    }

    return { text: chunks.join("\n\n").slice(0, 36000), pages };
  } catch {
    return { text: await pageText(url), pages: [] };
  }
}

function chart(v: any) {
  if (!v || typeof v !== "object") return null;
  const labels = arr(v.labels, 12), values = Array.isArray(v.values) ? v.values.map(Number).slice(0, 12) : [];
  return labels.length === values.length && labels.length && values.every(Number.isFinite)
    ? { title: clean(v.title, 180) || "Kaynak verisi", type: v.type === "line" ? "line" : "bar", labels, values, unit: clean(v.unit, 50) || null }
    : null;
}
function table(v: any) {
  if (!v || typeof v !== "object") return null;
  const columns = arr(v.columns, 8);
  if (!columns.length || !Array.isArray(v.rows)) return null;
  const rows = v.rows.slice(0, 20).map((r: any) => Array.isArray(r) ? r.slice(0, columns.length).map((x: any) => typeof x === "number" ? x : clean(x, 160)) : []).filter((r: any[]) => r.length === columns.length);
  return rows.length ? { title: clean(v.title, 180) || null, columns, rows } : null;
}

function guideLanguageLooksTurkish(value: unknown) {
  const t = clean(value, 20000).toLocaleLowerCase("tr-TR");
  if (!t) return false;
  if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(t)) return false;

  const trWords = (t.match(/\b(bir|ve|ile|için|icin|olarak|olan|bu|şu|su|de|da|bitki|tarla|bahçe|bahce|ürün|urun|toprak|su|verim|kontrol|uygulama|yönetim|yonetim|hastalık|hastalik|zararlı|zararli|önleme|onleme|gözlem|gozlem|gerekiyorsa|kaçın|kacin)\b/g) ?? []).length;
  const enWords = (t.match(/\b(the|and|with|for|this|that|should|when|where|management|disease|crop|field|soil|water|application|treatment|monitoring|avoid|check|grower|orchard)\b/g) ?? []).length;
  const trCharBonus = /[çğıöşü]/.test(t) ? 2 : 0;

  return trWords + trCharBonus >= 3 && !(enWords >= 4 && enWords > trWords);
}

function guideHasUntranslatedEnglish(value: unknown) {
  const t = clean(value, 24000).toLocaleLowerCase("en-US");
  return /\b(orchard|spur|shoot|strike|hull|navel orangeworm|mating disruption|cover crop|broad[- ]spectrum|growth regulator|acaricide|insecticide|fungicide|pesticid|spray|predators?|overwintering|inoculum|growers?|fruit development|postharvest|twig|pest management guidelines?|field scouting|drip irrigation|tree row|weed|canopy|mummy nuts?|hullsplit|pheromone traps?|egg traps?|mounds?|brush[- ]mite|side[- ]dress|tasting room|break[- ]even|variedad|esp[eè]ces)\b/i.test(t);
}

function normalizeGuideTurkishTerms(value: unknown): unknown {
  if (typeof value === "string") {
    let t = value;
    const replacements: Array<[RegExp, string]> = [
      [/\bnavel orangeworm\b/gi, "Amyelois transitella zararlısı"],
      [/\bpeach twig borer\b/gi, "Anarsia lineatella zararlısı"],
      [/\bpest management guidelines?\b/gi, "zararlı yönetimi rehberi"],
      [/\bmating disruption\b/gi, "çiftleşmeyi engelleme"],
      [/\bcover crop\b/gi, "örtü bitkisi"],
      [/\bbroad[- ]spectrum\b/gi, "geniş etkili"],
      [/\bgrowth regulator\b/gi, "büyüme düzenleyici"],
      [/\bfruit development\b/gi, "meyve gelişimi"],
      [/\bfield scouting\b/gi, "saha gözlemi"],
      [/\bdrip irrigation\b/gi, "damla sulama"],
      [/\btree row\b/gi, "ağaç sırası"],
      [/\bmummy nuts?\b/gi, "ağaçta kalmış kurumuş meyveler"],
      [/\bpheromone traps?\b/gi, "feromon tuzakları"],
      [/\begg traps?\b/gi, "yumurta tuzakları"],
      [/\bshoot strike\b/gi, "sürgün zararı"],
      [/\bhull[ -]?split\b/gi, "kabuk yarılması"],
      [/\bhull rot\b/gi, "kabuk çürüklüğü"],
      [/\bpost[- ]harvest\b/gi, "hasat sonrası"],
      [/\bside[- ]dress\b/gi, "sıra yanı gübreleme"],
      [/\bbreak[- ]even\b/gi, "başabaş noktası"],
      [/\borchard\b/gi, "bahçe"],
      [/\bspur\b/gi, "kısa meyve dalı"],
      [/\bshoot\b/gi, "sürgün"],
      [/\btwig\b/gi, "ince dal"],
      [/\bhull\b/gi, "kabuk"],
      [/\binoculum\b/gi, "hastalık etmeni kaynağı"],
      [/\boverwintering\b/gi, "kışı geçirme"],
      [/\bgrowers?\b/gi, "üretici"],
      [/\bcanopy\b/gi, "ağaç tacı"],
      [/\bweed\b/gi, "yabancı ot"],
      [/\bspray\b/gi, "ilaçlama"],
      [/\bpredators?\b/gi, "avcı doğal düşman"],
      [/\bacaricide\b/gi, "akarisit"],
      [/\binsecticide\b/gi, "insektisit"],
      [/\bfungicide\b/gi, "fungisit"],
      [/\bpesticides?\b/gi, "pestisit"],
      [/\bpesticid\b/gi, "pestisit"],
    ];
    for (const [pattern, replacement] of replacements) {
      t = t.replace(pattern, replacement);
    }
    return t.replace(/\s+/g, " ").trim();
  }

  if (Array.isArray(value)) {
    return value.map((item) => normalizeGuideTurkishTerms(item));
  }

  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = key === "image_search_keyword"
        ? item
        : normalizeGuideTurkishTerms(item);
    }
    return out;
  }

  return value;
}


function titleHasUntranslatedEnglish(value: unknown) {
  const t = clean(value, 1200).toLocaleLowerCase("en-US");
  const hits = (t.match(/\b(the|and|with|for|from|in|on|of|to|improves?|yield|fruit|quality|post[- ]harvest|storage|sweet|cherry|subjected|late[- ]deficit|irrigation|effects?|evaluation|assessment|response|role|management|performance|study|analysis|review|under|using|based|influence|impact)\b/g) ?? []).length;
  return hits >= 3;
}

function generalHasUntranslatedEnglish(value: unknown) {
  const t = clean(value, 26000).toLocaleLowerCase("en-US");
  return /\b(late[- ]deficit irrigation|deficit irrigation|post[- ]harvest storage|sweet cherry|fruit quality|yield improvement|crop yield|field trial|treatment|storage performance|water stress|heat stress|nutrient management|soil moisture|disease management|pest management)\b/i.test(t);
}

function foreignGuideLooksPrescriptive(value: unknown) {
  const t = clean(value, 24000).toLocaleLowerCase("tr-TR");
  const chemistry = /(chlorothalonil|insect growth regulator|pestisit|insektisit|fungisit|akarisit|herbisit|aktif madde|ticari ürün|ticari urun)/i.test(t);
  const threshold = /%\s?\d{1,3}|\d+(?:[.,]\d+)?\s?(?:ml|cc|g|kg)\s*\/?\s*(?:l|da|ha|dekar|hektar)/i.test(t);
  const imperative = /(uygula|uygulanır|uygulanir|ilaçla|ilacla|püskürt|puskurt|tedavi et)/i.test(t);
  return chemistry && (threshold || imperative);
}

function guideObj(v: any) {
  const g = v && typeof v === "object" ? v : {};
  const score = Math.max(0, Math.min(100, Number(g.producer_value_score) || 0));
  return {
    quick_answer: clean(g.quick_answer, 900),
    problem_or_goal: clean(g.problem_or_goal, 900),
    why_it_matters: clean(g.why_it_matters, 1200),
    when_to_check: arr(g.when_to_check, 8),
    what_to_look_for: arr(g.what_to_look_for, 10),
    field_check_steps: arr(g.field_check_steps, 10),
    decision_rules: arr(g.decision_rules, 10),
    management_steps: arr(g.management_steps, 10),
    prevention: arr(g.prevention, 8),
    common_mistakes: arr(g.common_mistakes, 8),
    avoid: arr(g.avoid, 8),
    season_notes: arr(g.season_notes, 8),
    turkey_note: clean(g.turkey_note, 1800),
    source_limits: clean(g.source_limits, 1200),
    source_sufficiency: ["strong", "medium", "weak"].includes(clean(g.source_sufficiency, 20)) ? clean(g.source_sufficiency, 20) : "weak",
    producer_value_score: score,
  };
}

async function invokeEditorialModel(
  model: string,
  prompt: string,
  base: any,
  text: string,
  key: string,
  maxTokens: number,
) {
  const requestBody: any = {
    model,
    messages: (
false
        ? [{
            role: "user",
            content: `${prompt}\n\nAşağıdaki JSON ve kaynak metnini işle:\n${JSON.stringify({
              existing: base,
              source_text: text.slice(0, 14000),
            })}`,
          }]
        : [
            { role: "system", content: prompt },
            { role: "user", content: JSON.stringify({ existing: base, source_text: text.slice(0, 14000) }) },
          ]
    ),
    temperature: 0.05,
    top_p: 0.82,
    max_tokens: maxTokens,
    stream: false,
  };

  if (model.startsWith("qwen/")) {
    requestBody.chat_template_kwargs = { enable_thinking: false };
  }
  if (model === "z-ai/glm-5.3-flash") {
    requestBody.reasoning_effort = "low";
    requestBody.chat_template_kwargs = { clear_thinking: true };
  }
  if (model === "nvidia/nemotron-3-super-120b-a12b") {
    requestBody.chat_template_kwargs = { enable_thinking: false };
    requestBody.temperature = 1.0;
    requestBody.top_p = 0.95;
  }
  if (model === "moonshotai/kimi-k3") {
    requestBody.temperature = 1.0;
    requestBody.reasoning_effort = "low";
    delete requestBody.top_p;
  }

  let response: Response | null = null;
  let lastError = "";

  for (let attempt = 1; attempt <= 1; attempt++) {
    try {
      response = await fetch(AI_URL, {
        method: "POST",
        signal: AbortSignal.timeout(model === "nvidia/nemotron-3-super-120b-a12b" ? 52000 : 60000),
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) break;

      lastError = await response.text().catch(() => "");
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    if (attempt < 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!response || !response.ok) {
    throw new Error(
      `${model} başarısız: ${response?.status || "network"} ${lastError.slice(0, 300)}`,
    );
  }

  const payload = await response.json();
  const raw = payload?.choices?.[0]?.message?.content;
  if (!raw) throw new Error(`${model} boş cevap`);

  return {
    model,
    x: jsonFrom(raw),
  };
}

async function callAi(
  prompt: string,
  base: any,
  text: string,
  key: string,
  maxTokens = 3000,
) {
  let primaryError = "";

  try {
    return await invokeEditorialModel(
      PRIMARY_MODEL,
      prompt,
      base,
      text,
      key,
      maxTokens,
    );
  } catch (error) {
    primaryError = error instanceof Error ? error.message : String(error);
    console.warn("[content-reprocess] primary AI fallback:", primaryError);
  }

  try {
    return await invokeEditorialModel(
      FALLBACK_MODEL,
      prompt,
      base,
      text,
      key,
      maxTokens,
    );
  } catch (error) {
    const fallbackError =
      error instanceof Error ? error.message : String(error);

    throw new Error(
      `İçerik AI başarısız. primary=${primaryError}; fallback=${fallbackError}`,
    );
  }
}

async function editorial(base: any, text: string, key: string, isGuide: boolean) {
  const guidePrompt = `Sen TarlaPusula Bilgi Rehberi editörüsün.
Amaç HABER veya MAKALE özeti yazmak değil; çiftçinin açıp bir konuyu öğrenebileceği kalıcı, açıklayıcı ve sahada kullanılabilir bir BİLGİ EKRANI üretmektir.

ÇIKTININ TAMAMI DOĞAL TÜRKÇE OLMALI.
İngilizce başlık, İngilizce cümle veya yarı çevrilmiş paragraf bırakma. Kurum/çeşit/aktif madde özel adları ve zorunlu teknik kısaltmalar dışında yabancı dil kullanma.
"Kaynak yayınladı", "çalışmada bulundu", "haber", "araştırmacılar açıkladı", "şu tarihte oldu" gibi haber dili kullanma.
Başlık zamansız ve öğretici olsun: "Bademde ... nasıl kontrol edilir?", "Buğdayda ... belirtileri ve yönetimi", "Toprak pH'ı neyi değiştirir?" gibi.

Rehber şu sırayla bilgi vermeli:
1) quick_answer: konunun 2-4 cümlede en net cevabı.
2) problem_or_goal: bu bilginin hangi sorunu/amacı çözdüğü.
3) why_it_matters: verim, kalite, maliyet veya risk açısından neden önemli olduğu.
4) when_to_check: ne zaman / hangi gelişim döneminde kontrol edileceği.
5) what_to_look_for: gözle, ölçümle veya analizle hangi işaretlere bakılacağı.
6) field_check_steps: tarlada/bahçede adım adım nasıl kontrol edileceği.
7) decision_rules: "Eğer ... ise ..." biçiminde karar kuralları; yalnız kaynakta destek varsa sayı/eşik kullan.
8) management_steps: kültürel, izleme, sulama, besleme, mekanik veya diğer yönetim seçenekleri.
9) prevention: sorun oluşmadan yapılabilecekler.
10) common_mistakes: çiftçinin sık yapabileceği yanlışlar.
11) avoid: özellikle kaçınılması gereken uygulamalar.
12) season_notes: sezon/dönem notları.
13) turkey_note: yabancı kaynağın Türkiye'ye aktarımında gereken uyarlama.
14) source_limits: kaynağın hangi ülke/koşula ait olduğu ve hangi bilgilerin doğrudan genellenemeyeceği.

KAYNAKTA OLMAYAN doz, eşik, tarih, ürün adı, teşhis veya sayı UYDURMA.
Yabancı pestisit/ruhsat/doz bilgisini Türkiye için talimat gibi verme. Kimyasal mücadele gerekiyorsa Türkiye'de güncel BKU/etiket kontrolünü açıkça belirt.
Yabancı kaynakta geçen pestisit adı, aktif madde, ticari ürün, doz, yüzde eşik, uygulama aralığı veya bölgesel tedavi takvimini TÜRKİYE İÇİN UYGULAMA TALİMATINA DÖNÜŞTÜRME. Böyle bir kaynakta yalnız teşhis/izleme/biyoloji/kültürel önlem gibi genellenebilir kısmı kullan; içerik esas olarak yabancı ilaç/doz/eşik talimatından oluşuyorsa source_sufficiency="weak" ve producer_value_score en fazla 50 olsun.
Haber, proje duyurusu, işletme/pazarlama yazısı, genel portal, kaynak listesi veya yalnız bağlantı dizini Bilgi Rehberi değildir; source_sufficiency="weak" ve producer_value_score en fazla 45 olsun.
producer_value_score 65 üstüne ancak kaynak çiftçiye en az üç somut şey söylüyorsa çıkabilir: neye bakılacağı, ne zaman bakılacağı, sahada nasıl kontrol edileceği, hangi durumda hangi yönetim adımının düşünüleceği.

Kaynak genel portal/indeks ise ve somut teknik bilgi yoksa source_sufficiency="weak" ve producer_value_score düşük olmalı.
Boş, genel, sloganvari cümleler yazma. Her madde çiftçinin anlayacağı kısa ve somut bilgi olsun.

summary, quick_answer ve guide alanlarının tamamı birbirini tekrar etmesin.
detail alanı rehber için haber bölümleri üretmesin; lead yalnız kısa giriş olabilir, what_happened/where_when/market_impact boş bırakılmalı.
event_date rehber için null olmalı.

SADECE JSON döndür:
{"title":"","summary":"","coverage_scope":"turkey|world","country_code":"","country_name":"","location_text":"","event_date":null,"category":"","tags":[],"crops":[],"image_search_keyword":"four to six specific English words","detail":{"lead":"","what_happened":"","where_when":"","background":"","why_it_matters":"","producer_impact":"","market_impact":"","source_note":""},"findings":[],"practical_takeaway":"","guide":{"quick_answer":"","problem_or_goal":"","why_it_matters":"","when_to_check":[],"what_to_look_for":[],"field_check_steps":[],"decision_rules":[],"management_steps":[],"prevention":[],"common_mistakes":[],"avoid":[],"season_notes":[],"turkey_note":"","source_limits":"","source_sufficiency":"strong|medium|weak","producer_value_score":0},"chart_data":null,"table_data":null}`

  const compactGuidePrompt = `TarlaPusula Bilgi Rehberi için verilen teknik kaynağı kısa, sade ve tamamen TÜRKÇE bir üretici bilgi kartına dönüştür.

KURALLAR:
- Yeni bilgi, ilaç dozu, ruhsat, eşik, tarih veya teşhis uydurma.
- Kaynakta olmayan şeyi ekleme.
- Yabancı bölgesel pestisit/doz/eşik talimatını Türkiye için öneri gibi yazma.
- Latince bilimsel ad, kurum adı ve çeşit adı kalabilir; bunun dışında İngilizce kelime/cümle bırakma.
- Başlık en fazla 110 karakter.
- Özet ve hızlı cevap en fazla 380 karakter.
- Diziler en fazla 3 madde; her madde en fazla 140 karakter.
- "Ne zaman kontrol et", "neye bak", "sahada ne yap", "karar kuralı", "yönetim", "kaçın" yalnız kaynak gerçekten destekliyorsa doldur; yoksa boş dizi bırak.
- producer_value_score 0-100; kaynak doğrudan sahada işe yarıyorsa yüksek ver.
- source_sufficiency yalnız strong|medium|weak.
- image_search_keyword yalnız görsel araması için 3-5 somut İngilizce kelime olabilir.
- SADECE geçerli JSON nesnesi döndür; açıklama veya markdown yazma.

ŞEMA:
{"title":"","summary":"","category":"","crops":[],"image_search_keyword":"","quick_answer":"","why_it_matters":"","when_to_check":[],"what_to_look_for":[],"field_check_steps":[],"decision_rules":[],"management_steps":[],"avoid":[],"source_limits":"","source_sufficiency":"strong|medium|weak","producer_value_score":0}`;

  const generalPrompt = `TarlaPusula için kaynak-sadakatli Türkçe editoryal içerik üret. ÇIKTININ TAMAMI TÜRKÇE OLMALI. Kaynakta doğrulanabilen bilgileri kullan; uydurma yer, tarih, sayı, neden, teşhis, tedavi veya alıntı ekleme. Bilgi yoksa açıkça "Kaynak bu ayrıntıyı belirtmiyor" yaz. summary 3-5 cümle, 350-750 karakter. Haber için: ne oldu, nerede/ne zaman, arka plan, neden önemli, üreticiye etkisi ve varsa piyasa etkisi. Makale için aynı alanlara ek olarak 3-5 bulgu ve pratik çıkarım. coverage_scope yalnız turkey/world. Türkiye ise country_code=TR. event_date yalnız doğrulanmış tarih. image_search_keyword görsel araması için 4-6 SOMUT İngilizce kelime olsun. Soyut/genel terim yazma. Görselde gerçekten görülmesi gereken nesneyi belirt: ürün/bitki + olay/belirti + bağlam. Örn. "wheat drought field", "pistachio kernels quality", "soil sampling laboratory", "cattle foot-and-mouth disease". "agricultural risk", "heavy metals", "climate agriculture" gibi tek başına başka anlamlara kayabilecek genel ifadeler YASAK. Grafik/tablo yalnız kaynakta gerçek sayısal veri varsa. SADECE JSON döndür: {"title":"","summary":"","coverage_scope":"turkey|world","country_code":"","country_name":"","location_text":"","event_date":null,"category":"","tags":[],"crops":[],"image_search_keyword":"four to six specific English words","detail":{"lead":"","what_happened":"","where_when":"","background":"","why_it_matters":"","producer_impact":"","market_impact":"","source_note":""},"findings":[],"practical_takeaway":"","chart_data":null,"table_data":null}`;

  const ai = await callAi(
    isGuide ? compactGuidePrompt : generalPrompt,
    base,
    isGuide ? text.slice(0, 4500) : text,
    key,
    isGuide ? 1300 : 2600,
  );
  let x = ai.x;
  let modelUsed = ai.model;

  if (isGuide) {
    const compact = x && typeof x === "object" ? x : {};
    const compactScore = Math.max(0, Math.min(100, Number(compact.producer_value_score) || 0));
    x = {
      title: clean(compact.title, 180),
      summary: clean(compact.summary, 900),
      coverage_scope: base.coverage_scope === "turkey" ? "turkey" : "world",
      country_code: base.country_code || "",
      country_name: base.country_name || "",
      location_text: base.location_text || "",
      event_date: null,
      category: clean(compact.category, 160) || "Bilgi Rehberi",
      tags: ["bilgi rehberi"],
      crops: arr(compact.crops, 8),
      image_search_keyword: clean(compact.image_search_keyword, 180),
      detail: {
        lead: clean(compact.summary, 900),
        what_happened: "",
        where_when: "",
        background: "",
        why_it_matters: clean(compact.why_it_matters, 900),
        producer_impact: clean(compact.quick_answer, 900),
        market_impact: "",
        source_note: "",
      },
      findings: [],
      practical_takeaway: clean(compact.quick_answer, 900),
      guide: {
        quick_answer: clean(compact.quick_answer, 900),
        problem_or_goal: clean(compact.title, 500),
        why_it_matters: clean(compact.why_it_matters, 900),
        when_to_check: arr(compact.when_to_check, 3),
        what_to_look_for: arr(compact.what_to_look_for, 3),
        field_check_steps: arr(compact.field_check_steps, 3),
        decision_rules: arr(compact.decision_rules, 3),
        management_steps: arr(compact.management_steps, 3),
        prevention: [],
        common_mistakes: [],
        avoid: arr(compact.avoid, 3),
        season_notes: [],
        turkey_note: "",
        source_limits: clean(compact.source_limits, 700),
        source_sufficiency: ["strong", "medium", "weak"].includes(clean(compact.source_sufficiency, 20))
          ? clean(compact.source_sufficiency, 20)
          : "medium",
        producer_value_score: compactScore,
      },
      chart_data: null,
      table_data: null,
    };
  }

  if (!isGuide) {
    const firstVisibleSample = [
      x.title,
      x.summary,
      x?.detail?.lead,
      x?.detail?.what_happened,
      x?.detail?.background,
      x?.detail?.why_it_matters,
      x?.detail?.producer_impact,
      x?.detail?.market_impact,
      ...(Array.isArray(x?.findings) ? x.findings : []),
      x?.practical_takeaway,
    ].filter(Boolean).join(" ");

    if (
      titleHasUntranslatedEnglish(x.title) ||
      generalHasUntranslatedEnglish(firstVisibleSample) ||
      !guideLanguageLooksTurkish(firstVisibleSample)
    ) {
      const cleanupPrompt = `TarlaPusula için verilen haber/makale JSON'unu DÜZELT.
Yeni bilgi ekleme; sayı, oran, tarih, deney sonucu veya anlam değiştirme.
KULLANICIYA GÖSTERİLEN bütün metinler doğal ve akıcı TÜRKÇE olmalı:
- title
- summary
- detail içindeki tüm alanlar
- findings
- practical_takeaway
- chart_data başlığı/etiketleri
- table_data başlığı/sütunları ve metinsel hücreleri
İngilizce bilimsel makale başlığını TÜRKÇEYE çevir. "late-deficit irrigation", "deficit irrigation", "post-harvest storage", "fruit quality", "yield" gibi yarı çevrilmiş ifadeleri Türkçeleştir.
Latince bilimsel adlar, çeşit adları, kurum adları ve zorunlu teknik kısaltmalar değişmeden kalabilir.
image_search_keyword İngilizce kalmalı.
JSON yapısını ve alan adlarını aynen koru.
SADECE düzeltilmiş JSON döndür.`;

      const cleaned = await callAi(cleanupPrompt, base, JSON.stringify(x), key, 3000);
      x = cleaned.x;
      modelUsed = cleaned.model;
    }

    const finalVisibleSample = [
      x.title,
      x.summary,
      x?.detail?.lead,
      x?.detail?.what_happened,
      x?.detail?.background,
      x?.detail?.why_it_matters,
      x?.detail?.producer_impact,
      x?.detail?.market_impact,
      ...(Array.isArray(x?.findings) ? x.findings : []),
      x?.practical_takeaway,
    ].filter(Boolean).join(" ");

    if (titleHasUntranslatedEnglish(x.title) || generalHasUntranslatedEnglish(finalVisibleSample)) {
      throw new Error("Haber/makale çevirisi tam Türkçe değil; aday kaydedilmedi.");
    }
  }

  if (isGuide) {
    const firstGuide = guideObj(x.guide);
    const firstLanguageSample = [
      x.title,
      x.summary,
      firstGuide.quick_answer,
      firstGuide.problem_or_goal,
      firstGuide.why_it_matters,
      ...firstGuide.when_to_check,
      ...firstGuide.what_to_look_for,
      ...firstGuide.field_check_steps,
      ...firstGuide.decision_rules,
      ...firstGuide.management_steps,
      ...firstGuide.prevention,
      ...firstGuide.common_mistakes,
      ...firstGuide.avoid,
      ...firstGuide.season_notes,
      firstGuide.turkey_note,
      firstGuide.source_limits,
    ].filter(Boolean).join(" ");

    if (!guideLanguageLooksTurkish(firstLanguageSample) || guideHasUntranslatedEnglish(firstLanguageSample)) {
      const cleanupPrompt = `TarlaPusula Bilgi Rehberi için verilen JSON'u DÜZELT.
Yeni bilgi ekleme, sayı/eşik/doz değiştirme, anlamı genişletme.
Başlık, summary, detail.lead, findings, practical_takeaway ve guide içindeki bütün kullanıcıya gösterilen metinleri doğal ve sade TÜRKÇEYE çevir.
"orchard", "spur", "shoot strike", "hull rot", "mating disruption", "cover crop", "spray", "predator", "growth regulator", "canopy", "weed", "twig", "pesticid" gibi yabancı veya yarı çevrilmiş tarım ifadelerini Türkçe karşılıklarıyla yaz.
Latince bilimsel adlar, kurum adları, çeşit adları ve zorunlu kısaltmalar kalabilir.
image_search_keyword İngilizce kalabilir.
Haber dili kullanma; bu bir bilgi ekranıdır.
JSON yapısını ve alan adlarını aynen koru.
SADECE düzeltilmiş JSON döndür.`;

      const cleaned = await callAi(cleanupPrompt, base, JSON.stringify(x).slice(0, 9000), key, 2400);
      x = cleaned.x;
      modelUsed = cleaned.model;
    }
  }

  // İKİNCİ SERT TÜRKÇELEŞTİRME: ilk temizlikten sonra kalan yabancı
  // ortak adları/yarı çevrilmiş terimleri kullanıcıya sızdırma.
  if (isGuide) {
    const secondGuide = guideObj(x.guide);
    const secondLanguageSample = [
      x.title,
      x.summary,
      secondGuide.quick_answer,
      secondGuide.problem_or_goal,
      secondGuide.why_it_matters,
      ...secondGuide.when_to_check,
      ...secondGuide.what_to_look_for,
      ...secondGuide.field_check_steps,
      ...secondGuide.decision_rules,
      ...secondGuide.management_steps,
      ...secondGuide.prevention,
      ...secondGuide.common_mistakes,
      ...secondGuide.avoid,
      ...secondGuide.season_notes,
      secondGuide.turkey_note,
      secondGuide.source_limits,
    ].filter(Boolean).join(" ");

    if (!guideLanguageLooksTurkish(secondLanguageSample) || guideHasUntranslatedEnglish(secondLanguageSample)) {
      const strictCleanupPrompt = `TarlaPusula Bilgi Rehberi JSON'unu SON KEZ dil açısından temizle.
SADECE geçerli JSON döndür. Yeni bilgi, doz, eşik, tarih veya öneri ekleme.

KURAL: image_search_keyword HARİÇ kullanıcıya gösterilen HİÇBİR alanda İngilizce kelime/cümle bırakma.
- "hull split" = "kabuk yarılması"
- "hull rot" = "kabuk çürüklüğü"
- "orchard" = "bahçe"
- "spur" = "kısa meyve dalı"
- "shoot" = "sürgün"
- "cover crop" = "örtü bitkisi"
- "spray" = "ilaçlama" veya bağlama göre "püskürtme"
- "predator" = "avcı doğal düşman"
- "canopy" = "ağaç tacı"
- "weed" = "yabancı ot"
- "twig" = "ince dal"
- "postharvest" = "hasat sonrası"
- "field scouting" = "saha gözlemi"
- "drip irrigation" = "damla sulama"
- "pest management" = "zararlı yönetimi"
- "growth regulator" = "büyüme düzenleyici"

İngilizce ortak zararlı/hastalık adı için güvenilir Türkçe karşılık bilmiyorsan İngilizce adı KORUMA.
Onun yerine kaynakta varsa yalnız Latince bilimsel adı kullan; bilimsel ad yoksa "ilgili zararlı" / "ilgili hastalık" gibi nötr Türkçe ifade kullan.
Latince bilimsel adlar, kurum adları, çeşit adları ve teknik kısaltmalar kalabilir.
JSON alan adlarını/yapısını değiştirme.`;

      const cleaned = await callAi(strictCleanupPrompt, base, JSON.stringify(x).slice(0, 9000), key, 2400);
      x = cleaned.x;
      modelUsed = cleaned.model;
    }
  }

  if (isGuide) {
    x = normalizeGuideTurkishTerms(x) as any;
  }

  const detail = {
    lead: clean(x?.detail?.lead, 2200),
    what_happened: clean(x?.detail?.what_happened, 4200),
    where_when: clean(x?.detail?.where_when, 2200),
    background: clean(x?.detail?.background, 4200),
    why_it_matters: clean(x?.detail?.why_it_matters, 3200),
    producer_impact: clean(x?.detail?.producer_impact, 3200),
    market_impact: clean(x?.detail?.market_impact, 2600),
    source_note: clean(x?.detail?.source_note, 1800),
  };
  const guide = isGuide ? guideObj(x.guide) : null;
  if (isGuide) {
    const guideLanguageSample = [
      x.title,
      x.summary,
      guide?.quick_answer,
      guide?.problem_or_goal,
      guide?.why_it_matters,
      ...(guide?.when_to_check || []),
      ...(guide?.what_to_look_for || []),
      ...(guide?.field_check_steps || []),
      ...(guide?.decision_rules || []),
      ...(guide?.management_steps || []),
      ...(guide?.prevention || []),
      ...(guide?.common_mistakes || []),
      ...(guide?.avoid || []),
      guide?.turkey_note,
    ].filter(Boolean).join(" ");

    const foreignSource = String(base?.originalLanguage || "").toLocaleLowerCase("tr-TR") !== "tr";
    if (!guideLanguageLooksTurkish(guideLanguageSample) || guideHasUntranslatedEnglish(guideLanguageSample)) {
      const englishHits = (clean(guideLanguageSample, 26000).match(/\b(orchard|spur|shoot|strike|hull|navel orangeworm|mating disruption|cover crop|broad[- ]spectrum|growth regulator|acaricide|insecticide|fungicide|pesticid|spray|predators?|overwintering|inoculum|growers?|fruit development|postharvest|twig|pest management guidelines?|field scouting|drip irrigation|tree row|weed|canopy|mummy nuts?|hullsplit|pheromone traps?|egg traps?|mounds?|brush[- ]mite|side[- ]dress|tasting room|break[- ]even|variedad|esp[eè]ces)\b/gi) ?? []).slice(0, 12);
      throw new Error(`Bilgi Rehberi çevirisi tam Türkçe değil; aday kaydedilmedi. tr=${guideLanguageLooksTurkish(guideLanguageSample)}; kalan=${englishHits.join(",") || "dil-karışık"}`);
    }
    if (foreignSource && foreignGuideLooksPrescriptive(guideLanguageSample)) {
      guide.source_sufficiency = "weak";
      guide.producer_value_score = Math.min(50, Number(guide.producer_value_score || 0));
      guide.turkey_note = clean(
        guide.turkey_note || "Yabancı kaynaktaki ilaç, doz ve bölgesel eşikler Türkiye için doğrudan uygulama talimatı değildir.",
        1800,
      );
    }
  }

  return {
    title: clean(x.title, 700) || clean(base.title, 700),
    summary: clean(x.summary, 1800) || clean(base.summary, 1800),
    scope: x.coverage_scope === "world" ? "world" : "turkey",
    countryCode: clean(x.country_code, 8) || null,
    countryName: clean(x.country_name, 120) || null,
    location: clean(x.location_text, 280) || null,
    eventDate: date(x.event_date) || base.sourceDate || null,
    category: clean(x.category, 100) || base.category || (isGuide ? "Bilgi Rehberi" : "Genel"),
    tags: arr(x.tags, 14),
    crops: arr(x.crops, 10),
    keyword: arr(clean(x.image_search_keyword, 180).split(/\s+/), 6).join(" ") || arr(clean(base.title, 180).split(/\s+/), 6).join(" ") || "crop field agriculture",
    detail,
    findings: arr(x.findings, 7),
    takeaway: clean(x.practical_takeaway, 3200),
    guide,
    chart: chart(x.chart_data),
    table: table(x.table_data),
    model: modelUsed,
  };
}

async function imageChoices(q: string) {
  const p = new URLSearchParams({ q, page_size: "20", license: "cc0,pdm,by,by-sa", mature: "false" });
  const r = await fetch(`https://api.openverse.org/v1/images/?${p}`, { signal: AbortSignal.timeout(12000), headers: { "User-Agent": "TarlaPusula-Image/3.0" } });
  if (!r.ok) return [];
  const j = await r.json();
  return (Array.isArray(j?.results) ? j.results : []).map((x: any) => ({
    url: clean(x?.thumbnail || x?.url, 1600), landing: clean(x?.foreign_landing_url || x?.url, 1600), creator: clean(x?.creator, 300), license: lic(x?.license), title: clean(x?.title, 300), source: clean(x?.source, 120),
  })).filter((x: any) => x.url && SAFE.has(x.license));
}
async function downloadImage(url: string) {
  const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(12000), headers: { "User-Agent": "TarlaPusula-Image/3.0" } });
  if (!r.ok) throw new Error(`image ${r.status}`);
  const type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error("image type");
  const b = new Uint8Array(await r.arrayBuffer());
  if (!b.length || b.length > 2 * 1024 * 1024) throw new Error("image size");
  return { b, type, ext: type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg" };
}

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return out({ error: "Sadece POST" }, 405);
  const su = clean(Deno.env.get("SUPABASE_URL"), 500), sk = clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 1200), ak = clean(Deno.env.get("NVIDIA_API_KEY"), 1200), rid = account(Deno.env.get("R2_ACCOUNT_ID")), ra = clean(Deno.env.get("R2_ACCESS_KEY_ID"), 500), rs = clean(Deno.env.get("R2_SECRET_ACCESS_KEY"), 1200), bucket = clean(Deno.env.get("R2_BUCKET_NAME"), 500);
  if (!su || !sk || !ak || !rid || !ra || !rs || !bucket) return out({ error: "AI/R2 yapılandırması eksik" }, 500);
  const db = createClient(su, sk, { auth: { persistSession: false } });
  if (!(await auth(req, db))) return out({ error: "Yetki gerekli" }, 403);

  try {
    const b = await req.json().catch(() => ({}));
    const candidateId = clean(b.candidateId, 100), contentId = clean(b.contentId, 100), rewrite = b.rewrite !== false, forceImage = b.forceImage === true;
    if (!candidateId && !contentId) return out({ error: "candidateId/contentId gerekli" }, 400);
    const tn = candidateId ? "content_candidates" : "content_items", id = candidateId || contentId;
    const qr = await db.from(tn).select("*").eq("id", id).maybeSingle();
    if (qr.error) throw qr.error;
    if (!qr.data) return out({ error: "İçerik yok" }, 404);

    const row = qr.data;
    const refs = Array.isArray(row.source_refs) ? row.source_refs : [];
    const ref = refs[0] || {};
    const sourceUrl = clean(ref.url, 1600);
    const sourceDate = date(ref.published_at) || row.event_date || row.published_at || null;
    const existingStructured = row.structured_body && typeof row.structured_body === "object" ? row.structured_body : {};
    const isGuide = row.content_subtype === "guide" || existingStructured?.channel === "guide" || (row.candidate_type === "knowledge_new" && row.content_subtype !== "article" && row.suggested_category !== "Bilimsel Makale");
    const base = { title: row.title_suggested ?? row.title, summary: row.short_summary ?? row.excerpt, body: row.body_draft ?? row.body, category: row.suggested_category ?? row.category, sourceDate, sourceName: ref.source_name ?? null, sourceUrl, subtype: row.content_subtype, originalLanguage: row.original_language ?? null, channel: isGuide ? "guide" : existingStructured?.channel ?? null };

    let sourceText = clean(base.body, 12000) || clean(base.summary, 3000);
    let guidePages: Array<{ title: string; url: string; score: number }> = [];
    if (rewrite && sourceUrl) {
      if (isGuide) {
        const bundle = await guidePageText(sourceUrl);
        sourceText = bundle.text || sourceText;
        guidePages = bundle.pages;
      } else {
        sourceText = (await pageText(sourceUrl)) || sourceText;
      }
    }

    let e: any;
    if (rewrite) e = await editorial(base, sourceText, ak, isGuide);
    else {
      const s = existingStructured;
      e = {
        title: clean(base.title, 700), summary: clean(base.summary, 1800), scope: row.coverage_scope || "turkey", countryCode: row.country_code || null, countryName: row.country_name || null, location: row.location_text || null, eventDate: sourceDate, category: base.category || "Genel", tags: row.suggested_tags ?? row.tags ?? [], crops: row.suggested_crops ?? row.crop_tags ?? [], keyword: row.image_search_keyword || "crop field agriculture",
        detail: s.detail || { lead: clean(base.summary, 1800), what_happened: clean(base.body, 5000), where_when: "", background: "", why_it_matters: "", producer_impact: "", market_impact: "", source_note: "" },
        findings: s.findings || [], takeaway: s.practical_takeaway || "", guide: s.guide || null, chart: s.chart_data || null, table: s.table_data || null,
      };
    }

    const channel = isGuide ? "guide" : (row.content_subtype === "article" ? "article" : row.content_type === "news" || row.candidate_type === "news" ? "news" : existingStructured?.channel || null);
    const structured: any = {
      ...existingStructured,
      ...(channel ? { channel } : {}),
      detail: e.detail,
      findings: e.findings,
      practical_takeaway: e.takeaway,
      chart_data: e.chart,
      table_data: e.table,
      ...(isGuide ? {
        guide: e.guide,
        guide_source_pages: guidePages,
        guide_quality_engine: "guide-information-v2",
        guide_format: "information_screen_v2",
        translation_status: String(row.original_language || "") && String(row.original_language || "") !== "tr"
          ? "translated_full_tr"
          : "not_required",
        producer_practicality_score: e.guide?.producer_value_score ?? existingStructured?.producer_practicality_score ?? 0,
      } : {}),
    };

    const payload = {
      version: 4, id, type: candidateId ? "candidate" : "content", content_subtype: isGuide ? "guide" : row.content_subtype || "general", title: e.title, summary: e.summary,
      coverage: { scope: e.scope, country_code: e.countryCode, country_name: e.countryName, location: e.location, event_date: e.eventDate },
      category: e.category, tags: e.tags, crops: e.crops, detail: e.detail, findings: e.findings, practical_takeaway: e.takeaway, guide: e.guide, chart_data: e.chart, table_data: e.table,
      source: { name: ref.source_name ?? null, url: sourceUrl, title: ref.title ?? null, published_at: sourceDate, doi: row.doi_number ?? null, author: row.author_text ?? null, institution: row.institution_text ?? null }, generated_at: new Date().toISOString(),
    };

    const bytes = new TextEncoder().encode(JSON.stringify(payload));
    const s3 = new S3Client({ region: "auto", endpoint: `https://${rid}.r2.cloudflarestorage.com`, credentials: { accessKeyId: ra, secretAccessKey: rs } });
    const owner = candidateId ? `candidate-${candidateId}` : `content-${contentId}`, pkey = `content-payloads/${owner}/v4.json`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: pkey, Body: bytes, ContentType: "application/json; charset=utf-8", CacheControl: contentId ? "public, max-age=300" : "private, no-store" }));
    const purl = `${su}/functions/v1/content-payload-public?${candidateId ? `candidateId=${candidateId}` : `contentId=${contentId}`}`;

    const guidePreview = isGuide
      ? [
          e.guide?.quick_answer || e.summary,
          e.guide?.problem_or_goal,
          e.guide?.why_it_matters,
          ...(e.guide?.what_to_look_for || []).slice(0, 4),
          ...(e.guide?.field_check_steps || []).slice(0, 4),
          ...(e.guide?.management_steps || []).slice(0, 4),
        ].filter(Boolean).join("\n\n").slice(0, 7000)
      : [e.detail?.lead, e.detail?.what_happened, e.detail?.where_when, e.detail?.why_it_matters].filter(Boolean).join("\n\n").slice(0, 5000);

    const update: any = { coverage_scope: e.scope, country_code: e.countryCode, country_name: e.countryName, location_text: e.location, event_date: e.eventDate, payload_r2_key: pkey, payload_public_url: purl, payload_bytes: bytes.length, payload_status: "ready", image_search_keyword: e.keyword, structured_body: structured };
    if (candidateId) Object.assign(update, { title_suggested: e.title, short_summary: e.summary, body_draft: guidePreview, suggested_category: e.category, suggested_tags: e.tags, suggested_crops: e.crops, ...(isGuide ? { content_subtype: "guide" } : {}) });
    else Object.assign(update, { title: e.title, excerpt: e.summary, body: guidePreview, category: e.category, tags: e.tags, crop_tags: e.crops, updated_at: new Date().toISOString(), ...(isGuide ? { content_subtype: "guide" } : {}) });
    const ur = await db.from(tn).update(update).eq("id", id);
    if (ur.error) throw ur.error;

    if (candidateId && isGuide) {
      const quality = Number(e.guide?.producer_value_score || 0);
      const sufficient = e.guide?.source_sufficiency !== "weak" && quality >= 65;
      if (sufficient && row.workflow_status === "held") {
        await db.from("content_candidates").update({
          workflow_status: "pending",
          payload_status: "ready",
          admin_note: "Bilgi Rehberi: kaynak Türkçeleştirildi, saha faydası yeterli; admin incelemesine hazır.",
        }).eq("id", candidateId);
      } else if (!sufficient) {
        await db.from("content_candidates").update({
          workflow_status: "held",
          admin_note: "guide_auto_quality_gate: Kaynak veya üretici faydası yeterli değil; otomatik yayın/onay dışı tutuldu.",
        }).eq("id", candidateId).neq("workflow_status", "approved");
      }
    }

    let image = null, imageError = "";
    if (forceImage) {
      for (const c of await imageChoices(e.keyword || "crop field agriculture")) {
        try {
          const im = await downloadImage(c.url), ikey = `content-images/covers/${owner}/${crypto.randomUUID()}.${im.ext}`;
          await s3.send(new PutObjectCommand({ Bucket: bucket, Key: ikey, Body: im.b, ContentType: im.type, CacheControl: "public, max-age=31536000, immutable" }));
          const ins = await db.from("content_images").insert({ candidate_id: candidateId || null, content_id: contentId || null, r2_key: ikey, public_url: null, original_url: c.landing, source_domain: c.source || "openverse", license_type: c.license, credit_text: [c.creator, c.license.toUpperCase()].filter(Boolean).join(" · "), alt_text: e.title, caption: c.title || null, image_type: "cover", status: contentId ? "approved" : "pending_review", is_cover: true, sort_order: 0 }).select("id").single();
          if (ins.error || !ins.data) throw ins.error;
          const iu = `${su}/functions/v1/content-image-public?id=${encodeURIComponent(ins.data.id)}`;
          await db.from("content_images").update({ public_url: iu }).eq("id", ins.data.id);
          let old = db.from("content_images").update({ is_cover: false });
          old = candidateId ? old.eq("candidate_id", candidateId) : old.eq("content_id", contentId);
          await old.neq("id", ins.data.id);
          await db.from(tn).update({ image_status: "ready" }).eq("id", id);
          image = { id: ins.data.id, url: iu, bytes: im.b.length, license: c.license };
          break;
        } catch (err) { imageError = err instanceof Error ? err.message : String(err); }
      }
      if (!image) await db.from(tn).update({ image_status: "error" }).eq("id", id);
    }

    const guideQuality = isGuide ? Number(e.guide?.producer_value_score || 0) : null;
    const guideSufficient = isGuide ? (e.guide?.source_sufficiency !== "weak" && guideQuality >= 65) : null;
    return out({ ok: true, model: e.model ?? PRIMARY_MODEL, engine: isGuide ? "content-reprocess-v12-guide-autoqueue" : "content-reprocess-v12-full-turkish", id, payload: { key: pkey, url: purl, bytes: bytes.length }, image, imageError, scope: e.scope, eventDate: e.eventDate, location: e.location, guideQuality, guideSufficient, guideSourcePages: guidePages.length });
  } catch (err) {
    console.error("[CONTENT_REPROCESS_V8]", err);
    return out({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});