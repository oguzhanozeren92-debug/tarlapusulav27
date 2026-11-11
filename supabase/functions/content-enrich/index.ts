import { createClient } from "npm:@supabase/supabase-js@2";
import { PutObjectCommand, S3Client } from "npm:@aws-sdk/client-s3@3.883.0";
import * as cheerio from "npm:cheerio@1.0.0";

// v8: nemotron bu hesapta "Function not found" (404) veriyor; GLM birincil, nemotron yedek. Sırayla denenir;
// mevcut structured_body (rehber alanları, görsel durumu) korunur, üzerine yazılmaz.
const AI_URL = "https://integrate.api.nvidia.com/v1/chat/completions";
const MODELS = ["z-ai/glm-5.3-flash", "nvidia/nemotron-3-super-120b-a12b"];
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-token", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const reply = (x: unknown, s = 200) => new Response(JSON.stringify(x), { status: s, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
const clean = (v: unknown, n = 2000) => String(v ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim().slice(0, n);
const uniq = (v: unknown, n = 12) => Array.isArray(v) ? [...new Set(v.map((x) => clean(x, 220)).filter(Boolean))].slice(0, n) : [];
const iso = (v: unknown) => { const t = Date.parse(clean(v, 120)); return Number.isFinite(t) ? new Date(t).toISOString() : null; };
const account = (v: unknown) => clean(v, 300).replace(/^https?:\/\//i, "").replace(/\.r2\.cloudflarestorage\.com.*$/i, "").replace(/\/.*$/, "");

async function allowed(req: Request, db: any) {
  const c = req.headers.get("x-cron-token")?.trim() || "";
  if (c) { const r = await db.rpc("content_engine_check_cron_token", { p_token: c }); if (!r.error && r.data === true) return true; }
  const t = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim(); if (!t) return false;
  const u = await db.auth.getUser(t); if (u.error || !u.data.user) return false;
  const a = await db.from("admin_users").select("user_id").eq("user_id", u.data.user.id).maybeSingle();
  return Boolean(a.data);
}
function parse(raw: string) { let v = raw.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, ""); const a = v.indexOf("{"), b = v.lastIndexOf("}"); if (a >= 0 && b > a) v = v.slice(a, b + 1); return JSON.parse(v); }
async function fetchText(url: string) {
  if (!url) return "";
  try {
    const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(9000), headers: { "User-Agent": "TarlaPusula-Editorial/4.0" } }); if (!r.ok) return "";
    const ct = r.headers.get("content-type") || ""; if (!ct.includes("html") && !ct.includes("text")) return "";
    const $ = cheerio.load(await r.text());
    for (const s of ["article", "main", ".article-content", ".content", ".detail", ".news-detail"]) {
      const e = $(s).first(); if (!e.length) continue; const c = e.clone(); c.find("script,style,nav,header,footer,aside,form,button,.share,.social").remove();
      const t = clean(c.text(), 14000); if (t.length > 180) return t;
    }
    return clean($("body").text(), 9000);
  } catch { return ""; }
}
function chart(v: any) { if (!v || typeof v !== "object") return null; const labels = uniq(v.labels, 12), values = Array.isArray(v.values) ? v.values.map(Number).slice(0, 12) : []; return labels.length === values.length && labels.length && values.every(Number.isFinite) ? { title: clean(v.title, 180) || "Kaynak verisi", type: v.type === "line" ? "line" : "bar", labels, values, unit: clean(v.unit, 50) || null } : null; }
function table(v: any) { if (!v || typeof v !== "object") return null; const columns = uniq(v.columns, 8); if (!columns.length || !Array.isArray(v.rows)) return null; const rows = v.rows.slice(0, 20).map((r: any) => Array.isArray(r) ? r.slice(0, columns.length).map((x: any) => typeof x === "number" ? x : clean(x, 160)) : []).filter((r: any[]) => r.length === columns.length); return rows.length ? { title: clean(v.title, 180) || null, columns, rows } : null; }

async function callModel(model: string, key: string, messages: unknown[]) {
  const body: Record<string, unknown> = { model, messages, temperature: 0.3, top_p: 0.95, max_tokens: 1800, stream: false };
  if (model.startsWith("nvidia/nemotron")) { body.chat_template_kwargs = { enable_thinking: false }; body.temperature = 1.0; }
  if (model === "z-ai/glm-5.3-flash") { body.reasoning_effort = "low"; body.chat_template_kwargs = { clear_thinking: true }; }
  const r = await fetch(AI_URL, { method: "POST", signal: AbortSignal.timeout(model === "z-ai/glm-5.3-flash" ? 75000 : 40000), headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(`${model} HTTP ${r.status}: ${t.slice(0, 200)}`); }
  const j = await r.json(), text = j?.choices?.[0]?.message?.content; if (!text) throw new Error(`${model} boş cevap`);
  return parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors }); if (req.method !== "POST") return reply({ error: "Sadece POST" }, 405);
  const su = clean(Deno.env.get("SUPABASE_URL"), 500), sk = clean(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), 1200), ai = clean(Deno.env.get("NVIDIA_API_KEY"), 1200), rid = account(Deno.env.get("R2_ACCOUNT_ID")), ra = clean(Deno.env.get("R2_ACCESS_KEY_ID"), 500), rs = clean(Deno.env.get("R2_SECRET_ACCESS_KEY"), 1200), bucket = clean(Deno.env.get("R2_BUCKET_NAME"), 500);
  if (!su || !sk || !ai || !rid || !ra || !rs || !bucket) return reply({ error: "AI/R2 yapılandırması eksik" }, 500);
  const db = createClient(su, sk, { auth: { persistSession: false } }); if (!(await allowed(req, db))) return reply({ error: "Yetki gerekli" }, 403);
  let id = "";
  try {
    const b = await req.json().catch(() => ({})); id = clean(b.candidateId, 100); if (!id) return reply({ error: "candidateId gerekli" }, 400);
    const qr = await db.from("content_candidates").select("*").eq("id", id).maybeSingle(); if (qr.error) throw qr.error; if (!qr.data) return reply({ error: "Aday bulunamadı" }, 404);
    const row = qr.data, refs = Array.isArray(row.source_refs) ? row.source_refs : [], ref = refs[0] || {};
    let raw = "";
    if (row.source_item_id) { const si = await db.from("content_source_items").select("raw_summary").eq("id", row.source_item_id).maybeSingle(); raw = clean(si.data?.raw_summary, 5000); }
    const page = await fetchText(clean(ref.url, 1600)), source = (page || raw || clean(row.body_draft, 6000) || clean(row.short_summary, 2500)).slice(0, 14000);
    const prompt = `TarlaPusula editörüsün. Verilen kaynağı Türk üreticisine yararlı, açık, tarihli ve kaynak-sadakatli Türkçe içeriğe dönüştür. Tarım, hayvancılık, gıda üretimi veya agtech ile ilgisiz/reklam ise skip=true. UYDURMA YAPMA. Kaynakta olmayan yer, tarih, sayı, neden-sonuç, teşhis, tedavi, ilaç/doz veya alıntı ekleme; eksik ayrıntıda "Kaynak bu ayrıntıyı belirtmiyor" de. summary 3-5 cümle ve 350-750 karakter. Haber: ne oldu, nerede/ne zaman, arka plan, neden önemli, üretici etkisi ve varsa piyasa etkisi. Makale: ayrıca 3-5 bulgu ve pratik çıkarım. coverage_scope sadece turkey/world; Türkiye ise country_code=TR. event_date yalnız doğrulanmış tarih. image_search_keyword: haberin konusunu fotoğrafta gösterecek 2-4 İngilizce kelime (ör. "wheat grain silo", "olive oil bottles", "dairy cattle barn"); ülke/kurum adı değil, görünür nesne. Grafik/tablo yalnız kaynaktaki gerçek sayısal veriden. SADECE JSON: {"skip":false,"title":"","summary":"","coverage_scope":"turkey|world","country_code":"","country_name":"","location_text":"","event_date":null,"category":"","tags":[],"crops":[],"image_search_keyword":"","detail":{"lead":"","what_happened":"","where_when":"","background":"","why_it_matters":"","producer_impact":"","market_impact":"","source_note":""},"findings":[],"practical_takeaway":"","chart_data":null,"table_data":null}`;
    const messages = [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify({ candidate: { title: row.title_suggested, summary: row.short_summary, subtype: row.content_subtype, scope_hint: row.coverage_scope }, source: { name: ref.source_name, url: ref.url, published_at: ref.published_at }, source_text: source }) }];
    let x: any = null, modelUsed = "", errors: string[] = [];
    for (const m of MODELS) {
      try { x = await callModel(m, ai, messages); modelUsed = m; break; } catch (e) { errors.push(clean(e instanceof Error ? e.message : e, 260)); }
    }
    if (!x) throw new Error(`AI başarısız: ${errors.join(" | ")}`);
    if (x?.skip === true) {
      await db.from("content_candidates").update({ workflow_status: "rejected", admin_note: "Otomatik filtre: tarımla ilgisiz/reklam", payload_status: "error", reviewed_at: new Date().toISOString() }).eq("id", id);
      return reply({ ok: true, skipped: true, id, model: modelUsed });
    }
    const detail = { lead: clean(x?.detail?.lead, 1800), what_happened: clean(x?.detail?.what_happened, 3600), where_when: clean(x?.detail?.where_when, 2000), background: clean(x?.detail?.background, 3600), why_it_matters: clean(x?.detail?.why_it_matters, 2800), producer_impact: clean(x?.detail?.producer_impact, 2800), market_impact: clean(x?.detail?.market_impact, 2400), source_note: clean(x?.detail?.source_note, 1800) };
    const findings = uniq(x.findings, 5), takeaway = clean(x.practical_takeaway, 2800), scope = x.coverage_scope === "world" ? "world" : "turkey", eventDate = iso(x.event_date) || iso(ref.published_at) || row.event_date || null;
    const prev = row.structured_body && typeof row.structured_body === "object" ? row.structured_body : {};
    const isGuide = row.content_subtype === "guide" || prev.channel === "guide";
    // Rehberlerde elle/özel hazırlanmış detay korunur; yalnız eksikse AI detayı yazılır
    const structured = { ...prev, detail: isGuide && prev.detail ? prev.detail : detail, findings: findings.length ? findings : (prev.findings || []), practical_takeaway: isGuide && prev.practical_takeaway ? prev.practical_takeaway : takeaway, chart_data: chart(x.chart_data) ?? prev.chart_data ?? null, table_data: table(x.table_data) ?? prev.table_data ?? null };
    const full = { version: 5, id, content_subtype: row.content_subtype || "general", title: isGuide ? row.title_suggested : (clean(x.title, 700) || row.title_suggested), summary: isGuide ? row.short_summary : (clean(x.summary, 1800) || row.short_summary), coverage: { scope, country_code: clean(x.country_code, 8) || null, country_name: clean(x.country_name, 120) || null, location: clean(x.location_text, 280) || null, event_date: eventDate }, category: clean(x.category, 100) || row.suggested_category || "Genel", tags: uniq(x.tags, 14), crops: uniq(x.crops, 10), detail: structured.detail, findings: structured.findings, practical_takeaway: structured.practical_takeaway, chart_data: structured.chart_data, table_data: structured.table_data, guide: prev.guide || null, source: { name: ref.source_name || null, url: ref.url || null, title: ref.title || null, published_at: ref.published_at || null, doi: row.doi_number || null, author: row.author_text || null, institution: row.institution_text || null }, generated_at: new Date().toISOString() };
    const bytes = new TextEncoder().encode(JSON.stringify(full)), s3 = new S3Client({ region: "auto", endpoint: `https://${rid}.r2.cloudflarestorage.com`, credentials: { accessKeyId: ra, secretAccessKey: rs } }), key = `content-payloads/candidate-${id}/v5.json`;
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: "application/json; charset=utf-8", CacheControl: "private, no-store" }));
    const preview = [structured.detail?.lead, structured.detail?.what_happened, structured.detail?.where_when, structured.detail?.why_it_matters].filter(Boolean).join("\n\n").slice(0, 2600);
    const kw = clean(x.image_search_keyword, 120).split(/\s+/).filter(Boolean).slice(0, 4).join(" ");
    const up = await db.from("content_candidates").update({
      title_suggested: full.title, short_summary: full.summary, body_draft: isGuide ? row.body_draft : preview, structured_body: structured,
      suggested_category: isGuide ? row.suggested_category : full.category, suggested_tags: full.tags.length ? full.tags : row.suggested_tags, suggested_crops: full.crops.length ? full.crops : row.suggested_crops,
      coverage_scope: scope, country_code: full.coverage.country_code, country_name: full.coverage.country_name, location_text: full.coverage.location, event_date: eventDate,
      image_search_keyword: row.image_search_keyword || kw || null,
      payload_r2_key: key, payload_public_url: `${su}/functions/v1/content-payload-public?candidateId=${id}`, payload_bytes: bytes.length, payload_status: "ready",
    }).eq("id", id);
    if (up.error) throw up.error;
    return reply({ ok: true, id, model: modelUsed, fallbackErrors: errors, payload_status: "ready", r2_key: key, bytes: bytes.length, scope, eventDate, location: full.coverage.location });
  } catch (e) {
    console.error("[CONTENT_ENRICH]", e);
    if (id) { try { await db.from("content_candidates").update({ payload_status: "error", payload_processing_at: new Date().toISOString() }).eq("id", id); } catch { /* ignore */ } }
    return reply({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
