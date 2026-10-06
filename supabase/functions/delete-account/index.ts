import { createClient } from "npm:@supabase/supabase-js@2.112.4";
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "npm:@aws-sdk/client-s3@3.883.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

const USER_TABLES = [
  "activities",
  "activity_expenses",
  "ad_reward_claims",
  "admin_users",
  "admob_reward_receipts",
  "ai_diagnosis_sessions",
  "ai_image_analysis_jobs",
  "ai_reward_credits",
  "ai_usage",
  "app_issue_reports",
  "app_notifications",
  "calendar_reminders",
  "content_ratings",
  "crop_storage_environment_observations",
  "crop_storage_lots",
  "farm_inventory_products",
  "field_activity_notification_state",
  "field_ai_analyses",
  "field_ai_observations",
  "field_aquacrop_management",
  "field_biophysical_snapshots",
  "field_climate_layer_snapshots",
  "field_crop_validation_snapshots",
  "field_data_events",
  "field_data_snapshots",
  "field_dssat_planting_management",
  "field_event_candidate_feedback",
  "field_external_identifiers",
  "field_frost_events",
  "field_growth_observations",
  "field_irrigation_distribution_observations",
  "field_irrigation_economics",
  "field_irrigation_event_validations",
  "field_irrigation_kc_snapshots",
  "field_lab_analyses",
  "field_map_layer_cache",
  "field_notes",
  "field_nutrition_intelligence_snapshots",
  "field_observation_comparisons",
  "field_observation_photos",
  "field_observation_points",
  "field_pcse_parameter_sets",
  "field_phenology_intelligence_snapshots",
  "field_phenology_notification_state",
  "field_photo_nutrient_preassessments",
  "field_risk_intelligence_snapshots",
  "field_risk_notification_state",
  "field_satellite_fusion_snapshots",
  "field_satellite_notification_state",
  "field_seasons",
  "field_sections",
  "field_sensor_devices",
  "field_sensor_observations",
  "field_todos",
  "field_water_budgets",
  "field_water_intelligence_snapshots",
  "field_water_measurements",
  "fields",
  "gamification_transactions",
  "harvest_quality_measurements",
  "map_ai_analyses",
  "model_engine_readiness_snapshots",
  "model_engine_runs",
  "model_shadow_calibration_states",
  "model_shadow_comparisons",
  "native_push_tokens",
  "official_verification_events",
  "onboarding_answers",
  "orchard_tracking_zones",
  "orchard_tree_observations",
  "orchard_trees",
  "perennial_yields",
  "price_alerts",
  "push_subscriptions",
  "pusula_daily_brief",
  "pusula_experiment_states",
  "pusula_feedback",
  "pusula_field_context_snapshots",
  "pusula_insights",
  "pusulapdf_jobs",
  "scientific_engine_evidence",
  "soil_analyses",
  "subscription_webhook_events",
  "user_gamification",
  "user_notification_preferences",
  "weekly_field_reports",
] as const;

const EXTRA_R2_NAMESPACES = [
  "field_observation_photos",
  "pusulapdf",
  "pusulapdf-reports",
];

function bearerToken(req: Request) {
  const raw = req.headers.get("authorization") ?? "";
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

function normalizeR2AccountId(raw: string) {
  return raw
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.r2\.cloudflarestorage\.com.*$/i, "")
    .replace(/\/+$/g, "");
}

function createR2Client() {
  const accountId = normalizeR2AccountId(
    Deno.env.get("R2_ACCOUNT_ID") ?? "",
  );
  const accessKeyId = (Deno.env.get("R2_ACCESS_KEY_ID") ?? "").trim();
  const secretAccessKey = (
    Deno.env.get("R2_SECRET_ACCESS_KEY") ?? ""
  ).trim();
  const bucket = (Deno.env.get("R2_BUCKET_NAME") ?? "").trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    return null;
  }

  return {
    bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  };
}

async function hasR2References(admin: any, userId: string) {
  const checks = await Promise.all([
    admin
      .from("activities")
      .select("id")
      .eq("user_id", userId)
      .like("photo_path", "r2:%")
      .limit(1),
    admin
      .from("ai_image_analysis_jobs")
      .select("id")
      .eq("user_id", userId)
      .like("storage_path", "r2:%")
      .limit(1),
    admin
      .from("field_observation_photos")
      .select("id")
      .eq("user_id", userId)
      .like("storage_path", "r2:%")
      .limit(1),
  ]);

  for (const result of checks) {
    if (result.error) {
      throw new Error("R2 kullanıcı verisi kontrol edilemedi.");
    }
    if ((result.data ?? []).length > 0) return true;
  }

  return false;
}

async function clearR2Prefix(
  client: S3Client,
  bucket: string,
  prefix: string,
) {
  let deleted = 0;

  for (let round = 0; round < 200; round += 1) {
    const listed = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: 1000,
      }),
    );

    const keys = (listed.Contents ?? [])
      .map((item) => item.Key)
      .filter((key): key is string => Boolean(key));

    if (!keys.length) break;

    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: {
          Quiet: true,
          Objects: keys.map((Key) => ({ Key })),
        },
      }),
    );

    deleted += keys.length;
  }

  return deleted;
}

async function removeR2Data(admin: any, userId: string) {
  const hasRefs = await hasR2References(admin, userId);
  const r2 = createR2Client();

  if (hasRefs && !r2) {
    throw new Error(
      "Hesaba ait dış dosyalar bulundu ancak güvenli silme bağlantısı hazır değil.",
    );
  }

  if (!r2) return 0;

  const buckets = await admin.storage.listBuckets();
  if (buckets.error) {
    throw new Error("Dosya alanları listelenemedi.");
  }

  const namespaces = new Set<string>([
    ...(buckets.data ?? []).map((item: any) => String(item.id || item.name || "")),
    ...EXTRA_R2_NAMESPACES,
  ]);

  let deleted = 0;
  for (const namespace of namespaces) {
    if (!namespace) continue;
    deleted += await clearR2Prefix(
      r2.client,
      r2.bucket,
      `${namespace}/${userId}/`,
    );
  }

  return deleted;
}

async function collectOwnedStorageObjects(
  admin: any,
  bucketId: string,
  userId: string,
) {
  const owned: string[] = [];
  let scanned = 0;
  const scanLimit = 25_000;

  const walk = async (prefix = ""): Promise<void> => {
    for (let offset = 0; ; offset += 100) {
      const listed = await admin.storage.from(bucketId).list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (listed.error) {
        throw new Error(`Dosya alanı okunamadı: ${bucketId}`);
      }

      const entries = listed.data ?? [];
      for (const entry of entries) {
        const name = String(entry.name ?? "").trim();
        if (!name) continue;

        const path = prefix ? `${prefix}/${name}` : name;
        const isFile = Boolean(entry.id);

        if (isFile) {
          scanned += 1;
          if (scanned > scanLimit) {
            throw new Error(
              "Hesap dosyaları güvenli sınırlar içinde taranamadı. Destek gerekli.",
            );
          }

          const ownerId = String(
            entry.owner_id ?? entry.owner ?? "",
          ).trim();

          if (
            ownerId === userId ||
            path === userId ||
            path.startsWith(`${userId}/`)
          ) {
            owned.push(path);
          }
        } else {
          await walk(path);
        }
      }

      if (entries.length < 100) break;
    }
  };

  await walk();
  return owned;
}

async function removeSupabaseStorage(admin: any, userId: string) {
  const buckets = await admin.storage.listBuckets();
  if (buckets.error) {
    throw new Error("Dosya alanları listelenemedi.");
  }

  let deleted = 0;

  for (const bucket of buckets.data ?? []) {
    const bucketId = String((bucket as any).id ?? "").trim();
    if (!bucketId) continue;

    const owned = await collectOwnedStorageObjects(
      admin,
      bucketId,
      userId,
    );

    for (let index = 0; index < owned.length; index += 100) {
      const chunk = owned.slice(index, index + 100);
      const removed = await admin.storage.from(bucketId).remove(chunk);
      if (removed.error) {
        throw new Error(`Kullanıcı dosyaları silinemedi: ${bucketId}`);
      }
      deleted += chunk.length;
    }
  }

  return deleted;
}

async function removeDatabaseRows(admin: any, userId: string) {
  const pending = new Map<string, string>(
    USER_TABLES.map((table) => [table, "not attempted"]),
  );

  for (let pass = 0; pass < 10 && pending.size; pass += 1) {
    let progress = 0;

    for (const table of [...pending.keys()]) {
      const result = await admin
        .from(table)
        .delete()
        .eq("user_id", userId);

      if (!result.error) {
        pending.delete(table);
        progress += 1;
      } else {
        pending.set(table, result.error.message);
      }
    }

    if (!progress) break;
  }

  if (pending.size) {
    console.error("[delete-account] unresolved table cleanup", {
      userId,
      tables: [...pending.entries()],
    });
    throw new Error(
      "Hesap verilerinin tamamı güvenli biçimde silinemedi. İşlem durduruldu.",
    );
  }

  const profile = await admin
    .from("profiles")
    .delete()
    .eq("id", userId);

  if (profile.error) {
    throw new Error("Profil kaydı silinemedi.");
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return reply({ error: "Method not allowed" }, 405);
  }

  const token = bearerToken(req);
  if (!token) {
    return reply({ error: "Oturum gerekli." }, 401);
  }

  const supabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
  const serviceRoleKey = (
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  ).trim();

  if (!supabaseUrl || !serviceRoleKey) {
    return reply({ error: "Sunucu yapılandırması eksik." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });

  const auth = await admin.auth.getUser(token);
  if (auth.error || !auth.data.user) {
    return reply({ error: "Geçersiz oturum." }, 401);
  }

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return reply({ error: "Geçersiz istek." }, 400);
  }

  if (body?.confirm !== "DELETE_MY_ACCOUNT") {
    return reply({ error: "Silme onayı eksik." }, 400);
  }

  const userId = auth.data.user.id;

  try {
    const r2Deleted = await removeR2Data(admin, userId);
    const storageDeleted = await removeSupabaseStorage(admin, userId);

    await removeDatabaseRows(admin, userId);

    // Tüm cihazlardaki refresh tokenlarını iptal et.
    await admin.auth.admin.signOut(token, "global").catch((error: unknown) => {
      console.warn("[delete-account] global sign-out warning", error);
    });

    const deletedUser = await admin.auth.admin.deleteUser(userId);
    if (deletedUser.error) {
      throw new Error(
        `Kimlik hesabı silinemedi: ${deletedUser.error.message}`,
      );
    }

    console.log("[delete-account] completed", {
      userId,
      r2Deleted,
      storageDeleted,
    });

    return reply({
      ok: true,
      deleted: {
        r2Objects: r2Deleted,
        storageObjects: storageDeleted,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Hesap silme işlemi tamamlanamadı.";

    console.error("[delete-account] failed", { userId, error });

    return reply(
      {
        error: message,
        userMessage:
          "Hesabın tamamen silinemediği için işlem güvenli biçimde durduruldu. Verilerin kısmen silinmiş olabilir; tekrar dene veya destek kanalını kullan.",
      },
      500,
    );
  }
});
