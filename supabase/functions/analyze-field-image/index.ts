import { createClient } from "npm:@supabase/supabase-js@2";
import {
  GetObjectCommand,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.883.0";

const GEMINI_MODEL = "gemini-3.7-flash";
const GEMINI_FALLBACK_MODELS: string[] = [];
const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const CLOUDFLARE_AI_MODEL =
  (
    Deno.env.get(
      "CLOUDFLARE_AI_MODEL",
    ) ??
    "@cf/google/gemma-4-26b-a4b-it"
  ).trim();

const CLOUDFLARE_AI_TIMEOUT_MS =
  35_000;

const STORAGE_BUCKET = "field-activity-photos";
const R2_MARKER = "r2:";

const GEMINI_TIMEOUT_MS = 50_000;

/**
 * Gemini inline image requests are limited by total request size.
 * Raw bytes are kept below ~14 MB so base64 + prompt stays safely under
 * the 20 MB inline request ceiling.
 */
const MAX_TOTAL_IMAGE_BYTES = 14_000_000;
const MAX_SINGLE_IMAGE_BYTES = 8_000_000;
const MAX_HISTORY_PHOTOS = 2;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...cors,
      "Content-Type": "application/json",
    },
  });

type StoredImage = {
  mimeType: string;
  base64: string;
  byteLength: number;
};

type GeminiUsage = {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  totalTokenCount?: number;
  thoughtsTokenCount?: number;
};

function cleanJson(raw: string) {
  const value = raw
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");

  if (start >= 0 && end > start) {
    return value.slice(start, end + 1);
  }

  return value;
}

function normalizeAnalysis(value: any) {
  const statuses = new Set([
    "normal",
    "attention",
    "urgent",
    "uncertain",
  ]);

  const issueTypes = new Set([
    "disease",
    "pest",
    "weed",
    "nutrition",
    "environmental",
    "physical",
    "uncertain",
  ]);

  const severityValues = new Set([
    "low",
    "medium",
    "high",
    "unknown",
  ]);

  const status = statuses.has(value?.status)
    ? value.status
    : "uncertain";

  const issueType = issueTypes.has(value?.issueType)
    ? value.issueType
    : "uncertain";

  const severity = severityValues.has(value?.severity)
    ? value.severity
    : "unknown";

  const confidenceRaw = Number(value?.confidence);

  const confidence = Math.max(
    0,
    Math.min(
      100,
      Number.isFinite(confidenceRaw)
        ? confidenceRaw
        : 0,
    ),
  );

  const observations = Array.isArray(value?.observations)
    ? value.observations
        .filter(
          (item: unknown) =>
            typeof item === "string",
        )
        .map((item: string) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const recommendations = Array.isArray(
    value?.recommendations,
  )
    ? value.recommendations
        .filter(
          (item: unknown) =>
            typeof item === "string",
        )
        .map((item: string) => item.trim())
        .filter(Boolean)
        .slice(0, 5)
    : [];

  let followUpPhoto =
    typeof value?.followUpPhoto === "string"
      ? value.followUpPhoto
          .trim()
          .slice(0, 300)
      : "";

  let needsMoreEvidence = Boolean(
    value?.needsMoreEvidence,
  );

  if (status === "uncertain") {
    needsMoreEvidence = true;

    if (!followUpPhoto) {
      followUpPhoto =
        "Belirtiyi yakından, net ve iyi ışıkta gösteren bir fotoğraf çek.";
    }
  }

  const weedPresenceValues = new Set([
    "not_visible",
    "possible",
    "visible",
    "uncertain",
  ]);

  const weedDensityValues = new Set([
    "low",
    "medium",
    "high",
    "unknown",
  ]);

  const weedDistributionValues = new Set([
    "scattered",
    "patchy",
    "dense_patch",
    "uniform",
    "row_interference",
    "unknown",
  ]);

  const percentOrNull = (input: unknown) => {
    if (input === null || input === undefined || input === "") return null;
    const number = Number(input);
    return Number.isFinite(number)
      ? Math.round(Math.max(0, Math.min(100, number)) * 10) / 10
      : null;
  };

  const weedPresence = weedPresenceValues.has(value?.weedPresence)
    ? value.weedPresence
    : issueType === "weed"
      ? "possible"
      : "uncertain";

  const weedDensity = weedDensityValues.has(value?.weedDensity)
    ? value.weedDensity
    : "unknown";

  const weedDistribution = weedDistributionValues.has(value?.weedDistribution)
    ? value.weedDistribution
    : "unknown";

  const weedEvidence = Array.isArray(value?.weedEvidence)
    ? value.weedEvidence
        .filter((item: unknown) => typeof item === "string")
        .map((item: string) => item.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  return {
    status,
    issueType,
    severity,

    headline:
      typeof value?.headline === "string"
        ? value.headline
            .trim()
            .slice(0, 180)
        : "Fotoğraf için ön değerlendirme",

    possibleIssue:
      typeof value?.possibleIssue === "string"
        ? value.possibleIssue
            .trim()
            .slice(0, 250)
        : "Belirsiz",

    confidence,

    observations,

    recommendations,

    needsMoreEvidence,

    followUpPhoto,

    comparison:
      typeof value?.comparison === "string"
        ? value.comparison
            .trim()
            .slice(0, 300)
        : "",

    trend:
      ["improving", "stable", "worsening", "unknown"]
        .includes(value?.trend)
        ? value.trend
        : "unknown",

    weedPresence,
    weedCoverPercent: percentOrNull(value?.weedCoverPercent),
    cropCoverPercent: percentOrNull(value?.cropCoverPercent),
    bareSoilPercent: percentOrNull(value?.bareSoilPercent),
    weedDensity,
    weedDistribution,
    weedCandidate:
      typeof value?.weedCandidate === "string" && value.weedCandidate.trim()
        ? value.weedCandidate.trim().slice(0, 160)
        : null,
    weedEvidence,

    disclaimer:
      typeof value?.disclaimer === "string"
        ? value.disclaimer
            .trim()
            .slice(0, 350)
        : "Bu sonuç görsel kanıta dayalı bir ön değerlendirmedir; kesin teşhis değildir.",
  };
}

function bytesToBase64(bytes: Uint8Array) {
  const chunkSize = 0x8000;
  let binary = "";

  for (
    let index = 0;
    index < bytes.length;
    index += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(
        index,
        index + chunkSize,
      ),
    );
  }

  return btoa(binary);
}

function normalizeImageMime(value: unknown) {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();

  if (
    raw === "image/jpeg" ||
    raw === "image/jpg"
  ) {
    return "image/jpeg";
  }

  if (raw === "image/png") {
    return "image/png";
  }

  if (raw === "image/webp") {
    return "image/webp";
  }

  if (raw === "image/heic") {
    return "image/heic";
  }

  if (raw.startsWith("image/")) {
    return raw;
  }

  return "image/jpeg";
}

function normalizeR2AccountId(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(
      /\.r2\.cloudflarestorage\.com.*$/i,
      "",
    )
    .replace(/\/+$/g, "");
}

function createR2Client() {
  const accountId = normalizeR2AccountId(
    Deno.env.get("R2_ACCOUNT_ID") ?? "",
  );

  const accessKeyId = (
    Deno.env.get("R2_ACCESS_KEY_ID") ?? ""
  ).trim();

  const secretAccessKey = (
    Deno.env.get("R2_SECRET_ACCESS_KEY") ?? ""
  ).trim();

  const bucket = (
    Deno.env.get("R2_BUCKET_NAME") ?? ""
  ).trim();

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucket
  ) {
    return null;
  }

  return {
    bucket,

    client: new S3Client({
      region: "auto",

      endpoint:
        `https://${accountId}.r2.cloudflarestorage.com`,

      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    }),
  };
}

async function loadSupabaseImage(
  admin: any,
  bucketName: string,
  storedPath: string,
): Promise<StoredImage> {
  const signed = await admin.storage
    .from(bucketName)
    .createSignedUrl(
      storedPath,
      300,
    );

  if (
    signed.error ||
    !signed.data?.signedUrl
  ) {
    throw new Error(
      "Eski Supabase fotoğraf bağlantısı hazırlanamadı.",
    );
  }

  const response = await fetch(
    signed.data.signedUrl,
  );

  if (!response.ok) {
    throw new Error(
      `Eski fotoğraf okunamadı (HTTP ${response.status}).`,
    );
  }

  const bytes = new Uint8Array(
    await response.arrayBuffer(),
  );

  if (!bytes.length) {
    throw new Error(
      "Eski fotoğraf dosyası boş.",
    );
  }

  return {
    mimeType: normalizeImageMime(
      response.headers.get(
        "content-type",
      ),
    ),

    base64: bytesToBase64(bytes),

    byteLength: bytes.length,
  };
}

async function loadR2Image(
  bucketName: string,
  storedPath: string,
  userId: string,
): Promise<StoredImage> {
  const rawPath = storedPath
    .slice(R2_MARKER.length)
    .replace(/^\/+/, "");

  if (
    !rawPath.startsWith(
      `${userId}/`,
    ) ||
    rawPath.includes("..")
  ) {
    throw new Error(
      "R2 fotoğraf yolu kullanıcıyla eşleşmiyor.",
    );
  }

  const r2 = createR2Client();

  if (!r2) {
    throw new Error(
      "R2 sunucu ayarları eksik.",
    );
  }

  const object =
    await r2.client.send(
      new GetObjectCommand({
        Bucket: r2.bucket,

        Key:
          `${bucketName}/${rawPath}`,
      }),
    );

  if (!object.Body) {
    throw new Error(
      "R2 fotoğrafı boş döndü.",
    );
  }

  const body =
    await object.Body.transformToByteArray();

  const bytes =
    new Uint8Array(body);

  if (!bytes.length) {
    throw new Error(
      "R2 fotoğraf dosyası boş.",
    );
  }

  return {
    mimeType:
      normalizeImageMime(
        object.ContentType,
      ),

    base64:
      bytesToBase64(bytes),

    byteLength:
      bytes.length,
  };
}

async function loadStoredImage(
  admin: any,
  bucketName: string,
  storedPath: string,
  userId: string,
) {
  if (
    storedPath.startsWith(
      R2_MARKER,
    )
  ) {
    return await loadR2Image(
      bucketName,
      storedPath,
      userId,
    );
  }

  return await loadSupabaseImage(
    admin,
    bucketName,
    storedPath,
  );
}

function buildPrompt(input: {
  fieldName: string;
  crop: string;
  notes: string;
  previousAnalyses: unknown[];
  previousPhotoCount: number;
}) {
  return `Sen TarlaPusula'nın tarımsal görsel ön değerlendirme motorusun.

Amaç:
Kullanıcının tarla veya bitki fotoğraflarında görülebilen sorunları ön değerlendirmek ve gerekirse daha iyi kanıt istemek.

Tarla:
${input.fieldName || "Bilinmiyor"}

Ürün:
${input.crop || "Bilinmiyor"}

Kullanıcı notu:
${input.notes || "Yok"}

Bu vakada mevcut fotoğraftan önce analiz edilmiş fotoğraf sayısı:
${input.previousPhotoCount}

Önceki değerlendirmeler:
${JSON.stringify(input.previousAnalyses)}

Görevlerin:

1. Tüm sağlanan fotoğrafları birlikte değerlendir.
2. Hastalık, zararlı, YABANCI OT/istenmeyen bitki, besin eksikliği, su/ısı/güneş gibi çevresel stres ve fiziksel zararı birbirinden ayırmaya çalış.
3. Görsel kanıt yetersizse kesin teşhis uydurma.
4. Yabancı ot görünüyorsa issueType="weed" kullan. Tür düzeyinde ayırt edici özellikler net değilse weedCandidate=null bırak; ürün bitkisini yabancı ot diye etiketleme.
5. Yabancı ot için weedPresence, weedDensity ve weedDistribution alanlarını doldur. Görüntü yeterince geniş alan gösteriyorsa weedCoverPercent/cropCoverPercent/bareSoilPercent için yalnız yaklaşık görsel kaplama yüzdesi ver; yakın plan tek bitki fotoğrafında bu yüzdeleri null bırak.
6. Fotoğrafta spesifik hastalık, zararlı veya yabancı ot adayı için ayırt edici kanıt görüyorsan possibleIssue alanında en olası adı yaz; emin değilsen "Belirsiz" de.
7. confidence değerini 0-100 arasında ver.
8. Önceki fotoğraflar varsa mevcut fotoğrafla karşılaştır ve trend alanında:
   - improving
   - stable
   - worsening
   - unknown
   seçeneklerinden birini kullan.
9. comparison alanında önceki görüntüye göre gözle görülen değişimi tek kısa paragrafla yaz.
10. Kanıt yetersizse status="uncertain" ve needsMoreEvidence=true yap.
11. followUpPhoto alanında TEK bir sonraki en faydalı fotoğrafı somut tarif et.
12. Pestisit, herbisit, ilaç, etken madde veya gübre dozu/reçetesi verme. Yabancı ot görülse bile yalnız gözlem, haritalama, mekanik/kültürel kontrol ve uzman/resmî doğrulama adımı öner.
13. Önerileri gözlem, saha kontrolü ve doğrulama adımları şeklinde ver.
14. Türkçe yaz.
15. Yalnızca geçerli JSON döndür.

JSON formatı:

{
  "status": "normal|attention|urgent|uncertain",
  "issueType": "disease|pest|weed|nutrition|environmental|physical|uncertain",
  "severity": "low|medium|high|unknown",
  "headline": "kısa başlık",
  "possibleIssue": "en olası sorun veya Belirsiz",
  "confidence": 0,
  "observations": [
    "görüntüden doğrudan gözlenen bulgu"
  ],
  "recommendations": [
    "güvenli sonraki kontrol adımı"
  ],
  "needsMoreEvidence": true,
  "followUpPhoto": "istenen tek sonraki fotoğraf",
  "comparison": "önceki fotoğraf varsa kısa karşılaştırma",
  "trend": "improving|stable|worsening|unknown",
  "weedPresence": "not_visible|possible|visible|uncertain",
  "weedCoverPercent": null,
  "cropCoverPercent": null,
  "bareSoilPercent": null,
  "weedDensity": "low|medium|high|unknown",
  "weedDistribution": "scattered|patchy|dense_patch|uniform|row_interference|unknown",
  "weedCandidate": null,
  "weedEvidence": ["yabancı ot kararını destekleyen doğrudan görsel bulgu"],
  "disclaimer": "kısa ön değerlendirme uyarısı"
}`;
}

function extractGeminiText(payload: any) {
  const parts =
    payload?.candidates?.[0]
      ?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part: any) =>
      typeof part?.text ===
      "string"
        ? part.text
        : "",
    )
    .filter(Boolean)
    .join("\n")
    .trim();
}

function geminiErrorMessage(
  status: number,
  detail: string,
  model = GEMINI_MODEL,
) {
  if (status === 429) {
    return (
      "Gemini kullanım kotası veya hız limiti aşıldı. " +
      "Bir süre sonra tekrar dene."
    );
  }

  if (status === 401 || status === 403) {
    return (
      "Gemini API anahtarı veya proje erişimi geçersiz. " +
      `HTTP ${status}.`
    );
  }

  if (status === 404) {
    return (
      `${model} modeli bu API anahtarı/proje için bulunamadı.`
    );
  }

  if (
    status >= 500
  ) {
    return (
      `Gemini geçici servis hatası verdi (HTTP ${status}).`
    );
  }

  return (
    `Gemini analizi başarısız oldu (HTTP ${status}): ` +
    detail.slice(0, 350)
  );
}

async function analyzeWithGemini(
  apiKey: string,
  prompt: string,
  images: StoredImage[],
  model = GEMINI_MODEL,
) {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      GEMINI_TIMEOUT_MS,
    );

  try {
    const parts: any[] = [
      {
        text: prompt,
      },
    ];

    for (
      const image of images
    ) {
      parts.push({
        inlineData: {
          mimeType:
            image.mimeType,

          data:
            image.base64,
        },
      });
    }

    const response =
      await fetch(
        `${GEMINI_API_BASE}/${model}:generateContent`,
        {
          method: "POST",

          signal:
            controller.signal,

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              apiKey,
          },

          body:
            JSON.stringify({
              contents: [
                {
                  role: "user",
                  parts,
                },
              ],

              generationConfig: {
                temperature: 0,
                topP: 0.9,
                maxOutputTokens:
                  1800,

                responseMimeType:
                  "application/json"
              },
            }),
        },
      );

    if (!response.ok) {
      const detail =
        await response
          .text()
          .catch(
            () => "",
          );

      throw new Error(
        geminiErrorMessage(
          response.status,
          detail,
          model,
        ),
      );
    }

    const payload =
      await response.json();

    const raw =
      extractGeminiText(
        payload,
      );

    if (!raw) {
      const finishReason =
        payload?.candidates?.[0]
          ?.finishReason;

      throw new Error(
        finishReason
          ? `Gemini boş sonuç döndürdü (${finishReason}).`
          : "Gemini boş sonuç döndürdü.",
      );
    }

    let parsed: any;

    try {
      parsed =
        JSON.parse(
          cleanJson(raw),
        );
    } catch {
      throw new Error(
        "Gemini geçerli JSON döndürmedi.",
      );
    }

    const analysis =
      normalizeAnalysis(
        parsed,
      );

    if (
      !analysis.observations
        .length
    ) {
      throw new Error(
        "Gemini görüntüden yeterli gözlem üretmedi.",
      );
    }

    const usage:
      GeminiUsage =
        payload?.usageMetadata ??
        {};

    return {
      analysis,
      usage,
      raw,
    };
  } finally {
    clearTimeout(timer);
  }
}

function cloudflareAccountId() {
  return (
    Deno.env.get(
      "CLOUDFLARE_ACCOUNT_ID",
    ) ??
    Deno.env.get(
      "R2_ACCOUNT_ID",
    ) ??
    ""
  )
    .trim()
    .replace(
      /^https?:\/\//i,
      "",
    )
    .replace(
      /\.r2\.cloudflarestorage\.com.*$/i,
      "",
    )
    .replace(
      /\/+$/g,
      "",
    );
}

function cloudflareAuthToken() {
  return (
    Deno.env.get(
      "CLOUDFLARE_AI_TOKEN",
    ) ??
    Deno.env.get(
      "CLOUDFLARE_AUTH_TOKEN",
    ) ??
    Deno.env.get(
      "CLOUDFLARE_API_TOKEN",
    ) ??
    ""
  ).trim();
}

function extractCloudflareText(
  payload: any,
) {
  const direct =
    payload?.result
      ?.response;

  if (
    typeof direct ===
      "string" &&
    direct.trim()
  ) {
    return direct.trim();
  }

  const choice =
    payload?.result
      ?.choices?.[0]
      ?.message?.content ??
    payload?.choices?.[0]
      ?.message?.content;

  if (
    typeof choice ===
      "string" &&
    choice.trim()
  ) {
    return choice.trim();
  }

  return "";
}

function cloudflareErrorMessage(
  status: number,
  detail: string,
) {
  if (status === 429) {
    return (
      "Cloudflare Workers AI günlük ücretsiz kotası veya kapasitesi dolu. " +
      "Gemini yedeğine geçilecek."
    );
  }

  if (
    status === 401 ||
    status === 403
  ) {
    return (
      "Cloudflare Workers AI tokenı veya model erişimi geçersiz. " +
      `HTTP ${status}.`
    );
  }

  if (status === 408) {
    return (
      "Cloudflare Workers AI zaman aşımına uğradı."
    );
  }

  return (
    `Cloudflare Workers AI başarısız oldu (HTTP ${status}): ` +
    detail.slice(0, 350)
  );
}

async function analyzeWithCloudflare(
  prompt: string,
  images: StoredImage[],
) {
  const accountId =
    cloudflareAccountId();

  const authToken =
    cloudflareAuthToken();

  if (
    !accountId ||
    !authToken
  ) {
    throw new Error(
      "Cloudflare Workers AI yapılandırması eksik.",
    );
  }

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      CLOUDFLARE_AI_TIMEOUT_MS,
    );

  try {
    const content: any[] = [
      {
        type: "text",
        text: prompt,
      },
    ];

    for (
      const image of images
    ) {
      content.push({
        type:
          "image_url",
        image_url: {
          url:
            `data:${image.mimeType};base64,${image.base64}`,
        },
      });
    }

    const response =
      await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CLOUDFLARE_AI_MODEL}`,
        {
          method: "POST",
          signal:
            controller.signal,
          headers: {
            Authorization:
              `Bearer ${authToken}`,
            "Content-Type":
              "application/json",
          },
          body:
            JSON.stringify({
              messages: [
                {
                  role:
                    "system",
                  content:
                    "Sen TarlaPusula'nın tarımsal görsel ön değerlendirme motorusun. Yalnızca istenen JSON nesnesini döndür; markdown kullanma.",
                },
                {
                  role:
                    "user",
                  content,
                },
              ],
              max_tokens:
                1800,
              temperature: 0,
              chat_template_kwargs: {
                enable_thinking:
                  false,
              },
              options: {
                rejectIfBusy:
                  true,
              },
            }),
        },
      );

    const payloadText =
      await response
        .text();

    let payload: any =
      null;

    try {
      payload =
        JSON.parse(
          payloadText,
        );
    } catch {
      payload =
        null;
    }

    if (
      !response.ok ||
      payload?.success ===
        false
    ) {
      throw new Error(
        cloudflareErrorMessage(
          response.status,
          payloadText,
        ),
      );
    }

    const raw =
      extractCloudflareText(
        payload,
      );

    if (!raw) {
      throw new Error(
        "Cloudflare Workers AI boş sonuç döndürdü.",
      );
    }

    let parsed: any;

    try {
      parsed =
        JSON.parse(
          cleanJson(raw),
        );
    } catch {
      throw new Error(
        "Cloudflare Workers AI geçerli JSON döndürmedi.",
      );
    }

    const analysis =
      normalizeAnalysis(
        parsed,
      );

    if (
      !analysis.observations
        .length
    ) {
      throw new Error(
        "Cloudflare Workers AI görüntüden yeterli gözlem üretmedi.",
      );
    }

    return {
      analysis,
      usage:
        payload?.result
          ?.usage ??
        payload?.usage ??
        {},
      raw,
      provider:
        "cloudflare",
      modelUsed:
        CLOUDFLARE_AI_MODEL,
      attempt: 1,
      fallbackUsed:
        false,
    };
  } finally {
    clearTimeout(
      timer,
    );
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function providerErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? "");
}

function isProviderAuthError(error: unknown) {
  return /API anahtarı|proje erişimi geçersiz|HTTP 401|HTTP 403/i.test(
    providerErrorText(error),
  );
}

function isRetryableProviderError(error: unknown) {
  const message = providerErrorText(error);
  return (
    /HTTP (429|500|502|503|504)/i.test(message) ||
    /kota|hız limiti|geçici servis|yanıt vermedi|boş sonuç|geçerli JSON|yeterli gözlem|abort|aborted/i.test(message)
  );
}

async function analyzeWithGeminiResilient(
  apiKey: string,
  prompt: string,
  images: StoredImage[],
) {
  const models = [GEMINI_MODEL, ...GEMINI_FALLBACK_MODELS];
  let lastError: unknown = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    const maxAttempts = 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await analyzeWithGemini(
          apiKey,
          prompt,
          images,
          model,
        );

        if (modelIndex > 0 || attempt > 1) {
          console.log("[PUSULA_GEMINI_RECOVERED]", {
            primaryModel: GEMINI_MODEL,
            modelUsed: model,
            attempt,
            fallback: modelIndex > 0,
          });
        }

        return {
          ...result,
          modelUsed: model,
          attempt,
          fallbackUsed: modelIndex > 0,
        };
      } catch (error) {
        lastError = error;

        console.warn("[PUSULA_GEMINI_ATTEMPT_FAILED]", {
          model,
          attempt,
          maxAttempts,
          message: providerErrorText(error).slice(0, 500),
        });

        if (isProviderAuthError(error)) {
          throw error;
        }

        if (/abort|aborted|yanıt vermedi|timeout/i.test(providerErrorText(error))) {
          throw error;
        }

        if (attempt < maxAttempts && isRetryableProviderError(error)) {
          await sleep(900 * attempt);
          continue;
        }

        break;
      }
    }
  }

  const detail = providerErrorText(lastError);
  throw new Error(
    detail
      ? `AI sağlayıcı geçici olarak yanıt vermiyor. Otomatik yeniden denemeler tamamlandı. Son hata: ${detail}`
      : "AI sağlayıcı geçici olarak yanıt vermiyor. Otomatik yeniden denemeler tamamlandı.",
  );
}

async function analyzeWithProviderRouter(
  geminiApiKey: string,
  prompt: string,
  images: StoredImage[],
) {
  const cloudflareConfigured =
    Boolean(
      cloudflareAccountId() &&
      cloudflareAuthToken(),
    );

  let cloudflareError:
    unknown = null;

  if (
    cloudflareConfigured
  ) {
    try {
      const result =
        await analyzeWithCloudflare(
          prompt,
          images,
        );

      console.log(
        "[PUSULA_CLOUDFLARE_AI_SUCCESS]",
        {
          model:
            result.modelUsed,
          imageCount:
            images.length,
        },
      );

      return result;
    } catch (error) {
      cloudflareError =
        error;

      console.warn(
        "[PUSULA_CLOUDFLARE_AI_FAILED]",
        {
          model:
            CLOUDFLARE_AI_MODEL,
          message:
            providerErrorText(
              error,
            ).slice(
              0,
              500,
            ),
        },
      );
    }
  } else {
    console.warn(
      "[PUSULA_CLOUDFLARE_AI_NOT_CONFIGURED]",
      {
        hasAccountId:
          Boolean(
            cloudflareAccountId(),
          ),
        hasToken:
          Boolean(
            cloudflareAuthToken(),
          ),
      },
    );
  }

  if (
    geminiApiKey
  ) {
    const result =
      await analyzeWithGeminiResilient(
        geminiApiKey,
        prompt,
        images,
      );

    return {
      ...result,
      provider:
        "google",
      fallbackUsed:
        cloudflareConfigured
          ? true
          : Boolean(
              result.fallbackUsed,
            ),
      cloudflareError:
        cloudflareError
          ? providerErrorText(
              cloudflareError,
            )
          : null,
    };
  }

  const detail =
    cloudflareError
      ? providerErrorText(
          cloudflareError,
        )
      : "Cloudflare Workers AI tokenı tanımlı değil.";

  throw new Error(
    `Görsel AI sağlayıcısı kullanılamıyor. ${detail}`,
  );
}

function isAbortError(
  error: unknown,
) {
  return (
    error instanceof
      DOMException &&
      error.name ===
        "AbortError"
  ) || (
    error instanceof Error &&
    /abort|aborted/i.test(
      error.message,
    )
  );
}

Deno.serve(
  async (req: Request) => {
    if (
      req.method === "OPTIONS"
    ) {
      return new Response(
        "ok",
        {
          headers: cors,
        },
      );
    }

    if (
      req.method !== "POST"
    ) {
      return reply(
        {
          error:
            "Sadece POST.",
        },
        405,
      );
    }

    const supabaseUrl =
      Deno.env.get(
        "SUPABASE_URL",
      ) ?? "";

    const anonKey =
      Deno.env.get(
        "SUPABASE_ANON_KEY",
      ) ?? "";

    const serviceRoleKey =
      Deno.env.get(
        "SUPABASE_SERVICE_ROLE_KEY",
      ) ?? "";

    const geminiApiKey =
      (
        Deno.env.get(
          "GEMINI_API_KEY",
        ) ?? ""
      ).trim();

    const cloudflareConfigured =
      Boolean(
        cloudflareAccountId() &&
        cloudflareAuthToken(),
      );

    if (
      !supabaseUrl ||
      !anonKey ||
      !serviceRoleKey ||
      (
        !cloudflareConfigured &&
        !geminiApiKey
      )
    ) {
      return reply(
        {
          error:
            "Görsel AI sunucu yapılandırması eksik. Cloudflare Workers AI veya Gemini sağlayıcısından en az biri tanımlı olmalı.",
        },
        500,
      );
    }

    const authorization =
      req.headers.get(
        "Authorization",
      ) ?? "";

    const token =
      authorization
        .replace(
          /^Bearer\s+/i,
          "",
        )
        .trim();

    if (!token) {
      return reply(
        {
          error:
            "Oturum gerekli.",
        },
        401,
      );
    }

    const userClient =
      createClient(
        supabaseUrl,
        anonKey,
        {
          global: {
            headers: {
              Authorization:
                authorization,
            },
          },

          auth: {
            persistSession:
              false,
          },
        },
      );

    const admin =
      createClient(
        supabaseUrl,
        serviceRoleKey,
        {
          auth: {
            persistSession:
              false,
          },
        },
      );

    const {
      data: authData,
      error: authError,
    } =
      await userClient.auth.getUser(
        token,
      );

    if (
      authError ||
      !authData.user
    ) {
      return reply(
        {
          error:
            "Geçersiz oturum.",
        },
        401,
      );
    }

    const userId =
      authData.user.id;

    let jobId = "";
    let accessUsageId: number | null = null;
    let consumedAccess: any = null;

    try {
      const body =
        await req.json();

      jobId = String(
        body?.jobId ?? "",
      ).trim();

      const requestedPreviewPlan =
        String(
          body?.developerPreviewPlan ??
          "",
        )
          .trim()
          .toLowerCase();

      if (!jobId) {
        return reply(
          {
            error:
              "jobId gerekli.",
          },
          400,
        );
      }

      const {
        data: job,
        error: jobError,
      } =
        await admin
          .from(
            "ai_image_analysis_jobs",
          )
          .select("*")
          .eq(
            "id",
            jobId,
          )
          .eq(
            "user_id",
            userId,
          )
          .maybeSingle();

      if (jobError) {
        throw jobError;
      }

      if (!job) {
        return reply(
          {
            error:
              "Analiz işi bulunamadı.",
          },
          404,
        );
      }

      if (
        job.status ===
          "completed" &&
        job.analysis
      ) {
        return reply({
          analysis:
            job.analysis,

          diagnosisSessionId:
            job.diagnosis_session_id,

          modelUsed:
            job.model ??
            GEMINI_MODEL,

          provider:
            job.provider ??
            "google",

          reused: true,
        });
      }

      let developerPremiumPreview =
        false;

      if (
        requestedPreviewPlan ===
          "premium"
      ) {
        const developerEmail =
          String(
            authData.user.email ??
            "",
          )
            .trim()
            .toLowerCase();

        const {
          data: isAdmin,
          error: adminCheckError,
        } = await userClient.rpc(
          "is_admin",
        );

        const authorizedDeveloper =
          developerEmail ===
            "best.flow@hotmail.com" ||
          (
            !adminCheckError &&
            isAdmin === true
          );

        if (
          authorizedDeveloper
        ) {
          developerPremiumPreview =
            true;

          consumedAccess = {
            allowed: true,
            usage_id: null,
            access_source:
              "developer_premium_preview",
            plan: "premium",
            daily_free_used:
              false,
            free_remaining: 0,
            reward_credits: 0,
            unlimited: true,
          };

          console.log(
            "[PUSULA_AI_DEV_PREMIUM_PREVIEW]",
            {
              userId,
              jobId,
              developerEmail,
            },
          );
        }
      }

      if (
        !developerPremiumPreview
      ) {
        const {
          data: accessRows,
          error: accessError,
        } = await userClient.rpc(
          "consume_ai_access",
        );

        if (accessError) {
          throw accessError;
        }

        consumedAccess =
          Array.isArray(accessRows)
            ? accessRows[0]
            : accessRows;
      }

      if (!consumedAccess?.allowed) {
        await admin
          .from(
            "ai_image_analysis_jobs",
          )
          .update({
            status: "failed",
            error_message:
              "Ücretsiz planda fotoğraf analizi için ödüllü reklam gerekli.",
            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            jobId,
          )
          .eq(
            "user_id",
            userId,
          );

        return reply({
          limitReached: true,
          message:
            "Ücretsiz planda fotoğraf analizi için ödüllü reklam izlemen gerekiyor.",
          access: {
            plan:
              consumedAccess?.plan ??
              "free",
            dailyFreeUsed:
              true,
            freeRemaining:
              0,
            rewardCredits:
              Number(
                consumedAccess?.reward_credits ??
                0,
              ),
            unlimited:
              false,
          },
        });
      }

      accessUsageId =
        consumedAccess?.usage_id == null
          ? null
          : Number(
              consumedAccess.usage_id,
            );

      let session: any =
        null;

      if (
        job.diagnosis_session_id
      ) {
        const result =
          await admin
            .from(
              "ai_diagnosis_sessions",
            )
            .select("*")
            .eq(
              "id",
              job.diagnosis_session_id,
            )
            .eq(
              "user_id",
              userId,
            )
            .maybeSingle();

        if (result.error) {
          throw result.error;
        }

        session =
          result.data;
      }

      if (!session) {
        const result =
          await admin
            .from(
              "ai_diagnosis_sessions",
            )
            .insert({
              user_id:
                userId,

              field_id:
                job.field_id,

              crop:
                job.crop,

              field_name:
                job.field_name,

              notes:
                job.notes,

              status:
                "active",
            })
            .select("*")
            .single();

        if (result.error) {
          throw result.error;
        }

        session =
          result.data;

        await admin
          .from(
            "ai_image_analysis_jobs",
          )
          .update({
            diagnosis_session_id:
              session.id,

            sequence_no: 1,
          })
          .eq(
            "id",
            jobId,
          );

        job.diagnosis_session_id =
          session.id;

        job.sequence_no = 1;
      }

      const {
        data: history,
        error:
          historyError,
      } =
        await admin
          .from(
            "ai_image_analysis_jobs",
          )
          .select(
            "id,storage_bucket,storage_path,analysis,sequence_no,notes,status,created_at",
          )
          .eq(
            "diagnosis_session_id",
            session.id,
          )
          .eq(
            "user_id",
            userId,
          )
          .neq(
            "id",
            jobId,
          )
          .eq(
            "status",
            "completed",
          )
          .order(
            "sequence_no",
            {
              ascending:
                false,
            },
          )
          .limit(
            MAX_HISTORY_PHOTOS,
          );

      if (
        historyError
      ) {
        throw historyError;
      }

      const historyRows =
        [...(history ?? [])]
          .reverse();

      const previousAnalyses =
        historyRows.map(
          (item: any) => ({
            photo:
              item.sequence_no,

            analysis:
              item.analysis,
          }),
        );

      const prompt =
        buildPrompt({
          fieldName:
            String(
              job.field_name ??
              "",
            ),

          crop:
            String(
              job.crop ?? "",
            ),

          notes:
            String(
              job.notes ??
              session.notes ??
              "",
            ),

          previousAnalyses,

          previousPhotoCount:
            historyRows.length,
        });

      const photoRows = [
        ...historyRows,
        job,
      ];

      const images:
        StoredImage[] = [];

      let totalImageBytes =
        0;

      for (
        const photo of
        photoRows
      ) {
        const bucketName =
          String(
            photo.storage_bucket ??
            STORAGE_BUCKET,
          );

        if (
          bucketName !==
          STORAGE_BUCKET
        ) {
          continue;
        }

        const storedPath =
          String(
            photo.storage_path ??
            "",
          );

        if (!storedPath) {
          continue;
        }

        const image =
          await loadStoredImage(
            admin,
            bucketName,
            storedPath,
            userId,
          );

        if (
          image.byteLength >
          MAX_SINGLE_IMAGE_BYTES
        ) {
          throw new Error(
            "Fotoğraf AI analizi için çok büyük. Daha düşük çözünürlüklü bir fotoğraf yükle.",
          );
        }

        if (
          totalImageBytes +
            image.byteLength >
          MAX_TOTAL_IMAGE_BYTES
        ) {
          /**
           * Önceki görseller toplam sınırı aşarsa
           * en güncel görseli korumak için eski görseli atla.
           */
          if (
            photo.id !==
            job.id
          ) {
            continue;
          }

          throw new Error(
            "Fotoğraf AI analizi için çok büyük. Fotoğrafı küçültüp tekrar yükle.",
          );
        }

        images.push(
          image,
        );

        totalImageBytes +=
          image.byteLength;
      }

      if (
        !images.length
      ) {
        throw new Error(
          "Analiz edilecek fotoğraf açılamadı.",
        );
      }

      await admin
        .from(
          "ai_image_analysis_jobs",
        )
        .update({
          status: "failed",
          error_message:
            "Yeni analiz başlatıldığı için önceki bekleyen iş kapatıldı.",
          updated_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "user_id",
          userId,
        )
        .eq(
          "status",
          "pending",
        )
        .neq(
          "id",
          jobId,
        );

      const startedAt =
        new Date()
          .toISOString();

      await admin
        .from(
          "ai_image_analysis_jobs",
        )
        .update({
          status:
            "processing",

          started_at:
            startedAt,

          attempt_count:
            Number(
              job.attempt_count ??
              0,
            ) + 1,

          provider:
            cloudflareConfigured
              ? "cloudflare"
              : "google",

          // İşleme başlarken varsayılan sağlayıcıyı yazarız.
          // Tamamlanınca gerçek provider/model sonucu aşağıda güncellenir.
          model:
            cloudflareConfigured
              ? CLOUDFLARE_AI_MODEL
              : GEMINI_MODEL,

          access_usage_id:
            accessUsageId,

          error_message:
            null,

          updated_at:
            startedAt,
        })
        .eq(
          "id",
          jobId,
        )
        .eq(
          "user_id",
          userId,
        );

      let providerResult;

      try {
        providerResult =
          await analyzeWithProviderRouter(
            geminiApiKey,
            prompt,
            images,
          );
      } catch (error) {
        if (
          isAbortError(
            error,
          )
        ) {
          throw new Error(
            "Görsel AI sağlayıcısı zaman aşımına uğradı.",
          );
        }

        throw error;
      }

      const analysis =
        providerResult.analysis;

      const completedAt =
        new Date()
          .toISOString();

      const resolved =
        !analysis.needsMoreEvidence &&
        analysis.status !==
          "uncertain";

      await admin
        .from(
          "ai_image_analysis_jobs",
        )
        .update({
          status:
            "completed",

          analysis,

          provider:
            providerResult.provider ??
            "google",

          model:
            providerResult.modelUsed ??
            GEMINI_MODEL,

          access_usage_id:
            accessUsageId,

          completed_at:
            completedAt,

          updated_at:
            completedAt,

          error_message:
            null,

          diagnosis_session_id:
            session.id,
        })
        .eq(
          "id",
          jobId,
        )
        .eq(
          "user_id",
          userId,
        );

      await admin
        .from(
          "ai_diagnosis_sessions",
        )
        .update({
          status:
            resolved
              ? "resolved"
              : "active",

          current_analysis:
            analysis,

          requested_evidence:
            resolved
              ? null
              : analysis.followUpPhoto,

          updated_at:
            completedAt,

          resolved_at:
            resolved
              ? completedAt
              : null,
        })
        .eq(
          "id",
          session.id,
        )
        .eq(
          "user_id",
          userId,
        );

      console.log(
        "[PUSULA_AI_PROVIDER_SUCCESS]",
        {
          jobId,
          provider:
            providerResult.provider,
          model:
            providerResult.modelUsed,

          imageCount:
            images.length,

          totalImageBytes,

          fallbackUsed:
            Boolean(
              providerResult.fallbackUsed,
            ),

          usage:
            providerResult.usage,
        },
      );

      return reply({
        analysis,

        diagnosisSessionId:
          session.id,

        sequenceNo:
          Number(
            job.sequence_no ??
            1,
          ),

        sessionStatus:
          resolved
            ? "resolved"
            : "active",

        needsMoreEvidence:
          !resolved,

        requestedEvidence:
          resolved
            ? null
            : analysis.followUpPhoto,

        provider:
          providerResult.provider ??
          "google",

        modelUsed:
          providerResult.modelUsed ??
          GEMINI_MODEL,

        fallbackUsed:
          Boolean(
            providerResult.fallbackUsed,
          ),

        providerAttempt:
          Number(
            providerResult.attempt ??
            1,
          ),

        usage:
          providerResult.usage,

        access: {
          plan:
            consumedAccess?.plan ??
            "free",

          dailyFreeUsed:
            true,

          freeRemaining:
            0,

          rewardCredits:
            Number(
              consumedAccess?.reward_credits ??
              0,
            ),

          unlimited:
            Boolean(
              consumedAccess?.unlimited,
            ),

          source:
            consumedAccess?.access_source ??
            null,
        },
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Bilinmeyen hata";

      console.error(
        "Pusula Gemini diagnosis error",
        error,
      );

      if (accessUsageId) {
        try {
          const { error: refundError } =
            await userClient.rpc(
              "refund_ai_access",
              {
                p_usage_id:
                  accessUsageId,
              },
            );

          if (refundError) {
            console.warn(
              "[PUSULA_AI_ACCESS_REFUND_FAILED]",
              refundError,
            );
          } else {
            accessUsageId =
              null;
          }
        } catch (refundError) {
          console.warn(
            "[PUSULA_AI_ACCESS_REFUND_FAILED]",
            refundError,
          );
        }
      }

      if (jobId) {
        await admin
          .from(
            "ai_image_analysis_jobs",
          )
          .update({
            status:
              "failed",

            provider:
              cloudflareConfigured
                ? "cloudflare"
                : "google",

            model:
              cloudflareConfigured
                ? CLOUDFLARE_AI_MODEL
                : GEMINI_MODEL,

            error_message:
              message.slice(
                0,
                1000,
              ),

            access_usage_id:
              accessUsageId,

            updated_at:
              new Date()
                .toISOString(),
          })
          .eq(
            "id",
            jobId,
          )
          .eq(
            "user_id",
            userId,
          );
      }

      return reply({
        error:
          message,

        userMessage:
          message.includes(
            "kota",
          ) ||
          message.includes(
            "hız limiti",
          ) ||
          message.includes(
            "AI sağlayıcı geçici",
          ) ||
          message.includes(
            "geçici servis",
          )
            ? "Pusula AI sağlayıcısı şu an yoğun. Otomatik yeniden denemeler tamamlandı; fotoğrafın ve tarla kaydın korunuyor. Biraz sonra tekrar deneyebilirsin."
            : "Pusula AI fotoğrafı şu anda analiz edemedi; fotoğraf ve tarla kaydı korunuyor.",
      });
    }
  },
);
