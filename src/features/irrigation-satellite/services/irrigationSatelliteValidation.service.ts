import { supabase } from '../../../supabaseClient';
import { listRecentFieldOperations } from '../../field-operations/services/fieldOperation.service';
import { fetchFieldSatelliteFusion } from '../../satellite/services/satelliteFusion.service';
import type { SatelliteFusionSeriesPoint } from '../../satellite/types/satelliteFusion';

export type IrrigationSatelliteValidationStatus =
  | 'no_record'
  | 'waiting_for_satellite'
  | 'weather_confounded'
  | 'response_supported'
  | 'response_not_clear'
  | 'uncertain'
  | 'error';

export type IrrigationSatelliteValidation = {
  fieldId: string;
  status: IrrigationSatelliteValidationStatus;
  confidence: 'high' | 'medium' | 'low';
  headline: string;
  summary: string;
  irrigationDate: string | null;
  irrigationOperationId: string | null;
  preRadarDate: string | null;
  postRadarDate: string | null;
  vvDeltaDb: number | null;
  vhDeltaDb: number | null;
  rainBetweenMm: number | null;
  responseScore: number | null;
  evidence: string[];
  generatedAt: string;
  productionAuthority: false;
  satelliteRole: 'supporting-validation';
  caution: string;
};

const CAUTION =
  'Bu katman kayıtlı sulamayı Sentinel-1 radar yanıtıyla karşılaştırır. Uydu yanıtı tek başına sulamanın yapıldığını, verilen su miktarını veya dağılım kalitesini kesin doğrulamaz; yağış, bitki örtüsü, yüzey pürüzlülüğü ve toprak yapısı radar sinyalini etkileyebilir.';

function text(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalize(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i');
}

function finite(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function dateOnly(value: unknown): string | null {
  const raw = text(value);
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T00:00:00Z`);
  return Number.isFinite(parsed) ? match[1] : null;
}

function daysBetween(start: string, end: string) {
  return Math.round(
    (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) /
      86_400_000,
  );
}

function closestBefore(
  series: SatelliteFusionSeriesPoint[],
  eventDate: string,
  maxDays = 14,
) {
  return [...series]
    .filter(
      (row) =>
        row.date < eventDate &&
        daysBetween(row.date, eventDate) <= maxDays,
    )
    .sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
}

function closestAfter(
  series: SatelliteFusionSeriesPoint[],
  eventDate: string,
  maxDays = 14,
) {
  return [...series]
    .filter(
      (row) =>
        row.date > eventDate &&
        daysBetween(eventDate, row.date) <= maxDays,
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0] ?? null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function typicalStep(series: SatelliteFusionSeriesPoint[]) {
  if (series.length < 3) return null;
  const diffs: number[] = [];
  for (let i = 1; i < series.length; i += 1) {
    const delta = Math.abs(series[i].mean - series[i - 1].mean);
    if (Number.isFinite(delta)) diffs.push(delta);
  }
  const value = median(diffs);
  return value === null ? null : Math.max(0.15, value);
}

async function loadWeatherHistory(fieldId: string) {
  const { data, error } = await supabase.functions.invoke<any>(
    'field-risk-weather',
    {
      body: {
        field_id: fieldId,
        mode: 'disaster_history',
      },
    },
  );

  if (error || !data?.ok || !Array.isArray(data?.days)) {
    return [] as Array<{ date: string; precipitation_mm: number | null }>;
  }

  return data.days
    .map((row: any) => ({
      date: dateOnly(row?.date) ?? '',
      precipitation_mm: finite(row?.precipitation_mm),
    }))
    .filter((row: any) => Boolean(row.date));
}

function rainfallBetween(
  days: Array<{ date: string; precipitation_mm: number | null }>,
  startDate: string,
  endDate: string,
) {
  const values = days.filter(
    (row) => row.date >= startDate && row.date <= endDate,
  );

  if (!values.length) return null;

  let total = 0;
  let found = false;

  for (const row of values) {
    if (row.precipitation_mm === null) continue;
    total += Math.max(0, row.precipitation_mm);
    found = true;
  }

  return found ? Number(total.toFixed(1)) : null;
}

function emptyResult(
  fieldId: string,
  input: Partial<IrrigationSatelliteValidation>,
): IrrigationSatelliteValidation {
  return {
    fieldId,
    status: input.status ?? 'uncertain',
    confidence: input.confidence ?? 'low',
    headline: input.headline ?? 'Sulama uydu doğrulaması belirsiz',
    summary:
      input.summary ??
      'Sulama kaydı ile uydu gözlemi henüz güvenilir biçimde eşleştirilemedi.',
    irrigationDate: input.irrigationDate ?? null,
    irrigationOperationId: input.irrigationOperationId ?? null,
    preRadarDate: input.preRadarDate ?? null,
    postRadarDate: input.postRadarDate ?? null,
    vvDeltaDb: input.vvDeltaDb ?? null,
    vhDeltaDb: input.vhDeltaDb ?? null,
    rainBetweenMm: input.rainBetweenMm ?? null,
    responseScore: input.responseScore ?? null,
    evidence: input.evidence ?? [],
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    productionAuthority: false,
    satelliteRole: 'supporting-validation',
    caution: CAUTION,
  };
}


async function persistValidation(
  result: IrrigationSatelliteValidation,
): Promise<IrrigationSatelliteValidation> {
  if (
    !result.fieldId ||
    !result.irrigationOperationId ||
    !result.irrigationDate ||
    result.status === 'no_record'
  ) {
    return result;
  }

  try {
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user?.id;
    if (!userId) return result;

    const persistableStatus =
      result.status === 'waiting_for_satellite' ||
      result.status === 'weather_confounded' ||
      result.status === 'response_supported' ||
      result.status === 'response_not_clear' ||
      result.status === 'uncertain' ||
      result.status === 'error'
        ? result.status
        : 'uncertain';

    const { error } = await supabase
      .from('field_irrigation_event_validations')
      .upsert(
        {
          user_id: userId,
          field_id: result.fieldId,
          irrigation_operation_id: result.irrigationOperationId,
          irrigation_date: result.irrigationDate,
          pre_radar_date: result.preRadarDate,
          post_radar_date: result.postRadarDate,
          status: persistableStatus,
          confidence: result.confidence,
          vv_delta_db: result.vvDeltaDb,
          vh_delta_db: result.vhDeltaDb,
          rain_between_mm: result.rainBetweenMm,
          response_score: result.responseScore,
          evidence: result.evidence,
          caution: result.caution,
          generated_at: result.generatedAt,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,field_id,irrigation_operation_id',
        },
      );

    if (error) {
      console.warn(
        '[irrigation-satellite] doğrulama kalıcılaştırılamadı:',
        error.message,
      );
    }
  } catch (reason) {
    console.warn(
      '[irrigation-satellite] kalıcılaştırma atlandı:',
      reason,
    );
  }

  return result;
}

export async function loadIrrigationSatelliteValidation(
  fieldIdInput: string,
  force = false,
): Promise<IrrigationSatelliteValidation> {
  const fieldId = text(fieldIdInput);
  if (!fieldId) {
    return emptyResult('', {
      status: 'error',
      headline: 'Tarla seçilemedi',
      summary: 'Sulama uydu doğrulaması için tarla kimliği gerekli.',
    });
  }

  const operations = await listRecentFieldOperations(fieldId, 120, 100);
  const latestIrrigation =
    operations.find((item) => normalize(item.type) === 'sulama') ?? null;

  if (!latestIrrigation) {
    return emptyResult(fieldId, {
      status: 'no_record',
      headline: 'Uydu doğrulaması için sulama kaydı yok',
      summary:
        'Sulama işlemi kaydedildiğinde Pusula olayın öncesindeki ve sonrasındaki Sentinel-1 radar gözlemlerini karşılaştırır.',
    });
  }

  const irrigationDate = dateOnly(latestIrrigation.date);
  if (!irrigationDate) {
    return emptyResult(fieldId, {
      status: 'uncertain',
      irrigationOperationId: String(latestIrrigation.id),
      headline: 'Sulama tarihi okunamadı',
      summary: 'Uydu karşılaştırması için geçerli bir sulama tarihi gerekli.',
    });
  }

  const [fusion, weatherDays] = await Promise.all([
    fetchFieldSatelliteFusion(fieldId, force),
    loadWeatherHistory(fieldId),
  ]);

  const vvSeries = fusion.radar?.vvDb?.series ?? [];
  const vhSeries = fusion.radar?.vhDb?.series ?? [];

  const vvBefore = closestBefore(vvSeries, irrigationDate, 14);
  const vvAfter = closestAfter(vvSeries, irrigationDate, 14);
  const vhBefore = closestBefore(vhSeries, irrigationDate, 14);
  const vhAfter = closestAfter(vhSeries, irrigationDate, 14);

  const preRadarDate = vhBefore?.date ?? vvBefore?.date ?? null;
  const postRadarDate = vhAfter?.date ?? vvAfter?.date ?? null;

  if (!preRadarDate || !postRadarDate) {
    return persistValidation(
      emptyResult(fieldId, {
        status: 'waiting_for_satellite',
        irrigationDate,
        irrigationOperationId: String(latestIrrigation.id),
        preRadarDate,
        postRadarDate,
        headline: 'Sulama sonrası Sentinel-1 gözlemi bekleniyor',
        summary:
          'Sulama kaydı var ancak olayın öncesi ve sonrasını karşılaştıracak uygun radar çifti henüz oluşmadı.',
        evidence: [`Kayıtlı sulama: ${irrigationDate}.`],
      }),
    );
  }

  const vvDeltaDb =
    vvBefore && vvAfter
      ? Number((vvAfter.mean - vvBefore.mean).toFixed(3))
      : null;
  const vhDeltaDb =
    vhBefore && vhAfter
      ? Number((vhAfter.mean - vhBefore.mean).toFixed(3))
      : null;

  const vvNoise = typicalStep(vvSeries);
  const vhNoise = typicalStep(vhSeries);
  const vvScore =
    vvDeltaDb !== null && vvNoise !== null
      ? Math.max(0, vvDeltaDb / vvNoise)
      : 0;
  const vhScore =
    vhDeltaDb !== null && vhNoise !== null
      ? Math.max(0, vhDeltaDb / vhNoise)
      : 0;
  const responseScore = Number(Math.max(vvScore, vhScore).toFixed(2));

  const rainBetweenMm = rainfallBetween(
    weatherDays,
    irrigationDate,
    postRadarDate,
  );

  const rainConfounded =
    rainBetweenMm !== null && rainBetweenMm > 0.5;
  const bothPositive =
    vvDeltaDb !== null &&
    vhDeltaDb !== null &&
    vvDeltaDb > 0 &&
    vhDeltaDb > 0;

  let status: IrrigationSatelliteValidationStatus = 'uncertain';
  let confidence: IrrigationSatelliteValidation['confidence'] = 'low';
  let headline = 'Sulama sonrası radar yanıtı belirsiz';
  let summary =
    'Radar değişimi var ancak kayıtlı sulamayla güvenilir biçimde eşleştirmek için kanıt gücü sınırlı.';

  if (rainConfounded) {
    status = 'weather_confounded';
    confidence = 'low';
    headline = 'Sulama doğrulaması yağış nedeniyle karışık';
    summary =
      'Sulama ile sonraki radar gözlemi arasında yağış var. Radar nem değişiminin sulamadan mı yağıştan mı kaynaklandığı ayrıştırılamıyor.';
  } else if (responseScore >= 2.5 && bothPositive) {
    status = 'response_supported';
    confidence = 'high';
    headline = 'Uydu yanıtı kayıtlı sulamayla uyumlu';
    summary =
      'Sulama sonrası Sentinel-1 VV ve VH geri-saçılımı tarlanın kendi yakın dönem değişkenliğinin belirgin üzerinde arttı. Bu, kayıtlı sulama olayıyla uyumlu destek kanıtıdır.';
  } else if (
    responseScore >= 1.5 &&
    ((vvDeltaDb ?? 0) > 0 || (vhDeltaDb ?? 0) > 0)
  ) {
    status = 'response_supported';
    confidence = 'medium';
    headline = 'Uydu yanıtı sulama olayıyla uyumlu olabilir';
    summary =
      'Sulama sonrası en az bir Sentinel-1 kanalı tarlanın tipik yakın dönem değişkenliğinin üzerinde arttı. Tek başına kesin sulama doğrulaması değildir.';
  } else if (responseScore < 0.6) {
    status = 'response_not_clear';
    confidence = 'medium';
    headline = 'Sulama sonrası belirgin radar yanıtı görülmedi';
    summary =
      'Uygun radar gözlemi mevcut ancak kayıtlı sulama sonrası değişim tarlanın tipik radar oynaklığından belirgin şekilde ayrışmadı. Bu, sulamanın yapılmadığı anlamına gelmez.';
  }

  const evidence = [
    `Kayıtlı sulama: ${irrigationDate}.`,
    `Radar karşılaştırması: ${preRadarDate} → ${postRadarDate}.`,
    vvDeltaDb !== null
      ? `VV değişimi ${vvDeltaDb >= 0 ? '+' : ''}${vvDeltaDb.toFixed(2)} dB.`
      : '',
    vhDeltaDb !== null
      ? `VH değişimi ${vhDeltaDb >= 0 ? '+' : ''}${vhDeltaDb.toFixed(2)} dB.`
      : '',
    rainBetweenMm !== null
      ? `Ara dönem toplam yağış ${rainBetweenMm.toFixed(1)} mm.`
      : 'Ara dönem yağış verisi alınamadı.',
  ].filter(Boolean);

  return persistValidation(
    emptyResult(fieldId, {
      status,
      confidence,
      headline,
      summary,
      irrigationDate,
      irrigationOperationId: String(latestIrrigation.id),
      preRadarDate,
      postRadarDate,
      vvDeltaDb,
      vhDeltaDb,
      rainBetweenMm,
      responseScore,
      evidence,
    }),
  );
}
