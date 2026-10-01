import type { Field } from '../../../types';
import {
  CROP_MODE_PROFILES,
  GENERIC_CROP_MODE_PROFILE,
} from '../data/cropModeProfiles';
import type {
  CropModeModule,
  CropModeProfile,
  CropModeRuntime,
  CropModeRuntimeTag,
} from '../types/cropMode';

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function moveFront<T>(items: T[], front: T[]) {
  const wanted = new Set(front);
  return unique([...front, ...items.filter((item) => !wanted.has(item))]);
}

function without<T>(items: T[], blocked: T[]) {
  const set = new Set(blocked);
  return items.filter((item) => !set.has(item));
}

export function resolveCropModeProfile(crop: unknown): {
  profile: CropModeProfile;
  matchedAlias: string | null;
  fallback: boolean;
} {
  const normalizedCrop = normalize(crop);

  if (!normalizedCrop) {
    return {
      profile: GENERIC_CROP_MODE_PROFILE,
      matchedAlias: null,
      fallback: true,
    };
  }

  let best: { profile: CropModeProfile; alias: string; score: number } | null = null;

  for (const profile of CROP_MODE_PROFILES) {
    for (const alias of profile.aliases) {
      const normalizedAlias = normalize(alias);
      if (!normalizedAlias) continue;

      let score = 0;
      if (normalizedCrop === normalizedAlias) score = 1000 + normalizedAlias.length;
      else if (normalizedCrop.startsWith(`${normalizedAlias} `)) score = 700 + normalizedAlias.length;
      else if (normalizedCrop.includes(normalizedAlias)) score = 500 + normalizedAlias.length;

      if (score > (best?.score ?? 0)) {
        best = { profile, alias, score };
      }
    }
  }

  if (!best) {
    return {
      profile: GENERIC_CROP_MODE_PROFILE,
      matchedAlias: null,
      fallback: true,
    };
  }

  return {
    profile: best.profile,
    matchedAlias: best.alias,
    fallback: false,
  };
}

function resolveCropCycle(field: Field | Record<string, unknown>, profile: CropModeProfile) {
  const raw = String(
    (field as any)?.cropCycle ??
      (field as any)?.crop_cycle ??
      '',
  ).toLocaleLowerCase('tr-TR');

  if (raw === 'perennial') return 'perennial' as const;
  if (raw === 'annual') return 'annual' as const;
  if (profile.cropCycle === 'perennial') return 'perennial' as const;
  return 'annual' as const;
}

function resolveIrrigationStatus(field: Field | Record<string, unknown>) {
  const raw = normalize(
    (field as any)?.irrigationStatus ??
      (field as any)?.irrigation_status,
  );

  if (['rainfed', 'kuru', 'kuru tarim', 'kuru tarım'].includes(raw)) return 'rainfed' as const;
  if (['irrigated', 'sulu', 'sulu tarim', 'sulu tarım'].includes(raw)) return 'irrigated' as const;
  if (['partial', 'kismi', 'kismi sulama', 'kısmi'].includes(raw)) return 'partial' as const;
  return 'unknown' as const;
}

export function buildCropModeRuntime(
  field: Field | Record<string, unknown>,
): CropModeRuntime {
  const cropName = String(
    (field as any)?.crop ??
      (field as any)?.cropName ??
      (field as any)?.product ??
      '',
  ).trim() || null;

  const { profile, matchedAlias, fallback } = resolveCropModeProfile(cropName);
  const cropCycle = resolveCropCycle(field, profile);
  const irrigationStatus = resolveIrrigationStatus(field);
  const bearingRaw = (field as any)?.bearing;
  const bearing = typeof bearingRaw === 'boolean' ? bearingRaw : null;

  const runtimeTags: CropModeRuntimeTag[] = [cropCycle];
  if (irrigationStatus === 'rainfed') runtimeTags.push('rainfed');
  if (irrigationStatus === 'irrigated') runtimeTags.push('irrigated');
  if (irrigationStatus === 'partial') runtimeTags.push('partial_irrigation');
  if (bearing === true) runtimeTags.push('bearing');
  if (bearing === false) runtimeTags.push('non_bearing');

  let subMode: CropModeRuntime['subMode'] = 'standard';
  let priorityModules = [...profile.priorityModules];
  let priorityRisks = [...profile.priorityRisks];
  let summaryCards = [...profile.summaryCards];
  let assistantGoals = [...profile.assistantGoals];
  let notificationTopics = [...profile.notificationTopics];

  if (profile.supportsDrylandMode && irrigationStatus === 'rainfed') {
    subMode = 'dryland';
    runtimeTags.push('dryland');
    priorityModules = moveFront(priorityModules, ['risk', 'weather', 'soil', 'phenology'] as CropModeModule[]);
    priorityRisks = moveFront(priorityRisks, ['drought', 'heat', 'water_stress']);
    assistantGoals = [
      'Kuru tarım modunda yağış, toprak su tutma bağlamı, sıcaklık ve kuraklık sinyallerini önce değerlendir.',
      'Sulama kaydı yoksa kullanıcı sulama yapıyormuş gibi varsayma.',
      ...assistantGoals,
    ];
    notificationTopics = unique(['kuraklık', 'yağış', 'ısı stresi', ...notificationTopics]);
  }

  if (cropCycle === 'perennial' && bearing === false) {
    subMode = 'non_bearing';
    priorityModules = moveFront(
      without(priorityModules, ['harvest']),
      ['phenology', 'nutrition', 'soil', 'risk'] as CropModeModule[],
    );
    summaryCards = without(summaryCards, ['yield_harvest']);
    assistantGoals = [
      'Bu tarla ürün vermeyen çok yıllık olarak kayıtlı; hasat/verim önerisi üretme.',
      'Gelişim, taç/örtü, besleme, su ve bitki sağlığı bağlamına odaklan.',
      ...assistantGoals,
    ];
    notificationTopics = notificationTopics.filter((topic) => topic !== 'hasat penceresi');
  }

  const modeLabel =
    subMode === 'dryland'
      ? `${profile.label} · Kuru Tarım`
      : subMode === 'non_bearing'
        ? `${profile.label} · Gelişim Dönemi`
        : profile.label;

  return {
    schemaVersion: 1,
    modeKey: profile.key,
    modeLabel,
    cropName,
    matchedAlias,
    fallback,
    cropCycle,
    subMode,
    runtimeTags: unique(runtimeTags),
    priorityModules: unique(priorityModules),
    priorityRisks: unique(priorityRisks),
    preferredMapLayers: unique(profile.preferredMapLayers),
    summaryCards: unique(summaryCards),
    assistantGoals: unique(assistantGoals),
    notificationTopics: unique(notificationTopics),
    guardrails: [
      'Ürün modu bir yönlendirme/öncelik katmanıdır; tek başına hastalık teşhisi, ilaç dozu veya verim sonucu değildir.',
      'Gerçek saha, hasat, laboratuvar ve kullanıcı kayıtları model/uydu tahminlerinden önceliklidir.',
      'Desteklenmeyen veya belirsiz ürünlerde Genel Ürün Pusulası kullanılır; ürüne özel eşik uydurulmaz.',
    ],
  };
}
