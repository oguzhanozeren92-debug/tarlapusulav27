import { supabase } from '../../../supabaseClient';

export type CropVarietyOption = {
  id: string;
  cropName: string;
  varietyName: string;
  varietyType: string | null;
  registrationYear: number | null;
  usageType: string | null;
  sourceAuthority: string;
  sourceYear: number | null;
  traits: Record<string, unknown>;
};

const CROP_NAME_ALIASES: Record<string, string[]> = {
  'Kolza (Kanola)': ['Kolza', 'Kanola'],
  'Soya Fasulyesi': ['Soya Fasulyesi', 'Soya'],
  'Çukurova Pamuğu': ['Çukurova Pamuğu', 'Pamuk'],
  Kayısı: ['Kayısı', 'Kayisi', 'Apricot'],
  Armut: ['Armut', 'Pear'],
  Ceviz: ['Ceviz', 'Walnut'],
  Üzüm: ['Üzüm', 'Uzum', 'Grape'],
  Dut: ['Dut', 'Mulberry'],
  İğde: ['İğde', 'Igde'],
};

const LOCAL_OFFICIAL_PREFIX = 'official-local:';

type LocalOfficialVarietyCatalog = Record<string, string[]>;

/**
 * Supabase crop_varieties tablosu henüz ilgili ürünü içermiyorsa
 * kullanıcıya boş picker göstermemek için kullanılan RESMÎ fallback.
 *
 * Kaynak:
 * T.C. Tarım ve Orman Bakanlığı · Kayısı Araştırma Enstitüsü
 * "Tescilli Çeşitlerimiz"
 *
 * Bu liste tavsiye/skor üretmez; yalnız çeşit seçimi içindir.
 */
const LOCAL_OFFICIAL_VARIETIES: LocalOfficialVarietyCatalog = {
  Kayısı: [
    'Şekerpare',
    'Aprikoz',
    'Hacıhaliloğlu',
    'Çataloğlu',
    'Kabaaşı',
    'Sakıt-2',
    'Alyanak',
    'Şam',
    'Hasanbey',
    'Soğancı',
    'Eski Malatya',
    'İmrahor',
    'Proyma',
    'Mektep',
    'Karacabey',
    'Roxana',
    'Casna Drenova',
    'Alkaya',
    'Kuru Kabuk',
    'Çöloğlu',
    'Ethembey',
    'İri Bitirgen',
    'Turfanda İzmir',
    'Çiğili İzmir',
    'Stark Early Orange',
    'Ordubat',
    'Mahmudun Eriği',
    'Levent',
    'Luizet',
    'Perfection',
    'Precice De Thryinthe',
    'Precoce De Colomer',
    'Royal',
  ],
  Dut: [
    'Ulukale',
    'Ayaş',
    'Ekşikara',
    'Sarı Aşı',
    'Ichinose',
    'Bal Dut',
    'KAEM Beyazı',
  ],
  Armut: ['Hacı Hamza', 'Limon', 'Williams'],
  İğde: ['Sultani'],
  Ceviz: ['Zengibar', 'Kozdere'],
  Üzüm: ['Banaz Kara', 'Köhnü', 'Kureyş', 'Tahannebi', 'Pütürge Üzümü'],
};

function slugifyVariety(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function localOfficialRows(cropName: string): CropVarietyOption[] {
  const crop = cleanText(cropName);
  const rows = LOCAL_OFFICIAL_VARIETIES[crop] ?? [];
  if (!rows.length) return [];

  return rows.map((varietyName) => ({
    id: `${LOCAL_OFFICIAL_PREFIX}${slugifyVariety(crop)}:${slugifyVariety(varietyName)}`,
    cropName: crop,
    varietyName,
    varietyType: 'Tescilli çeşit',
    registrationYear: null,
    usageType: null,
    sourceAuthority: 'T.C. Tarım ve Orman Bakanlığı · Kayısı Araştırma Enstitüsü',
    sourceYear: 2023,
    traits: {
      source_kind: 'official_local_fallback',
      source_url:
        'https://arastirma.tarimorman.gov.tr/kayisi/menu/6/tescilli-cesitlerimiz',
    },
  }));
}

export function isLocalOfficialVarietyId(value: string | null | undefined) {
  return String(value ?? '').startsWith(LOCAL_OFFICIAL_PREFIX);
}

function cleanText(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeRow(row: any): CropVarietyOption | null {
  const id = cleanText(row?.id);
  const cropName = cleanText(row?.crop_name);
  const varietyName = cleanText(row?.variety_name);
  if (!id || !cropName || !varietyName) return null;

  const registrationYear = Number(row?.registration_year);
  const sourceYear = Number(row?.primary_source_year);

  return {
    id,
    cropName,
    varietyName,
    varietyType: cleanText(row?.variety_type) || null,
    registrationYear: Number.isInteger(registrationYear) ? registrationYear : null,
    usageType: cleanText(row?.usage_type) || null,
    sourceAuthority: cleanText(row?.primary_source_authority) || 'TTSM',
    sourceYear: Number.isInteger(sourceYear) ? sourceYear : null,
    traits:
      row?.traits && typeof row.traits === 'object' && !Array.isArray(row.traits)
        ? row.traits
        : {},
  };
}

async function fetchByCropName(cropName: string) {
  const { data, error } = await supabase
    .from('crop_varieties')
    .select(
      'id,crop_name,variety_name,variety_type,registration_year,usage_type,primary_source_authority,primary_source_year,traits',
    )
    .eq('active', true)
    .ilike('crop_name', cropName)
    .order('variety_name', { ascending: true });

  if (error) throw error;
  return (data ?? [])
    .map(normalizeRow)
    .filter((item): item is CropVarietyOption => Boolean(item));
}

/**
 * Kullanıcı ürün seçtiğinde yalnız kanonik crop_varieties kataloğunu okur.
 * Katalog boşsa çeşit uydurmaz; kullanıcı "Çeşidimi bilmiyorum" ile devam eder.
 */
export async function fetchCropVarieties(cropName: string): Promise<CropVarietyOption[]> {
  const crop = cleanText(cropName);
  if (!crop) return [];

  const candidates = Array.from(new Set([crop, ...(CROP_NAME_ALIASES[crop] ?? [])]));
  const collected = new Map<string, CropVarietyOption>();
  let databaseError: unknown = null;

  for (const candidate of candidates) {
    try {
      const rows = await fetchByCropName(candidate);
      for (const row of rows) collected.set(row.id, row);
    } catch (error) {
      databaseError = error;
    }
  }

  if (collected.size > 0) {
    return [...collected.values()].sort((a, b) =>
      a.varietyName.localeCompare(b.varietyName, 'tr-TR', {
        sensitivity: 'base',
        numeric: true,
      }),
    );
  }

  const officialFallback = localOfficialRows(crop);
  if (officialFallback.length > 0) {
    return officialFallback.sort((a, b) =>
      a.varietyName.localeCompare(b.varietyName, 'tr-TR', {
        sensitivity: 'base',
        numeric: true,
      }),
    );
  }

  if (databaseError) throw databaseError;
  return [];
}
