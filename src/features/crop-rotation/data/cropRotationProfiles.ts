import type { CropRotationCropProfile } from '../types/cropRotation';

/**
 * Bu profiller sayısal gübre/su reçetesi değildir. Rotasyon motoruna yalnızca
 * ürün ailesi, göreli su baskısı ve baklagil/non-baklagil ayrımı gibi planlama
 * sınıfları sağlar. Kesin bölgesel uygunluk kullanıcı/saha verileriyle ayrıca
 * doğrulanmalıdır.
 */
export const CROP_ROTATION_PROFILES: CropRotationCropProfile[] = [
  {
    key: 'wheat',
    label: 'Buğday',
    aliases: ['buğday', 'bugday', 'wheat', 'triticum'],
    family: 'cereal',
    waterDemand: 'medium',
    nitrogenRole: 'demanding',
    agronomicTags: ['winter-cereal', 'grass-family'],
  },
  {
    key: 'barley',
    label: 'Arpa',
    aliases: ['arpa', 'barley', 'hordeum'],
    family: 'cereal',
    waterDemand: 'low',
    nitrogenRole: 'demanding',
    agronomicTags: ['winter-cereal', 'grass-family'],
  },
  {
    key: 'maize',
    label: 'Mısır',
    aliases: ['mısır', 'misir', 'maize', 'corn', 'zea mays'],
    family: 'cereal',
    waterDemand: 'high',
    nitrogenRole: 'demanding',
    agronomicTags: ['summer-cereal', 'grass-family'],
  },
  {
    key: 'sunflower',
    label: 'Ayçiçeği',
    aliases: ['ayçiçeği', 'aycicegi', 'sunflower', 'helianthus'],
    family: 'oilseed',
    waterDemand: 'medium',
    nitrogenRole: 'neutral',
    agronomicTags: ['oilseed', 'broadleaf'],
  },
  {
    key: 'canola',
    label: 'Kanola',
    aliases: ['kanola', 'kolza', 'rapeseed', 'canola'],
    family: 'oilseed',
    waterDemand: 'medium',
    nitrogenRole: 'demanding',
    agronomicTags: ['oilseed', 'brassica'],
  },
  {
    key: 'chickpea',
    label: 'Nohut',
    aliases: ['nohut', 'chickpea', 'cicer arietinum'],
    family: 'legume',
    waterDemand: 'low',
    nitrogenRole: 'benefit',
    agronomicTags: ['pulse', 'legume'],
  },
  {
    key: 'lentil',
    label: 'Mercimek',
    aliases: ['mercimek', 'lentil', 'lens culinaris'],
    family: 'legume',
    waterDemand: 'low',
    nitrogenRole: 'benefit',
    agronomicTags: ['pulse', 'legume'],
  },
  {
    key: 'dry-bean',
    label: 'Kuru Fasulye',
    aliases: ['kuru fasulye', 'fasulye', 'dry bean', 'bean', 'phaseolus vulgaris'],
    family: 'legume',
    waterDemand: 'medium',
    nitrogenRole: 'benefit',
    agronomicTags: ['pulse', 'legume'],
  },
  {
    key: 'pea',
    label: 'Bezelye',
    aliases: ['bezelye', 'pea', 'pisum sativum'],
    family: 'legume',
    waterDemand: 'medium',
    nitrogenRole: 'benefit',
    agronomicTags: ['pulse', 'legume'],
  },
  {
    key: 'soybean',
    label: 'Soya',
    aliases: ['soya', 'soya fasulyesi', 'soybean', 'glycine max'],
    family: 'legume',
    waterDemand: 'high',
    nitrogenRole: 'benefit',
    agronomicTags: ['oilseed', 'legume'],
  },
  {
    key: 'cotton',
    label: 'Pamuk',
    aliases: ['pamuk', 'cotton', 'gossypium'],
    family: 'fiber',
    waterDemand: 'high',
    nitrogenRole: 'demanding',
    agronomicTags: ['fiber', 'broadleaf'],
  },
  {
    key: 'sugar-beet',
    label: 'Şeker Pancarı',
    aliases: ['şeker pancarı', 'seker pancari', 'sugar beet', 'beta vulgaris'],
    family: 'root_tuber',
    waterDemand: 'high',
    nitrogenRole: 'demanding',
    agronomicTags: ['root-crop', 'broadleaf'],
  },
  {
    key: 'potato',
    label: 'Patates',
    aliases: ['patates', 'potato', 'solanum tuberosum'],
    family: 'root_tuber',
    waterDemand: 'high',
    nitrogenRole: 'demanding',
    agronomicTags: ['tuber', 'solanaceae'],
  },
  {
    key: 'rice',
    label: 'Çeltik',
    aliases: ['çeltik', 'celtik', 'pirinç', 'pirinc', 'rice', 'oryza sativa'],
    family: 'rice',
    waterDemand: 'high',
    nitrogenRole: 'demanding',
    agronomicTags: ['paddy', 'grass-family'],
  },
];

function normalize(value: unknown) {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function findCropRotationProfile(value: unknown) {
  const needle = normalize(value);
  if (!needle) return null;

  return CROP_ROTATION_PROFILES.find((profile) => {
    if (normalize(profile.key) === needle || normalize(profile.label) === needle) return true;
    return profile.aliases.some((alias) => normalize(alias) === needle);
  }) ?? null;
}

export function cropRotationProfileByKey(key: string) {
  return CROP_ROTATION_PROFILES.find((profile) => profile.key === key) ?? null;
}

export function canonicalCropRotationKey(value: unknown) {
  return findCropRotationProfile(value)?.key ?? null;
}
