import type { PusulaPdfSnapshot, PusulaPdfSatellitePoint } from '../types';
import { formatHarvestQualityMeasurements } from '../../yield-quality/services/harvestQualityLabel.service';

export type PusulaEvidence = {
  label: string;
  value: string;
};

export type PusulaInsight = {
  id: string;
  title: string;
  meaning: string;
  action: string;
  evidence: PusulaEvidence[];
  confidence: 'high' | 'medium' | 'limited';
};

export type PusulaPdfGuidance = {
  weeklyHeadline: string;
  weeklySummary: string;
  insights: PusulaInsight[];
  next7Days: string[];
  dataQualityNote: string;
};

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const fmt = (value: number | null | undefined, digits = 3) =>
  finite(value) ? value.toFixed(digits) : 'veri yok';

const orderedPoints = (snapshot: PusulaPdfSnapshot) =>
  [...snapshot.satellite.points]
    .filter((point) => point?.date)
    .sort((a, b) => a.date.localeCompare(b.date));

const validSeries = (
  points: PusulaPdfSatellitePoint[],
  key: 'ndvi' | 'ndmi' | 'ndre' | 'savi' | 'gndvi',
) => points.filter((point) => finite(point[key]));

const delta = (
  points: PusulaPdfSatellitePoint[],
  key: 'ndvi' | 'ndmi' | 'ndre' | 'savi' | 'gndvi',
) => {
  const series = validSeries(points, key);
  if (series.length < 2) return null;
  return (series.at(-1)![key] as number) - (series[0][key] as number);
};

const trendWord = (change: number | null, threshold = 0.025) => {
  if (change === null) return 'ölçülemiyor';
  if (change > threshold) return 'yükseliyor';
  if (change < -threshold) return 'geriliyor';
  return 'yatay seyrediyor';
};

const weatherRows = (snapshot: PusulaPdfSnapshot): any[] => {
  const weather: any = snapshot.weather;
  if (Array.isArray(weather?.history) && weather.history.length) {
    return weather.history;
  }
  if (Array.isArray(weather?.daily) && weather.daily.length) {
    return weather.daily;
  }
  if (Array.isArray(weather?.forecast) && weather.forecast.length) {
    return weather.forecast;
  }
  if (Array.isArray(weather?.providers)) {
    return weather.providers.flatMap((provider: any) =>
      provider?.history ?? provider?.daily ?? provider?.forecast ?? [],
    );
  }
  return [];
};

const firstNumber = (row: any, keys: string[]) => {
  for (const key of keys) {
    if (finite(row?.[key])) return row[key] as number;
  }
  return null;
};

const latestPcseEvidence = (snapshot: PusulaPdfSnapshot) =>
  [...(snapshot.layerArchive ?? [])]
    .filter((item) => item?.layer === 'phenology-pcse-wofost')
    .sort((a, b) => String(a.observedAt ?? '').localeCompare(String(b.observedAt ?? '')))
    .at(-1) ?? null;

const latestAquaCropEvidence = (snapshot: PusulaPdfSnapshot) =>
  [...(snapshot.layerArchive ?? [])]
    .filter((item) => item?.layer === 'irrigation-aquacrop-pilot')
    .sort((a, b) => String(a.observedAt ?? '').localeCompare(String(b.observedAt ?? '')))
    .at(-1) ?? null;

const latestPyFao56Evidence = (snapshot: PusulaPdfSnapshot) =>
  [...(snapshot.layerArchive ?? [])]
    .filter((item) => item?.layer === 'irrigation-pyfao56-dual-kc')
    .sort((a, b) => String(a.observedAt ?? '').localeCompare(String(b.observedAt ?? '')))
    .at(-1) ?? null;

const latestDecisionEvidence = (snapshot: PusulaPdfSnapshot, layer: string) =>
  [...(snapshot.layerArchive ?? [])]
    .filter((item) => item?.layer === layer)
    .sort((a, b) => String(a.observedAt ?? '').localeCompare(String(b.observedAt ?? '')))
    .at(-1) ?? null;


const latestBackboneEvidence = (snapshot: PusulaPdfSnapshot) =>
  [...(snapshot.layerArchive ?? [])]
    .filter((item) => item?.layer === 'field-data-backbone')
    .sort((a, b) => String(a.archivedAt ?? a.observedAt ?? '').localeCompare(String(b.archivedAt ?? b.observedAt ?? '')))
    .at(-1) ?? null;

const backboneMetric = (backbone: any, key: string) => {
  const number = Number(backbone?.metrics?.[key]);
  return Number.isFinite(number) ? number : 0;
};

const backboneEvents = (backbone: any): any[] =>
  Array.isArray(backbone?.details?.events) ? backbone.details.events : [];

const backboneHasEvent = (backbone: any, eventType: string) =>
  backboneEvents(backbone).some(
    (event) => event?.eventType === eventType && event?.mutation !== 'deleted',
  );

const listText = (value: unknown, limit = 3) =>
  Array.isArray(value)
    ? value.map((item) => String(item ?? '').trim()).filter(Boolean).slice(0, limit)
    : [];

const modelMetric = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

export function buildPusulaPdfGuidance(
  snapshot: PusulaPdfSnapshot,
): PusulaPdfGuidance {
  const points = orderedPoints(snapshot);
  const ndviSeries = validSeries(points, 'ndvi');
  const ndmiSeries = validSeries(points, 'ndmi');
  const ndviDelta = delta(points, 'ndvi');
  const ndmiDelta = delta(points, 'ndmi');
  const weather = weatherRows(snapshot).slice(0, 7);
  const rainValues = weather
    .map((row) => firstNumber(row, ['rain', 'precipitation', 'precipitationMm']))
    .filter(finite);
  const totalRain = rainValues.length
    ? rainValues.reduce((sum, value) => sum + value, 0)
    : null;
  const backbone = latestBackboneEvidence(snapshot);
  const backboneEventCount = backboneMetric(backbone, 'activeEventCount') ||
    backboneMetric(backbone, 'eventCount');
  const backboneOperationCount = backboneMetric(backbone, 'operationCount');
  const backboneSoilAnalysisCount = backboneMetric(backbone, 'soilAnalysisCount');
  const backboneWaterMeasurementCount = backboneMetric(backbone, 'waterMeasurementCount');
  const backboneGrowthObservationCount = backboneMetric(backbone, 'growthObservationCount');
  const hasBackboneSoilAnalysis =
    backboneSoilAnalysisCount > 0 || backboneHasEvent(backbone, 'soil_analysis');
  const hasBackboneWaterMeasurement =
    backboneWaterMeasurementCount > 0 || backboneHasEvent(backbone, 'soil_water_measurement');

  const insights: PusulaInsight[] = [];
  const next7Days: string[] = [];

  if (ndviSeries.length >= 2) {
    const ndviDirection = trendWord(ndviDelta);
    const ndmiDirection = trendWord(ndmiDelta);

    let meaning =
      `Bitki gelişim göstergesi son ${ndviSeries.length} gerçek uydu ölçümünde ${ndviDirection}.`;

    if (ndmiSeries.length >= 2) {
      meaning += ` Nem sinyali aynı dönemde ${ndmiDirection}.`;
    }

    if (
      ndviDelta !== null &&
      ndviDelta < -0.025 &&
      ndmiDelta !== null &&
      ndmiDelta < -0.025
    ) {
      meaning +=
        ' İki göstergenin birlikte gerilemesi su stresiyle uyumlu olabilir; bu tek başına kesin neden değildir.';
      next7Days.push(
        'NDVI ve NDMI gerilemesinin görüldüğü alanı sahada kontrol et; yaprak görünümü ve toprak nemini gözlemle.',
      );
    } else if (ndviDelta !== null && ndviDelta < -0.025) {
      meaning +=
        ' Gelişimdeki gerilemenin nedeni yalnız uydu verisiyle belirlenemez; fenoloji ve saha gözlemiyle doğrulanmalıdır.';
      next7Days.push(
        'Gelişimin zayıfladığı alanı yerinde kontrol et ve gerekirse aynı bölgeden Pusula teşhisi için fotoğraf ekle.',
      );
    } else if (ndviDelta !== null && ndviDelta > 0.025) {
      next7Days.push(
        'Gelişim artışını bir sonraki uydu ölçümünde tekrar karşılaştır; ani bölgesel sapmaları takip et.',
      );
    }

    insights.push({
      id: 'vegetation-trend',
      title:
        ndviDelta !== null && ndviDelta < -0.025
          ? 'Bitki gelişiminde gerileme sinyali'
          : ndviDelta !== null && ndviDelta > 0.025
            ? 'Bitki gelişimi güçleniyor'
            : 'Bitki gelişimi dengeli seyrediyor',
      meaning,
      action:
        ndviDelta !== null && ndviDelta < -0.025
          ? 'Önceliği değişimin görüldüğü alanın saha kontrolüne ver.'
          : 'Mevcut seyri koru ve yeni uydu ölçümünde aynı alanları karşılaştır.',
      evidence: [
        {
          label: 'NDVI',
          value: `${fmt(ndviSeries[0]?.ndvi)} → ${fmt(ndviSeries.at(-1)?.ndvi)}`,
        },
        {
          label: 'NDMI',
          value:
            ndmiSeries.length >= 2
              ? `${fmt(ndmiSeries[0]?.ndmi)} → ${fmt(ndmiSeries.at(-1)?.ndmi)}`
              : 'yeterli ölçüm yok',
        },
        { label: 'Uydu ölçümü', value: `${ndviSeries.length} tarih` },
      ],
      confidence: ndmiSeries.length >= 2 ? 'high' : 'medium',
    });
  } else {
    insights.push({
      id: 'satellite-data-limited',
      title: 'Uydu görüntüleri hazır; değişimin yönü için ölçüm bekleniyor',
      meaning:
        'Tarlanın farklı tarihlerdeki uydu görüntüleri hazır. Ancak değişimin güçlenme mi zayıflama mı olduğunu güvenilir biçimde söylemek için en az iki gerçek sayısal ölçüm gerekiyor.',
      action:
        'Şimdilik görüntüleri karşılaştır; belirgin renk veya bölgesel değişim görürsen sahada aynı alanı kontrol et. Ölçümler tamamlandığında Pusula değişimin yönünü ve olası nedenlerini otomatik açıklayacak.',
      evidence: [
        { label: 'Uydu tarihi', value: `${points.length}` },
        { label: 'Geçerli NDVI', value: `${ndviSeries.length}` },
        { label: 'Geçerli NDMI', value: `${ndmiSeries.length}` },
      ],
      confidence: 'limited',
    });
  }

  if (weather.length) {
    let meaning = `${weather.length} günlük hava verisi rapora bağlı.`;
    if (totalRain !== null) {
      meaning += ` Bu görünümde toplam yağış ${totalRain.toFixed(1)} mm.`;
      if (totalRain <= 1) {
        meaning +=
          ' Yağış desteği düşük görünüyor; sulama kararı ürün evresi, toprak ve saha nemiyle birlikte değerlendirilmelidir.';
        next7Days.push(
          'Yağış düşük kalırsa sulama ihtiyacını ürün evresi ve saha/toprak nemiyle birlikte kontrol et.',
        );
      }
    }

    insights.push({
      id: 'weather-water',
      title: 'Hava ve su bağlamı',
      meaning,
      action:
        'Tek başına hava tahminine göre işlem yapma; sulama/fenoloji kaydı ve uydu nem sinyaliyle birlikte değerlendir.',
      evidence: [
        { label: 'Hava günü', value: `${weather.length}` },
        {
          label: 'Yağış',
          value: totalRain === null ? 'veri yok' : `${totalRain.toFixed(1)} mm`,
        },
        {
          label: 'Fenoloji/Kc',
          value: `${snapshot.irrigation.kcSnapshots.length} kayıt`,
        },
      ],
      confidence:
        snapshot.irrigation.kcSnapshots.length > 0 ? 'high' : 'medium',
    });
  }

  if (backbone && backboneEventCount > 0) {
    const memoryPieces = [
      backboneOperationCount > 0 ? `${backboneOperationCount} tarla işlemi` : '',
      hasBackboneSoilAnalysis ? 'toprak analizi' : '',
      hasBackboneWaterMeasurement ? 'saha su ölçümü' : '',
      backboneGrowthObservationCount > 0 ? `${backboneGrowthObservationCount} gelişim gözlemi` : '',
    ].filter(Boolean);

    insights.push({
      id: 'field-data-backbone-evidence',
      title: 'Tarla geçmişi karar bağlamına bağlı',
      meaning: `Ortak tarla hafızasında ${backboneEventCount} aktif kayıt var${memoryPieces.length ? `: ${memoryPieces.join(', ')}` : ''}. Bu kayıtlar Pusula AI, Bugün kararları ve PUSULAPDF tarafından aynı zaman çizgisinden okunuyor.`,
      action: 'Yeni sulama, gübreleme, ilaçlama, saha ölçümü veya fenoloji kaydı eklediğinde sonraki karar ve raporlar bu yeni bağlamı otomatik kullanır.',
      evidence: [
        { label: 'Aktif hafıza', value: `${backboneEventCount} kayıt` },
        { label: 'Tarla işlemi', value: `${backboneOperationCount}` },
        { label: 'Saha ölçümü', value: hasBackboneWaterMeasurement ? 'Var' : 'Yok' },
      ],
      confidence: 'high',
    });
  }

  const pcse = latestPcseEvidence(snapshot);
  if (pcse) {
    const details = pcse.details ?? {};
    const status = String(details.status ?? 'unknown');
    const missingInputs = Array.isArray(details.missingInputs) ? details.missingInputs.map(String).filter(Boolean) : [];
    if (status === 'completed') {
      const stage = String(details.stage ?? 'belirlenemedi');
      const dvs = modelMetric(pcse.metrics?.dvs);
      insights.push({
        id: 'pcse-wofost-phenology-evidence',
        title: 'PCSE/WOFOST gelişim modeli kanıtı',
        meaning: `WOFOST72_PP potansiyel gelişim modeli evreyi “${stage}” olarak hesapladı${dvs !== null ? ` (DVS ${dvs.toFixed(2)})` : ''}. Bu fenoloji baseline’ıdır; su stresi ve sulama kararı üretmez.`,
        action: 'Evreyi NASA Harvest NDVI eğrisi ve saha gözlemiyle birlikte doğrula.',
        evidence: [
          { label: 'Model', value: 'PCSE WOFOST72_PP' },
          { label: 'Evre', value: stage },
          { label: 'Su stresi yetkisi', value: 'Yok' },
        ],
        confidence: 'medium',
      });
    } else if (missingInputs.length) {
      next7Days.push(`PCSE/WOFOST fenoloji doğrulaması ${missingInputs.length} gerçek girdi eksik olduğu için sentetik ürün/çeşit/tarih üretmeden bekliyor.`);
    }
  }

  const aquaCrop = latestAquaCropEvidence(snapshot);
  if (aquaCrop) {
    const details = aquaCrop.details ?? {};
    const status = String(details.status ?? 'unknown');
    const missingInputs = Array.isArray(details.missingInputs) ? details.missingInputs.map(String).filter(Boolean) : [];
    if (status === 'completed') {
      const crop = String(details.cropModelKey ?? 'ürün');
      const start = String(details.simulationStart ?? '');
      const end = String(details.simulationEnd ?? '');
      insights.push({
        id: 'aquacrop-pilot-evidence',
        title: 'AquaCrop sezon simülasyonu tamamlandı',
        meaning: `AquaCrop pilotu ${crop} modeli için gerçek hava, toprak, başlangıç suyu ve sulama yönetimi girdileriyle çalıştı${start && end ? ` (${start} – ${end})` : ''}. Bu sezon ölçekli bağımsız kanıttır; bugünkü sulama reçetesi değildir.`,
        action: 'AquaCrop sonucunu sezon bağlamı olarak kullan; bugünkü sulama kararında production su dengesi ve saha gözlemi önceliklidir.',
        evidence: [
          { label: 'Model', value: 'AquaCrop pilot' },
          { label: 'Ürün modeli', value: crop },
          { label: 'Yetki', value: 'Bağımsız kanıt' },
        ],
        confidence: 'medium',
      });
    } else if (missingInputs.length) {
      next7Days.push(`AquaCrop doğrulaması ${missingInputs.length} gerçek girdi eksik olduğu için sentetik değer üretmeden bekliyor.`);
    }
  }

  const pyfao = latestPyFao56Evidence(snapshot);
  if (pyfao) {
    const details = pyfao.details ?? {};
    const metrics = pyfao.metrics ?? {};
    const status = String(details.status ?? 'unknown');
    const rootMin = modelMetric(metrics.rootDepletionMinMm);
    const rootMax = modelMetric(metrics.rootDepletionMaxMm);
    const horizon = modelMetric(metrics.horizonDays);
    const scenarios = modelMetric(metrics.scenarioCount);
    const missingInputs = Array.isArray(details.missingInputs)
      ? details.missingInputs.map(String).filter(Boolean)
      : [];

    if (status === 'completed' && rootMin !== null && rootMax !== null) {
      insights.push({
        id: 'pyfao56-dual-kc-evidence',
        title: 'FAO-56 bağımsız su dengesi kanıtı',
        meaning: `pyfao56 Dual-Kc shadow modeli kök bölgesi açığını ${rootMin.toFixed(1)}–${rootMax.toFixed(1)} mm aralığında hesapladı${horizon ? `; model ufku ${Math.round(horizon)} gün` : ''}. Bu bağımsız model kanıtıdır; production sulama reçetesi değildir.`,
        action: 'Sulama kararını production su dengesiyle uygula; model kanıtını saha nemi ve yeni ölçümlerle birlikte doğrulama katmanı olarak kullan.',
        evidence: [
          { label: 'Model', value: 'pyfao56 Dual-Kc shadow' },
          { label: 'Kök açığı', value: `${rootMin.toFixed(1)}–${rootMax.toFixed(1)} mm` },
          { label: 'Senaryo', value: scenarios ? `${Math.round(scenarios)}` : 'kayıtlı' },
        ],
        confidence: 'medium',
      });
    } else if (missingInputs.length) {
      next7Days.push(
        `FAO-56 Dual-Kc doğrulaması için ${missingInputs.length} gerçek girdi eksik; model sentetik değer üretmeden bekliyor.`,
      );
    }
  }

  if (!snapshot.activities.length && backboneOperationCount === 0) {
    next7Days.push(
      'Yaptığın tarla işlemlerini kaydet; sonraki PUSULAPDF değişimleri yapılan müdahalelerle karşılaştırabilsin.',
    );
  }

  const nutritionGuard = latestDecisionEvidence(snapshot, 'nutrition-decision-guard');
  if (nutritionGuard) {
    const details = nutritionGuard.details ?? {};
    const metrics = nutritionGuard.metrics ?? {};
    const blocked = metrics.blockedNitrogenClaim === true;
    const mergedDifferential = metrics.mergedDifferential === true;
    const productionAuthorityPresent = metrics.productionAuthorityPresent === true;
    const alternatives = listText(details.alternativeCauseLabels, 4);
    const fertilization = details.recentFertilization ?? {};
    const phenology = details.phenologyContext ?? {};
    const localNutrient = details.localNutrientContext ?? {};
    const zoning = details.zoningReadiness ?? {};
    const samplingPlan = zoning.samplingPlan ?? {};
    const prescriptionGate = zoning.prescriptionGate ?? {};
    const samplingCandidates = Array.isArray(samplingPlan.candidates)
      ? samplingPlan.candidates
          .map((candidate: any) => String(candidate?.area ?? '').trim())
          .filter(Boolean)
          .slice(0, 4)
      : [];
    const zoningSamplingAllowed =
      metrics.zoningSamplingAllowed === true || samplingPlan.allowed === true;
    const variableRateAllowed =
      metrics.variableRateNitrogenAllowed === true ||
      prescriptionGate.variableRateNitrogenAllowed === true;
    const sl2pContextAvailable = localNutrient.sl2pAvailable === true;
    const bioQuality = String(localNutrient.biophysicsQuality ?? '').trim();
    const detail = String(details.detail ?? '').trim();
    const recentAge = modelMetric(metrics.recentFertilizationAgeDays);
    const fertilizationLabel = metrics.recentFertilizationPresent === true
      ? `${String(fertilization.date ?? 'kayıtlı tarih')}${recentAge !== null ? ` · ${Math.round(recentAge)} gün önce` : ''}${fertilization.productName ? ` · ${fertilization.productName}` : ''}`
      : 'Yakın kayıt yok';

    insights.push({
      id: 'nutrition-decision-guard-evidence',
      title: blocked
        ? 'Azot nedeni doğrulama bekliyor'
        : zoningSamplingAllowed
          ? 'Parsel içi örnekleme hedefleri hazır'
          : mergedDifferential
            ? 'Besin kararı neden filtresinden geçti'
            : 'Besin kararı saha bağlamıyla birleştirildi',
      meaning: detail || (
        blocked
          ? 'NDVI düşüşü tek başına azot eksikliği sayılmadı; production besin kararı veya azot nedeni uygulama öncesi doğrulama kapısında tutuldu.'
          : zoningSamplingAllowed
            ? `Gerçek Sentinel-2 göreli bölge farkları yalnız saha/toprak-yaprak örnekleme hedefi olarak kullanıldı${samplingCandidates.length ? `: ${samplingCandidates.join(' · ')}` : ''}. Bu bölgeler gübre reçete zonu değildir.`
            : `Besin kararı laboratuvar, fenoloji, son gübreleme ve mevcut stres kanıtlarıyla aynı karar zincirinde arşivlendi.${sl2pContextAvailable ? ' Gerçek SL2P LAI/CCC/CWC biyofizik ölçümü de yalnız destek bağlamı olarak eklendi.' : ''}`
      ),
      action: blocked
        ? 'Yeni N uygulamasından önce saha kontrolü, su durumu ve güncel laboratuvar kanıtıyla nedeni doğrula.'
        : zoningSamplingAllowed
          ? 'Zayıf ve referans bölgeleri aynı saha turunda karşılaştır; gerekiyorsa ayrı toprak/yaprak örneğiyle doğrula. Sonuç çıkmadan değişken doz uygulama yapma.'
          : alternatives.length
            ? 'Besin kararını alternatif stres kanıtlarını dışlamadan uygula; NDVI değişimini tek başına besin eksikliği sayma.'
            : 'Besin kararını laboratuvar ve kayıtlı saha bağlamıyla değerlendir; filtre yeni doz üretmez.',
      evidence: [
        {
          label: 'Azot güvenlik kapısı',
          value: blocked ? 'Blokeli · doğrulama gerekli' : 'Açık · otomatik N teşhisi yok',
        },
        {
          label: 'Son gübreleme',
          value: fertilizationLabel,
        },
        {
          label: 'Fenoloji',
          value: phenology?.usable
            ? String(phenology.stageLabel ?? phenology.stage ?? 'kayıtlı')
            : 'Kullanılabilir evre bağlamı yok',
        },
        {
          label: 'Alternatif stres',
          value: alternatives.length ? alternatives.join(' · ') : 'Güçlü alternatif kanıt yok',
        },
        {
          label: 'Biyofizik destek',
          value: sl2pContextAvailable
            ? `SL2P hazır${bioQuality ? ` · kalite ${bioQuality}` : ''}${localNutrient.cccTrend ? ` · CCC ${String(localNutrient.cccTrend)}` : ''}${localNutrient.laiTrend ? ` · LAI ${String(localNutrient.laiTrend)}` : ''}`
            : 'SL2P besin bağlamı yok',
        },
        {
          label: 'pySTICS worker',
          value: localNutrient.pysticsRuntimeStatus === 'ready'
            ? `Hazır${localNutrient.pysticsPackageVersion ? ` · v${String(localNutrient.pysticsPackageVersion)}` : ''}${localNutrient.pysticsTurkeyWheatProfileValidated ? ' · TR buğday profili doğrulandı' : ' · TR kalibrasyonu bekliyor'}`
            : localNutrient.pysticsRuntimeStatus
              ? `Kapalı · ${String(localNutrient.pysticsRuntimeStatus)}`
              : 'Yapılandırılmadı',
        },
        {
          label: 'STICS / ICAR / HaFAS',
          value: 'Yöntem referansı · production reçete otoritesi değil',
        },
        {
          label: 'Örnekleme hedefleri',
          value: zoningSamplingAllowed
            ? (samplingCandidates.length ? samplingCandidates.join(' · ') : 'Hazır')
            : 'Henüz hazır değil',
        },
        {
          label: 'Değişken doz N reçetesi',
          value: variableRateAllowed
            ? 'Runtime doğrulaması gerekli'
            : 'Kapalı · kalibre runtime + zon-spesifik ölçüm yok',
        },
        {
          label: 'Karar otoritesi',
          value: productionAuthorityPresent ? 'soil-nutrition-engine' : 'Güvenli fallback',
        },
      ],
      confidence: productionAuthorityPresent && !blocked ? 'high' : 'medium',
    });

    if (blocked) {
      next7Days.push(
        'Besin güvenlik kapısı azot uygulamasını doğrulama bekliyor; aynı zayıf alanda saha fotoğrafı ve su/toprak durumunu kontrol et.',
      );
    } else if (zoningSamplingAllowed) {
      next7Days.push(
        `Parsel içi örnekleme hedefleri hazır${samplingCandidates.length ? ` (${samplingCandidates.join(' · ')})` : ''}; zayıf ve referans bölgeyi saha/laboratuvar karşılaştırmasıyla doğrula, bunu gübre reçete zonu olarak kullanma.`,
      );
    } else if (alternatives.length) {
      next7Days.push(
        `Besin kararını uygularken şu alternatif stres kanıtlarını ayrıca kontrol et: ${alternatives.join(' · ')}.`,
      );
    }
  }

  const soilIntelligence = latestDecisionEvidence(snapshot, 'soil-intelligence');
  if (soilIntelligence) {
    const details = soilIntelligence.details ?? {};
    const metrics = soilIntelligence.metrics ?? {};
    const status = String(metrics.status ?? 'empty');
    const evidence = listText(details.evidence, 3);
    const warnings = listText(details.warnings, 2);

    if (status === 'lab-backed' || status === 'context-only') {
      const labBacked = status === 'lab-backed';
      insights.push({
        id: 'soil-intelligence-evidence',
        title: labBacked
          ? 'Toprak bağlamı laboratuvar ölçümüyle destekli'
          : 'SoilGrids toprak bağlamı hazır',
        meaning: [
          labBacked
            ? 'Bu tarlaya ait laboratuvar analizi ölçüm otoritesi olarak rapora bağlı.'
            : 'SoilGrids 250 m model tahmini pH, organik karbon ve tekstür için arka plan bağlamı sağlıyor; laboratuvar ölçümü yerine geçmiyor.',
          ...evidence,
        ].filter(Boolean).join(' '),
        action: labBacked
          ? 'Besleme yorumunda laboratuvar ölçümünü öncelikli kabul et; SoilGrids’i yalnız mekânsal bağlam olarak kullan.'
          : 'Gübreleme veya toprak düzeltme kararı için mümkün olduğunda bu tarlanın laboratuvar analizini ekle.',
        evidence: [
          { label: 'Ölçüm otoritesi', value: labBacked ? 'Laboratuvar' : 'Yok' },
          { label: 'SoilGrids', value: metrics.soilGridsContextAvailable ? 'Model bağlamı mevcut' : 'Yok' },
          { label: 'Hidrolik eşik tahmini', value: 'Üretilmedi' },
        ],
        confidence: labBacked ? 'high' : 'limited',
      });

      if (!labBacked && !snapshot.soilAnalyses.length && !hasBackboneSoilAnalysis) {
        next7Days.push('SoilGrids arka planı mevcut; gübreleme kararını güçlendirmek için gerçek laboratuvar toprak analizi ekle.');
      }
      if (warnings.length) {
        next7Days.push(`Toprak verisi notu: ${warnings[0]}`);
      }
    }
  }

  const irrigationSynthesis = latestDecisionEvidence(snapshot, 'irrigation-synthesis');
  if (irrigationSynthesis) {
    const details = irrigationSynthesis.details ?? {};
    const metrics = irrigationSynthesis.metrics ?? {};
    const headline = String(details.headline ?? '').trim();
    const summary = String(details.summary ?? '').trim();
    const agreement = String(metrics.synthesisAgreement ?? 'partial');
    const soilContext = String(metrics.soilContext ?? 'missing');
    const decision = String(metrics.decision ?? 'veri yok');

    insights.push({
      id: 'irrigation-synthesis-evidence',
      title: headline || 'Sulama model sentezi',
      meaning: summary || 'Production sulama kararı bağımsız model kanıtlarıyla birlikte arşivlendi.',
      action: agreement === 'mixed'
        ? 'Modeller ayrışıyorsa sulama öncesi saha nemi ve son sulama kaydını doğrula.'
        : 'Bugünkü uygulamada production su dengesi kararını esas al; pyfao56/AquaCrop/toprak bağlamını destekleyici kanıt olarak kullan.',
      evidence: [
        { label: 'Production kararı', value: decision },
        { label: 'Model uyumu', value: agreement },
        { label: 'Toprak bağlamı', value: soilContext },
      ],
      confidence: agreement === 'aligned' ? 'high' : agreement === 'mixed' ? 'medium' : 'limited',
    });
  }

  const plantingWindow = latestDecisionEvidence(snapshot, 'planting-window-decision');
  if (plantingWindow) {
    const details = plantingWindow.details ?? {};
    const metrics = plantingWindow.metrics ?? {};
    const summary = String(details.summary ?? '').trim();
    const actionContext = String(details.actionContext ?? '').trim();
    const lowerScenario = details.lowerHistoricalExposureScenario ?? null;
    const lowerLabel = String(lowerScenario?.label ?? '').trim();
    const lowerDate = String(lowerScenario?.plantingDate ?? '').trim();
    const scenarioCount = modelMetric(metrics.scenarioCount);

    insights.push({
      id: 'planting-window-evidence',
      title: 'Ekim penceresi · 3 tarih karşılaştırması',
      meaning:
        summary ||
        'Gerçek ekim geçmişi ve geçmiş meteorolojik maruziyet ile ekim tarihleri karşılaştırıldı.',
      action:
        actionContext ||
        'Sonucu toprak tavı, gerçek çeşit, ekim hazırlığı ve kısa vadeli hava ile birlikte değerlendir; tek başına ekim tarihi tavsiyesi sayma.',
      evidence: [
        {
          label: 'Senaryo',
          value: scenarioCount === null ? 'veri yok' : `${Math.round(scenarioCount)} tarih`,
        },
        {
          label: 'Daha düşük maruziyet',
          value: lowerLabel
            ? `${lowerLabel}${lowerDate ? ` · ${lowerDate}` : ''}`
            : 'Belirgin tek senaryo yok',
        },
        {
          label: 'Yorum sınırı',
          value: 'Tavsiye değil · risk olasılığı değil',
        },
      ],
      confidence: 'medium',
    });
  }

  const plantHealth = latestDecisionEvidence(snapshot, 'plant-health-synthesis');
  if (plantHealth) {
    const details = plantHealth.details ?? {};
    const metrics = plantHealth.metrics ?? {};
    const riskScore = modelMetric(metrics.riskScore);
    const riskLevel = String(metrics.riskLevel ?? '').trim();
    const photoMatched = metrics.photoEvidenceMatched === true;
    const regionalScore = modelMetric(metrics.regionalPressureScore);
    const regionalLevel = String(metrics.regionalPressureLevel ?? '').trim();
    const regionalCount = modelMetric(metrics.regionalObservationCount);
    const regionalNearestKm = modelMetric(metrics.regionalNearestDistanceKm);
    const title = String(details.title ?? 'Bitki sağlığı risk takibi').trim();
    const meaning = String(details.detail ?? '').trim();

    insights.push({
      id: 'plant-health-synthesis-evidence',
      title,
      meaning: meaning || 'Risk Radar sonucu bitki sağlığı karar akışına gerçek kaynaklarıyla bağlandı.',
      action: 'İklimsel risk sinyalini sahada belirti kontrolüyle doğrula; fotoğraf AI ön değerlendirmesini kesin teşhis olarak kullanma.',
      evidence: [
        { label: 'Risk seviyesi', value: riskLevel || 'veri yok' },
        { label: 'Risk skoru', value: riskScore === null ? 'veri yok' : `%${Math.round(riskScore)}` },
        { label: 'Fotoğraf kanıtı', value: photoMatched ? 'Etiket eşleşti · ön değerlendirme' : 'Eşleşen fotoğraf kanıtı yok' },
        { label: 'Bölgesel radar', value: regionalCount && regionalCount > 0 ? `${Math.round(regionalCount)} kayıt · ${regionalLevel || 'izleme'}${regionalNearestKm !== null ? ` · en yakın ${regionalNearestKm.toFixed(regionalNearestKm < 10 ? 1 : 0)} km` : ''}` : 'Aktif doğrulanmış yakın çevre kaydı yok' },
        { label: 'Bölgesel sınır', value: 'Yakın çevre sinyali · tarlada varlık/olasılık değildir' },
      ],
      confidence: photoMatched || (regionalScore !== null && regionalScore >= 52) ? 'medium' : 'limited',
    });
  }

  const yieldHarvestEvidence = latestDecisionEvidence(snapshot, 'yield-harvest-quality');
  if (yieldHarvestEvidence) {
    const details: any = yieldHarvestEvidence.details ?? {};
    const metrics: any = yieldHarvestEvidence.metrics ?? {};
    const forecast: any = details.ensembleForecast ?? null;
    const timing: any = details.harvestTiming ?? null;
    const quality: Record<string, unknown> = details.qualityMeasurements && typeof details.qualityMeasurements === 'object'
      ? details.qualityMeasurements
      : {};
    const qualityKeys = Object.keys(quality).filter((key) => quality[key] !== null && quality[key] !== '');
    const qualityTexts = formatHarvestQualityMeasurements(quality as Record<string, number | string | null | undefined>);
    const actualKgHa = modelMetric(metrics.currentYieldKgHa);
    const lowerKgHa = modelMetric(metrics.forecastLowerKgHa ?? forecast?.lowerKgHa);
    const centralKgHa = modelMetric(metrics.forecastCentralKgHa ?? forecast?.centralKgHa);
    const upperKgHa = modelMetric(metrics.forecastUpperKgHa ?? forecast?.upperKgHa);
    const observed = actualKgHa !== null && actualKgHa >= 0;
    const modelSupported = forecast?.status === 'model_supported';
    const rangeText = lowerKgHa !== null && upperKgHa !== null
      ? `${Math.round(lowerKgHa / 10).toLocaleString('tr-TR')}–${Math.round(upperKgHa / 10).toLocaleString('tr-TR')} kg/da`
      : centralKgHa !== null
        ? `yaklaşık ${Math.round(centralKgHa / 10).toLocaleString('tr-TR')} kg/da merkez kanıt`
        : 'Sayısal model aralığı yok';
    const harvestText = details.actualHarvestDate
      ? `Gerçek hasat ${String(details.actualHarvestDate).slice(0, 10)}`
      : timing?.lowerDate && timing?.upperDate
        ? `${String(timing.lowerDate).slice(0, 10)} – ${String(timing.upperDate).slice(0, 10)}`
        : details.expectedHarvestDate
          ? `Beklenen ${String(details.expectedHarvestDate).slice(0, 10)}`
          : 'Hasat zamanı izleniyor';

    insights.push({
      id: 'yield-harvest-ensemble-evidence',
      title: observed
        ? 'Gerçek verim kaydı model ensemble’ının üstünde'
        : modelSupported
          ? 'Buğday verim kanıt zarfı hazır'
          : 'Verim ve hasat kanıtı bağlı',
      meaning: observed
        ? `Gerçek hasat/verim kaydı ${Math.round((actualKgHa ?? 0) / 10).toLocaleString('tr-TR')} kg/da olarak production otoritesinde; destek modelleri bu değeri değiştiremez.`
        : modelSupported
          ? `${rangeText}. Bu aralık istatistiksel güven aralığı değildir; gerçek model çıktısı ve mevcut tarla geçmişinden oluşan kanıt zarfıdır.`
          : 'Canlı sayısal verim ensemble’ı hazır değilse geçmiş ortalama tahmin etiketiyle gösterilmez.',
      action: details.status === 'harvest_window'
        ? 'Hasat olgunluğunu sahada doğrula; zaman penceresini ürün nemi ve gerçek olgunlukla birlikte değerlendir.'
        : qualityKeys.length
          ? 'Ölçülen kalite değerlerini gerçek hasat/verim kaydıyla birlikte sezon karşılaştırmasına ekle.'
          : details.status === 'harvested'
            ? 'Hasat tamamlandıysa gerçek kalite ölçümünü ekle; model kalite skoru uydurmasın.'
            : 'Verim aralığını planlama bağlamı olarak kullan; gerçek hasat kaydı geldiğinde modelin yerine onu esas al.',
      evidence: [
        { label: 'Verim otoritesi', value: observed ? 'Gerçek hasat/verim kaydı' : 'yield-harvest-engine · destek model kanıtı' },
        { label: 'Buğday ensemble', value: modelSupported ? rangeText : forecast?.status === 'historical_context' ? 'Yalnız geçmiş bağlamı' : 'Sayısal ensemble yok' },
        { label: 'Hasat zamanı', value: harvestText },
        { label: 'Kalite', value: qualityTexts.length ? `Gerçek ölçüm: ${qualityTexts.join(' · ')}` : 'Ölçüm yok · kalite skoru üretilmedi' },
        { label: 'YIELD4CAST / QualiTree', value: 'Method-reference · canlı TarlaPusula runtime değil' },
      ],
      confidence: observed ? 'high' : modelSupported ? 'medium' : 'limited',
    });

    if (details.status === 'harvest_window') {
      next7Days.push(`Hasat penceresini sahada doğrula${timing?.date ? `; merkez tarih ${String(timing.date).slice(0, 10)}` : ''}.`);
    }
    if (details.status === 'harvested' && !qualityKeys.length) {
      next7Days.push('Hasat tamamlandı; protein/nem/hektolitre veya ürüne uygun gerçek kalite ölçümünü ekle.');
    }
  }

  const orchardEvidence = latestDecisionEvidence(snapshot, 'orchard-tree-intelligence');
  if (orchardEvidence) {
    const details: any = orchardEvidence.details ?? {};
    const metrics: any = orchardEvidence.metrics ?? {};
    const treeCount = modelMetric(metrics.treeCount) ?? 0;
    const observedTreeCount = modelMetric(metrics.observedTreeCount) ?? 0;
    const stressedTreeCount = modelMetric(metrics.stressedTreeCount) ?? 0;
    const waterStressTreeCount = modelMetric(metrics.waterStressTreeCount) ?? 0;
    const floweringTreeCount = modelMetric(metrics.floweringTreeCount) ?? 0;
    const fruitingTreeCount = modelMetric(metrics.fruitingTreeCount) ?? 0;
    const alternanceTreeCount = modelMetric(metrics.alternanceTreeCount) ?? 0;
    const methodReferences = Array.isArray(details.methodReferences) ? details.methodReferences : [];

    insights.push({
      id: 'orchard-tree-intelligence-evidence',
      title: stressedTreeCount > 0 || waterStressTreeCount > 0
        ? 'Bahçede ağaç bazlı kontrol sinyali var'
        : 'Ağaç bazlı bahçe kaydı bağlı',
      meaning: `${Math.round(treeCount)} kayıtlı ağacın ${Math.round(observedTreeCount)} tanesinde gerçek saha/sensör gözlemi var. Ağaç durumu parsel ortalamasından ayrı tutuluyor.`,
      action: stressedTreeCount > 0 || waterStressTreeCount > 0
        ? 'Stres kaydı bulunan ağaçları ve yakın komşularını aynı saha turunda karşılaştır; uyduyu tek-ağaç teşhisi olarak kullanma.'
        : alternanceTreeCount > 0
          ? 'Olası alternans sinyali bulunan ağaçlarda çiçeklenme, meyve yükü ve gerçek ağaç verimini sezonlar arasında sürdür.'
          : 'Aynı ağaç kodlarıyla su, çiçek, meyve, stres ve gerçek verim gözlemlerini sürdür.',
      evidence: [
        { label: 'Ağaç kaydı', value: `${Math.round(treeCount)} toplam · ${Math.round(observedTreeCount)} gözlemli` },
        { label: 'Stres', value: `${Math.round(stressedTreeCount)} stres · ${Math.round(waterStressTreeCount)} su stresi` },
        { label: 'Fenoloji', value: `${Math.round(floweringTreeCount)} çiçek · ${Math.round(fruitingTreeCount)} meyve bağlamı` },
        { label: 'Alternans', value: alternanceTreeCount > 0 ? `${Math.round(alternanceTreeCount)} ağaçta olası örüntü · gerçek çok yıllık verim` : 'Kanıt yok / yetersiz' },
        { label: 'Asymetree / SAMSON / FruitMeasure / MangoSense', value: methodReferences.length ? 'Method-reference · canlı runtime değil' : 'Runtime kanıtı yok' },
      ],
      confidence: observedTreeCount > 0 ? 'high' : 'limited',
    });

    if (stressedTreeCount > 0 || waterStressTreeCount > 0) {
      next7Days.push('Ağaç bazlı Pusula’da stres işaretli ağaçları ve en yakın sağlıklı komşularını karşılaştırmalı kontrol et.');
    }
  }

  const orchardChillEvidence = latestDecisionEvidence(snapshot, 'orchard-chill-evidence');
  if (orchardChillEvidence) {
    const details: any = orchardChillEvidence.details ?? {};
    const metrics: any = orchardChillEvidence.metrics ?? {};
    const official: any = details.officialReference ?? {};
    const classicHours = modelMetric(metrics.classicHours);
    const utahUnits = modelMetric(metrics.utahUnits);
    const chillPortions = modelMetric(metrics.chillPortions);
    const coveragePct = modelMetric(metrics.hourlyCoveragePct);
    const officialObserved = modelMetric(metrics.officialObservedHours);
    const officialRequirement = modelMetric(metrics.officialRequirementHours);
    const officialRemaining = modelMetric(metrics.officialRemainingHours);
    const hasOfficialRequirement = officialRequirement !== null && officialRequirement > 0;

    insights.push({
      id: 'orchard-chill-evidence',
      title: hasOfficialRequirement && officialRemaining !== null
        ? 'MGM soğuklama ihtiyacı referansı bağlı'
        : 'Bahçe soğuklama birikimi izleniyor',
      meaning: classicHours !== null
        ? `Tarla koordinatındaki saatlik sıcaklıktan MGM Klasik Yöntemi ile ${Math.round(classicHours)} saat soğuklama birikimi hesaplandı. Bu değer MGM istasyon gözlemi değildir.`
        : 'Tarla koordinatı için yeterli saatlik sıcaklık verisi oluşmadı.',
      action: hasOfficialRequirement
        ? 'Resmî çeşit ihtiyacını ve gerçekleşen MGM değerini BİSİP ile karşılaştır; tarla noktası modellerini mikroklima karşılaştırması olarak kullan.'
        : 'Çeşit ihtiyacı doğrulanmadan tamamlanma yüzdesi veya kalan saat üretme; resmî BİSİP kaydını kontrol et.',
      evidence: [
        { label: 'MGM Klasik · tarla noktası', value: classicHours !== null ? `${Math.round(classicHours)} saat` : 'Veri yok' },
        { label: 'Utah', value: utahUnits !== null ? `${Math.round(utahUnits)} CU` : 'Veri yok' },
        { label: 'Dynamic', value: chillPortions !== null ? `${Math.round(chillPortions * 10) / 10} CP` : 'Veri yok' },
        { label: 'Saatlik veri kapsamı', value: coveragePct !== null ? `%${Math.round(coveragePct)}` : 'Bilinmiyor' },
        { label: 'MGM BİSİP istasyonu', value: String(official.stationName ?? official.stationId ?? 'Resmî bağlantı var · istasyon eşleşmesi yok') },
        { label: 'Resmî ihtiyaç / kalan', value: hasOfficialRequirement ? `${Math.round(officialRequirement!)} / ${officialRemaining !== null ? Math.round(officialRemaining) : '—'} saat` : 'Doğrulanmış çeşit eşiği yok' },
        ...(officialObserved !== null ? [{ label: 'MGM gerçekleşen', value: `${Math.round(officialObserved)} saat` }] : []),
      ],
      confidence: coveragePct !== null && coveragePct >= 90 ? 'medium' : 'limited',
    });
  }

  const storageRiskEvidence = latestDecisionEvidence(snapshot, 'storage-risk');
  if (storageRiskEvidence) {
    const metrics: any = storageRiskEvidence.metrics ?? {};
    const details: any = storageRiskEvidence.details ?? {};
    const riskLevel = String(metrics.riskLevel ?? 'unknown');
    const lotCount = modelMetric(metrics.lotCount) ?? 0;
    const highCount = modelMetric(metrics.highRiskLotCount) ?? 0;
    const attentionCount = modelMetric(metrics.attentionLotCount) ?? 0;
    insights.push({
      id: 'storage-risk-evidence',
      title: highCount > 0 ? 'Depolama koşullarında yüksek çevresel risk var' : attentionCount > 0 ? 'Depolama koşulları yakından izlenmeli' : 'Depolama risk taraması bağlı',
      meaning: `${Math.round(lotCount)} hasat ürünü depolama partisi sıcaklık, bağıl nem, ürün nemi ve süre bağlamında tarandı. Bu sonuç mikotoksin teşhisi veya olasılığı değildir.`,
      action: highCount > 0 ? 'Ürün nemi ve depo koşullarını aynı gün doğrula; şüpheli üründe uygun laboratuvar analizini planla.' : 'Ölçümleri düzenli sürdür ve yükselen nem/sıcaklık eğilimini erken düzelt.',
      evidence: [
        { label: 'Depo taraması', value: `${Math.round(lotCount)} parti · durum ${riskLevel}` },
        { label: 'Yüksek risk', value: `${Math.round(highCount)} parti` },
        { label: 'Dikkat', value: `${Math.round(attentionCount)} parti` },
        { label: 'Mikotoksin', value: 'Çevresel tarama · laboratuvar doğrulaması gerekir' },
      ],
      confidence: riskLevel === 'unknown' ? 'limited' : 'medium',
    });
    if (highCount > 0) next7Days.push('Depolama riski yüksek partide ürün nemi ve depo sıcaklık/nemini tekrar ölç; şüpheli üründe laboratuvar analizi planla.');
  }

  const irrigationEconomicsEvidence = latestDecisionEvidence(snapshot, 'irrigation-economics');
  if (irrigationEconomicsEvidence) {
    const metrics: any = irrigationEconomicsEvidence.metrics ?? {};
    const details: any = irrigationEconomicsEvidence.details ?? {};
    const cost = modelMetric(metrics.energyCostTry);
    const water = modelMetric(metrics.totalGrossWaterM3);
    const energy = modelMetric(metrics.energyKwh);
    const productivity = modelMetric(metrics.waterProductivityKgM3);
    insights.push({
      id: 'irrigation-economics-evidence',
      title: cost != null ? 'Sulama enerji/maliyet hesabı hazır' : 'Sulama ekonomisi için profil eksik',
      meaning: cost != null
        ? `Production Sulama Motoru'nun NET su kararı, kayıtlı sulama randımanı ve pompa profiliyle yaklaşık ${water?.toLocaleString('tr-TR') ?? '—'} m³ brüt su ve ${cost.toLocaleString('tr-TR')} TL enerji maliyetine çevrildi.`
        : 'NET sulama kararı var ancak brüt su/enerji maliyeti için pompa, debi, randıman veya enerji fiyatı eksik.',
      action: cost != null ? 'Maliyeti saha operasyon kaydıyla karşılaştır; sezon sonunda gerçek su ve hasatla kg/m³ değerini doğrula.' : `Eksik pompa/enerji bilgilerini tamamla${Array.isArray(details.missing) && details.missing.length ? `: ${details.missing.join(', ')}` : ''}.`,
      evidence: [
        { label: 'Brüt su', value: water != null ? `${water.toLocaleString('tr-TR')} m³` : 'hesaplanamadı' },
        { label: 'Enerji', value: energy != null ? `${energy.toLocaleString('tr-TR')} kWh` : 'hesaplanamadı' },
        { label: 'Maliyet', value: cost != null ? `${cost.toLocaleString('tr-TR')} TL` : 'hesaplanamadı' },
        { label: 'Su verimliliği', value: productivity != null ? `${productivity.toFixed(2)} kg/m³ · gerçek kayıt` : 'gerçek hasat + sulama hacmi gerekli' },
        { label: 'Ekonomik fayda', value: 'Doğrulanmış verim-cevap modeli olmadan hesaplanmaz' },
      ],
      confidence: cost != null ? 'medium' : 'limited',
    });
  }

  const frostPocketEvidence = latestDecisionEvidence(snapshot, 'frost-pocket');
  if (frostPocketEvidence) {
    const metrics: any = frostPocketEvidence.metrics ?? {};
    const details: any = frostPocketEvidence.details ?? {};
    const high = modelMetric(metrics.highPocketCount) ?? 0;
    const medium = modelMetric(metrics.mediumPocketCount) ?? 0;
    const eventDate = String(details.latestEvent?.eventDate ?? '').slice(0, 10);
    const postStatus = String(metrics.postEventSatelliteStatus ?? 'unavailable');
    insights.push({
      id: 'frost-pocket-evidence',
      title: postStatus === 'negative_change_after_event' ? 'Don sonrası uydu değişimi saha kontrolü istiyor' : high > 0 ? 'Tarla içinde topoğrafik don cebi adayları var' : 'Don cebi topoğrafyası tarandı',
      meaning: `Copernicus GLO-90 DEM üzerinde ${Math.round(high)} yüksek ve ${Math.round(medium)} orta hassasiyetli göreli alçak/düşük eğimli hücre ayrıldı. Bunlar ölçülmüş mikro-sıcaklık değildir.`,
      action: postStatus === 'negative_change_after_event' ? 'Kayıtlı don olayından sonra negatif uydu değişimi görülen alanları sahada doğrula; nedenselliği yalnız uyduyla kurma.' : 'Don gecelerinde düşük topoğrafik ceplerde saha/sensör sıcaklık kontrolüne öncelik ver.',
      evidence: [
        { label: 'DEM', value: `${details.resolutionMeters ?? 90} m · topoğrafik hassasiyet` },
        { label: 'Yüksek cep adayı', value: `${Math.round(high)} grid` },
        { label: 'Son don olayı', value: eventDate || 'kayıt yok' },
        { label: 'Olay sonrası uydu', value: postStatus === 'negative_change_after_event' ? 'Negatif değişim sinyali · teşhis değil' : postStatus === 'no_negative_signal' ? 'Belirgin negatif anomali yok' : 'karşılaştırma yok' },
      ],
      confidence: eventDate ? 'medium' : 'limited',
    });
    if (postStatus === 'negative_change_after_event') next7Days.push('Don olayı sonrası negatif uydu değişim sinyali bulunan düşük topoğrafik cepleri saha turunda kontrol et.');
  }

  const fieldWorkabilityEvidence = latestDecisionEvidence(snapshot, 'field-workability');
  if (fieldWorkabilityEvidence) {
    const metrics: any = fieldWorkabilityEvidence.metrics ?? {};
    const details: any = fieldWorkabilityEvidence.details ?? {};
    const status = String(metrics.status ?? 'needs_data');
    const ratio = modelMetric(metrics.ratioToFieldCapacity);
    const threshold = modelMetric(metrics.trafficabilityThresholdRatio);
    const waterSource = String(metrics.surfaceWaterSource ?? 'missing');
    const title = status === 'wait'
      ? 'Tarlaya girişte sıkışma/iz riski yüksek'
      : status === 'caution'
        ? 'Tarlaya giriş öncesi yüzey kontrolü gerekli'
        : status === 'suitable'
          ? 'Tarlaya giriş koşulları uygun görünüyor'
          : 'Tarlaya giriş için otomatik veri sınırlı';

    insights.push({
      id: 'field-workability-evidence',
      title,
      meaning: String(details.summary ?? 'Yüzey nemi, tekstüre göre tarla kapasitesi, son sulama ve topoğrafya birlikte tarandı.'),
      action: status === 'wait'
        ? 'Ağır makine girişini ertele; yağış/sulama sonrası yüzeyin toparlanmasını bekle ve girişte iz yapma riskini gözle kontrol et.'
        : status === 'caution'
          ? 'Makine girişi öncesi kısa saha kontrolü yap; yüzey yapışkan/iz bırakan durumdaysa işlemi ertele.'
          : status === 'suitable'
            ? 'Makine yükü ve lastik basıncını yine gözet; bu sonuç subsoil taşıma kapasitesi testi değildir.'
            : 'Otomatik hava/toprak verisi tamamlandıkça kart kendini yeniler; şu an temkinli karar kullan.',
      evidence: [
        { label: 'Yüzey nem kaynağı', value: waterSource === 'verified_measurement' ? 'Doğrulanmış saha ölçümü' : waterSource === 'open_meteo_model' ? 'Open-Meteo model bağlamı' : 'yok' },
        { label: 'Tarla kapasitesine oran', value: ratio != null ? `%${Math.round(ratio * 100)}` : 'hesaplanamadı' },
        { label: 'Ön tarama eşiği', value: threshold != null ? `%${Math.round(threshold * 100)} TK` : 'hesaplanamadı' },
        { label: 'Son sulama', value: String(details.wetting?.lastIrrigationDate ?? 'kayıt yok') },
        { label: 'Son 72 sa yağış', value: details.wetting?.rainLast72hMm != null ? `${Number(details.wetting.rainLast72hMm).toFixed(1)} mm` : 'veri yok' },
        { label: 'Eğim', value: metrics.meanSlopeDeg != null ? `ort. ${Number(metrics.meanSlopeDeg).toFixed(1)}°` : 'veri yok' },
      ],
      confidence: metrics.confidence === 'strong' ? 'high' : metrics.confidence === 'medium' ? 'medium' : 'limited',
    });

    if (status === 'wait') {
      next7Days.push('Yoğun yağış/sulama sonrası yüzey toparlanana kadar ağır makine girişini ertele; Bugün kartını tekrar kontrol et.');
    }
  }


  const irrigationDistributionEvidence = latestDecisionEvidence(snapshot, 'irrigation-distribution');
  if (irrigationDistributionEvidence) {
    const metrics: any = irrigationDistributionEvidence.metrics ?? {};
    const details: any = irrigationDistributionEvidence.details ?? {};
    const status = String(metrics.status ?? 'normal');
    const area = String(details.area ?? 'Tarla geneli');
    const repeat = modelMetric(metrics.repeatCount) ?? 0;
    const anomaly = modelMetric(metrics.anomalyScore);
    const rain = modelMetric(metrics.rainBetweenMm);
    insights.push({
      id: 'irrigation-distribution-evidence',
      title: status === 'recurrent'
        ? `${area} bölümünde tekrarlayan sulama dağılım şüphesi`
        : status === 'suspect'
          ? `Sulama sonrası ${area} bölümü farklı tepki verdi`
          : 'Sulama sonrası belirgin dağılım anomalisi görülmedi',
      meaning: status === 'recurrent'
        ? `Aynı ${area} bölümü ${Math.round(repeat)} farklı sulama olayından sonra tekrar sapma gösterdi. Bu uzaktan arıza teşhisi değildir; hat/debi/dağılım kontrolünde öncelik sinyalidir.`
        : status === 'suspect'
          ? 'Sulama sonrası parsel içi Sentinel-2/Sentinel-1 karşılaştırmasında bir bölüm çevresine göre farklı kaldı. Tek olay arıza kanıtı değildir.'
          : 'Kayıtlı sulama sonrasındaki kullanılabilir uydu/radar karşılaştırmasında uyarı eşiğini aşan tekrar deseni oluşmadı.',
      action: status === 'recurrent' || status === 'suspect'
        ? `${area} bölümündeki sulama hattını, debi/basınç farkını ve yüzey ıslanmasını sahada karşılaştır; sorun doğrulanmadan parça değişimi veya arıza sonucu çıkarma.`
        : 'Sonraki sulamalarda aynı mekânsal desenin tekrar edip etmediğini izlemeye devam et.',
      evidence: [
        { label: 'Bölge', value: area },
        { label: 'Tekrar', value: `${Math.round(repeat)} farklı sulama` },
        { label: 'Anomali skoru', value: anomaly != null ? anomaly.toFixed(2) : '—' },
        { label: 'Ara dönem yağış', value: rain != null ? `${rain.toFixed(1)} mm` : 'alınamadı' },
        { label: 'Sınır', value: 'Arıza teşhisi değil · saha doğrulaması gerekir' },
      ],
      confidence: metrics.confidence === 'strong' ? 'high' : metrics.confidence === 'medium' ? 'medium' : 'limited',
    });
    if (status === 'recurrent') {
      next7Days.push(`${area} bölümünde tekrarlayan sulama dağılım şüphesini saha turunda hat/debi/yüzey ıslanmasıyla doğrula.`);
    }
  }


  const microclimateEvidence = latestDecisionEvidence(snapshot, 'microclimate-sensor');
  if (microclimateEvidence) {
    const metrics: any = microclimateEvidence.metrics ?? {};
    const details: any = microclimateEvidence.details ?? {};
    const ageMinutes = modelMetric(metrics.ageMinutes);
    const air = modelMetric(metrics.airTemperatureC);
    const humidity = modelMetric(metrics.relativeHumidityPct);
    const soilMoisture = modelMetric(metrics.soilMoistureVwc);
    const pressure = modelMetric(metrics.pressureKpa);
    const flow = modelMetric(metrics.flowLMin);
    const hydraulicAlert = Boolean(metrics.pressureAlert || metrics.flowAlert);
    insights.push({
      id: 'microclimate-sensor-evidence',
      title: hydraulicAlert
        ? 'Canlı sensörde debi/basınç kontrol sinyali var'
        : ageMinutes != null && ageMinutes <= 30
          ? 'Canlı mikroiklim sensör verisi mevcut'
          : 'Mikroiklim sensör verisi geçmiş saha kanıtı olarak kayıtlı',
      meaning: hydraulicAlert
        ? 'Debi veya basınç, cihaz için tanımlanan beklenen aralığın dışında ölçüldü. Bu arıza teşhisi değildir; sulama dağılımı ve saha kontrolüyle birlikte yorumlanmalıdır.'
        : 'Gerçek saha sıcaklığı/nemi/toprak nemi gibi sensör ölçümleri uydu ve hava verisine bağımsız kanıt ekler.',
      action: hydraulicAlert
        ? 'Sulama hattında basınç/debi değerini ikinci ölçümle doğrula; 22. Sulama Dağılım Zekâsı aynı zamanda mekânsal sapma gösteriyorsa ilgili hattı sahada önceliklendir.'
        : 'Sensörün güncel veri gönderip göndermediğini takip et; saha ölçümü ile hava/uydu farkı büyürse Pusula yorumunu kontrol et.',
      evidence: [
        { label: 'Cihaz', value: String(details.device?.name ?? 'Sensör') },
        { label: 'Veri yaşı', value: ageMinutes != null ? `${Math.round(ageMinutes)} dk` : 'bilinmiyor' },
        { label: 'Saha sıcaklığı', value: air != null ? `${air.toFixed(1)} °C` : '—' },
        { label: 'Bağıl nem', value: humidity != null ? `%${humidity.toFixed(0)}` : '—' },
        { label: 'Toprak nemi', value: soilMoisture != null ? `${(soilMoisture * 100).toFixed(1)}% VWC` : '—' },
        { label: 'Hat', value: `${pressure != null ? `${pressure.toFixed(1)} kPa` : 'basınç —'} · ${flow != null ? `${flow.toFixed(1)} L/dk` : 'debi —'}` },
      ],
      confidence: ageMinutes != null && ageMinutes <= 30 ? 'high' : ageMinutes != null && ageMinutes <= 360 ? 'medium' : 'limited',
    });
    if (hydraulicAlert) next7Days.push('Canlı sensörde beklenen aralık dışı debi/basınç ölçümünü tekrar ölç; sulama dağılım haritasıyla aynı dönemi karşılaştır.');
  }


  const waterScarcityEvidence = latestDecisionEvidence(snapshot, 'water-scarcity-plan');
  if (waterScarcityEvidence) {
    const metrics: any = waterScarcityEvidence.metrics ?? {};
    const details: any = waterScarcityEvidence.details ?? {};
    const state = String(metrics.state ?? 'needs_data');
    const remaining = modelMetric(metrics.remainingWaterM3);
    const grossNeed = modelMetric(metrics.grossNeedM3);
    const coverage = modelMetric(metrics.coverageRatio);
    const sensitivity = String(metrics.phenologySensitivity ?? 'unknown');
    const stage = String(details.phenology?.stageLabel ?? '').trim();

    insights.push({
      id: 'water-scarcity-plan-evidence',
      title: state === 'scarcity_plan'
        ? 'Su Kıtlığı Planı aktif'
        : state === 'protect_water'
          ? 'Kritik evrede suyu koru'
          : state === 'controlled_reduce'
            ? 'Kontrollü azaltım değerlendirilebilir'
            : state === 'normal'
              ? 'Kayıtlı su bütçesi mevcut ihtiyacı karşılıyor'
              : 'Su Kıtlığı Planı için veri eksik',
      meaning: String(details.summary ?? 'Kayıtlı kullanılabilir su, Production Sulama Motoru ve fenolojiyle birlikte değerlendirildi.'),
      action: String(details.action ?? 'Su bütçesini ve sulama kayıtlarını güncel tut.'),
      evidence: [
        { label: 'Kalan su', value: remaining != null ? `${remaining.toLocaleString('tr-TR')} m³` : 'kayıt/hesap yok' },
        { label: 'Planlanan brüt ihtiyaç', value: grossNeed != null ? `${grossNeed.toLocaleString('tr-TR')} m³` : 'hesaplanamadı' },
        { label: 'Fiziksel karşılama', value: coverage != null ? `%${Math.round(coverage * 100)}` : 'hesaplanamadı' },
        { label: 'Fenoloji', value: stage || 'evre çözülemedi' },
        { label: 'Su hassasiyeti', value: sensitivity },
        { label: 'Sınır', value: 'Optimum eksik sulama yüzdesi / verim kaybı tahmini değildir' },
      ],
      confidence: metrics.confidence === 'high' ? 'high' : metrics.confidence === 'medium' ? 'medium' : 'limited',
    });

    if (state === 'scarcity_plan') {
      next7Days.push('Kayıtlı su normal sulama ihtiyacını karşılamıyor; kritik fenoloji dönemindeki sulamayı önceliklendir ve toleranslı dönemdeki uygulamaları azalt/ertele.');
    } else if (state === 'protect_water') {
      next7Days.push('Bitki suya hassas evrede; bu dönemde suyu gelişigüzel kısmadan önce Su Kıtlığı Planı kartını ve güncel sulama kararını kontrol et.');
    }
  }

  const multiStressEvidence = latestDecisionEvidence(snapshot, 'multi-stress-synthesis');
  if (multiStressEvidence) {
    const metrics: any = multiStressEvidence.metrics ?? {};
    const details: any = multiStressEvidence.details ?? {};
    const status = String(metrics.status ?? details.status ?? 'none');
    const signals = Array.isArray(details.signals) ? details.signals : [];
    const familyLabels = signals
      .map((item: any) => String(item?.label ?? '').trim())
      .filter(Boolean)
      .slice(0, 5);
    const dominant = signals.find((item: any) => item?.family === metrics.dominantFamily)?.label ?? null;

    insights.push({
      id: 'multi-stress-synthesis-evidence',
      title: status === 'conflicted'
        ? 'Birleşik stres sinyalleri çelişiyor'
        : status === 'combined'
          ? dominant
            ? `${dominant} baskın; eşlik eden stresler var`
            : 'Birden fazla stres aynı anda izleniyor'
          : 'Birleşik stres için iki bağımsız sinyal oluşmadı',
      meaning: String(details.summary ?? 'Alt karar motorları aynı zaman penceresinde birlikte değerlendirildi.'),
      action: String(details.action ?? 'Alt karar motorlarını ve saha gözlemini birlikte takip et.'),
      evidence: [
        { label: 'Durum', value: status === 'conflicted' ? 'Çelişkili' : status === 'combined' ? 'Birleşik stres' : 'Tek/aktif stres yok' },
        { label: 'Stres ailesi', value: familyLabels.length ? familyLabels.join(' · ') : '—' },
        { label: 'Baskın stres', value: dominant || 'güvenle ayrıştırılamadı' },
        { label: 'Güven', value: String(metrics.confidence ?? details.confidence ?? 'preliminary') },
        { label: 'Uydu rolü', value: 'Destek kanıtı · tek başına neden değil' },
      ],
      confidence: metrics.confidence === 'strong'
        ? 'high'
        : metrics.confidence === 'medium'
          ? 'medium'
          : 'limited',
    });

    if (status === 'conflicted') {
      next7Days.push('Birbiriyle çelişen çoklu stres sinyallerini tek müdahaleye çevirmeden önce aynı alanda bitki, toprak ve su koşulunu sahada doğrula.');
    } else if (status === 'combined') {
      next7Days.push(dominant
        ? `${dominant} için ilgili üretim kararını önce doğrula; eşlik eden stresleri aynı saha turunda ayrı ayrı kontrol et.`
        : 'Birleşik stres alanında genel bitki görünümü, yakın plan belirti ve toprak/su koşulunu aynı saha turunda kaydet.');
    }
  }

  const taskMapEvidence = latestDecisionEvidence(snapshot, 'task-map');
  if (taskMapEvidence) {
    const metrics: any = taskMapEvidence.metrics ?? {};
    const details: any = taskMapEvidence.details ?? {};
    const zones = Array.isArray(details.zones) ? details.zones : [];
    const spatialCount = Math.max(0, Math.round(modelMetric(metrics.spatialTaskCount) ?? zones.length));
    const verifiedCount = Math.max(0, Math.round(modelMetric(metrics.verifiedPrescriptionCount) ?? 0));
    const blockedCount = Math.max(0, Math.round(modelMetric(metrics.blockedPrescriptionCount) ?? 0));
    const zoneLabels = zones
      .map((zone: any) => String(zone?.direction ?? zone?.title ?? '').trim())
      .filter(Boolean)
      .slice(0, 5);

    insights.push({
      id: 'task-map-evidence',
      title: spatialCount
        ? `Görev Haritasında ${spatialCount} konumlu açık görev var`
        : 'Görev Haritasında açık konumlu görev yok',
      meaning: spatialCount
        ? `Konumu belirlenmiş açık görevler aynı tarla haritasında birleştirildi${zoneLabels.length ? `: ${zoneLabels.join(' · ')}` : ''}. Görev bölgesi tek başına uygulama reçetesi değildir.`
        : 'Açık görevler içinde haritada gösterilecek yön/geometri bilgisi bulunmuyor.',
      action: spatialCount
        ? 'Saha turunu Görev Haritasındaki öncelikli bölgelerden başlat; reçete kapısı kapalı alanlarda doğrulama olmadan doz veya kimyasal uygulama yapma.'
        : 'Yeni konumlu görev oluştuğunda Görevlerim içindeki Görev Haritasını kullan.',
      evidence: [
        { label: 'Konumlu görev', value: String(spatialCount) },
        { label: 'Doğrulanmış uygulama', value: String(verifiedCount) },
        { label: 'Reçete kapısı kapalı', value: String(blockedCount) },
        { label: 'Sınır', value: 'Görev alanı ≠ otomatik reçete · kaba yön ≠ makine geometrisi' },
      ],
      confidence: spatialCount ? 'high' : 'limited',
    });
  }

  const observationFollowUp = latestDecisionEvidence(snapshot, 'satellite-field-observation-follow-up');
  if (observationFollowUp) {
    const details = observationFollowUp.details ?? {};
    const metrics = observationFollowUp.metrics ?? {};
    const status = String(metrics.trackedIssueStatus ?? metrics.comparisonStatus ?? 'unknown');
    const area = String(details.direction ?? 'Takip alanı').trim();
    const comparisonSummary = String(details.trackedIssueSummary ?? details.comparisonSummary ?? '').trim();
    const dueForPhoto = metrics.dueForPhoto === true;
    const statusLabel = status === 'improving'
      ? 'iyileşiyor'
      : status === 'worsening'
        ? 'kötüleşiyor'
        : status === 'stable'
          ? 'benzer seyrediyor'
          : status === 'not_visible'
            ? 'yeni fotoğrafta görünmüyor'
            : 'takipte';

    insights.push({
      id: 'field-observation-follow-up-evidence',
      title: `Saha takip alanı ${statusLabel}`,
      meaning: comparisonSummary || `${area} için aynı nokta fotoğraf/uydu takibi rapora bağlandı.`,
      action: dueForPhoto
        ? 'Takip alanından aynı noktaya yakın yeni fotoğraf çek; değişimi önceki saha kanıtıyla karşılaştır.'
        : 'Yeni uydu veya planlı takip tarihi geldiğinde aynı noktadan yeniden fotoğrafla doğrula.',
      evidence: [
        { label: 'Alan', value: area },
        { label: 'Takip durumu', value: statusLabel },
        { label: 'Yeni fotoğraf', value: dueForPhoto ? 'Zamanı geldi' : 'Henüz değil' },
      ],
      confidence: status === 'unknown' ? 'limited' : 'medium',
    });

    if (dueForPhoto) {
      next7Days.push(`${area} takip alanından aynı noktaya yakın yeni fotoğraf çek; Pusula önceki kanıtla karşılaştırsın.`);
    }
  }

  if (!snapshot.soilAnalyses.length && !hasBackboneSoilAnalysis) {
    next7Days.push(
      'Toprak analizin varsa ekle; besleme yorumlarının yalnız uydu görüntüsüne dayanmasını önle.',
    );
  }

  const effectiveMissing = (snapshot.missing ?? []).filter((item) => {
    if (item === 'activities' && backboneOperationCount > 0) return false;
    if (item === 'soil_analysis' && hasBackboneSoilAnalysis) return false;
    return true;
  });
  const uniqueActions = [...new Set(next7Days)].slice(0, 5);
  const main = insights[0];

  return {
    weeklyHeadline: main?.title ?? 'Bu haftanın tarla özeti',
    weeklySummary:
      main?.meaning ??
      'Mevcut gerçek kayıtlar bir araya getirildi. Yeni ölçümler geldikçe haftalık yorum güçlenecek.',
    insights,
    next7Days: uniqueActions,
    dataQualityNote:
      effectiveMissing.length > 0
        ? `Eksik veri kaynakları: ${effectiveMissing.length}. PUSULAPDF eksik alanlar için değer veya kesin neden üretmez.`
        : 'Ana veri kaynakları bağlı. Yorumlar yine saha gözlemiyle birlikte değerlendirilmelidir.',
  };
}
