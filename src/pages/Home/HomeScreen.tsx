import { useEffect, useMemo, useRef, useState } from 'react';
import './HomeScreen.css';
import './ClassicPusula.css';
import { onboardingStyles } from '../../styles/onboardingStyles';
import { useGamificationStore } from '../../gamification/useGamificationStore';
import { openPlanUpgrade } from '../../entitlements/planAccess';
import AppDrawer from '../../components/AppDrawer';
import PusulaPointsModal from '../../components/PusulaPointsModal';
import PusulaGuide, { type PusulaInsight } from '../../assets/pusula/PusulaGuide';
import ClassicBottomNav from '../../components/ClassicBottomNav';
import { persistHomeNotifications } from '../../features/notifications/services/notificationQueue';
import {
  isNotificationHidden,
  isNotificationRead,
  subscribeNotificationInboxState,
} from '../../features/notifications/services/notificationInboxState.service';
import { syncNotificationTasks } from '../../features/notifications/services/notificationTaskBridge.service';
import { usePhenologyStageChangeNotification } from '../../features/notifications/hooks/usePhenologyStageChangeNotification';
import PusulaFieldEventSheet from '../../features/field-events/components/PusulaFieldEventSheet';
import { usePusulaFieldEventPrompt } from '../../features/field-events/hooks/usePusulaFieldEventPrompt';
import HomeQuickSheets from '../../features/home/components/HomeQuickSheets';
import HomeTasksSheet from '../../features/tasks/components/HomeTasksSheet';
import FieldStatusCenter from '../../features/field-status/components/FieldStatusCenter';
import type { FieldTask } from '../../features/tasks/services/fieldTasks.service';
import { useFieldTasks } from '../../features/tasks/hooks/useFieldTasks';
import { useHomeFieldSelection } from '../../features/fields/hooks/useHomeFieldSelection';
import HomeFieldsSheet from '../../features/fields/components/HomeFieldsSheet';
import { useHomeWeatherSignals } from '../../features/weather/hooks/useHomeWeatherSignals';
import { buildHourlySprayPlan, formatForecastHour, isHourlySprayForecastFresh } from '../../features/weather/services/hourlySprayForecast';
import { useNextCalendarItem } from '../../features/calendar/hooks/useNextCalendarItem';
import { useHomeIrrigationDecision } from '../../features/irrigation/hooks/useHomeIrrigationDecision';
import { useHomePhenologyInsight } from '../../features/phenology/hooks/useHomePhenologyInsight';
import { useHomeNutrientContext } from '../../features/nutrition/hooks/useHomeNutrientContext';
import FieldOperationModal from '../../features/field-operations/components/FieldOperationModal';
import { useHomeDecisionEngine } from '../../features/decision/hooks/useHomeDecisionEngine';
import {
  applyNutrientGuardToFieldSynthesis,
  applyNutrientGuardToMapResult,
} from '../../features/nutrition/services/nutrientPusulaGuard.service';
import type { HomeTodayDecision } from '../../features/decision/types/homeDecision';
import HomeFieldDataStatus from '../../features/decision/components/HomeFieldDataStatus';
import { buildHomeFieldDataStatuses, hasUsableFieldWeatherForecast } from '../../features/decision/services/homeFieldDataStatus.service';
import { useHomeProfile } from '../../features/home/hooks/useHomeProfile';
import { useEnsureHomeSatellite } from '../../features/home-map/hooks/useEnsureHomeSatellite';
import { useHomeSatelliteDate } from '../../features/home-map/hooks/useHomeSatelliteDate';
import type { EarthSearchNdviStats } from '../../features/home-map/services/earthSearchNdvi.service';
import HomeMapPusulaStrip from '../../features/pusula/components/HomeMapPusulaStrip';
import { useHomePusula } from '../../features/pusula/hooks/useHomePusula';
import PusulaOperationQuestion from '../../features/pusula/components/PusulaOperationQuestion';
import PusulaFieldChange from '../../features/field-changes/components/PusulaFieldChange';
import PusulaFieldQuestion from '../../features/pusula/components/PusulaFieldQuestion';
import { usePusulaFieldCompletion, type PusulaFieldQuestionTarget } from '../../features/pusula/hooks/usePusulaFieldCompletion';
import NdviObservationFollowUpPrompt from '../../features/field-observations/components/NdviObservationFollowUpPrompt';
import { useNdviObservationFollowUp } from '../../features/field-observations/hooks/useNdviObservationFollowUp';
import HomeMapSection from '../../features/home-map/components/HomeMapSectionMapFirst';
import {
  type HomeClimateDepth,
  type HomeClimateLayer,
  type HomeLayer,
  type HomeSoilDepth,
  type HomeSoilProperty,
} from '../../features/home-map/HomeMapEngine';

type HomeScreenProps = Record<string, any>;


const HOME_NAV_V2 = {
  menu: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-v2/menu.webp',
  home: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-v2/home.webp',
  weather: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-v2/weather.webp',
  ai: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-v2/pusula-ai.webp',
  calendar: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-v2/calendar.webp',
  depot: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-v2/depot.webp',
  fields: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/02-tarlalarim-4.webp',
} as const;

const PREMIUM_ICON_BASE =
  'https://fkrqvwarxzmdrexsxtzw.supabase.co/storage/v1/object/public/ui-icons/premium';

const PREMIUM_ICON_CACHE_TAG = '20260907-set4';

const premiumIconUrl = (fileName: string) =>
  `${PREMIUM_ICON_BASE}/${fileName}?v=${PREMIUM_ICON_CACHE_TAG}`;

const UI_3D_ICONS = {
  home: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-anasayfa-transparent.webp',
  fields: premiumIconUrl('02-tarlalarim.webp'),
  ai: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-pusula-ai-transparent.webp',
  calendar: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-takvim-transparent.webp',
  profile: premiumIconUrl('05-profil.webp'),
  points: premiumIconUrl('pusula-puani-opD.webp'),
  notification: premiumIconUrl('07-bildirim.webp'),
  weather: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-hava-durumu-transparent.webp',
  menu: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/menu-transparent.webp',
  location: premiumIconUrl('10-konum.webp'),
  addField: 'https://fkrqvwarxzmdrexsxtzw.supabase.co/storage/v1/object/public/ui-icons/actions/tarla-ekle-pusula-4.webp',
  depot: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-depom-transparent.webp',
} as const;

const UI_3D_ICON_FALLBACKS: Partial<Record<keyof typeof UI_3D_ICONS, string>> = {
  home: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-anasayfa-transparent.webp',
  fields: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/02-tarlalarim-4.webp',
  ai: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-pusula-ai-transparent.webp',
  calendar: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-takvim-transparent.webp',
  profile: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/05-profil-3.webp',
  points: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/06-puan-odul-2.webp',
  notification: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/07-bildirim-3.webp',
  weather: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-hava-durumu-transparent.webp',
  menu: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/menu-transparent.webp',
  location: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/10-konum-2.webp',
  addField: 'https://fkrqvwarxzmdrexsxtzw.supabase.co/storage/v1/object/public/ui-icons/actions/tarla-ekle-pusula-4.webp',
  depot: 'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/ui-icons/transparent/nav-depom-transparent.webp',
};

type Ui3DIconName = keyof typeof UI_3D_ICONS;

function Ui3DIcon({
  name,
  className = '',
}: {
  name: Ui3DIconName;
  className?: string;
}) {
  return (
    <img
      src={UI_3D_ICONS[name]}
      className={`tp-ui3d-icon ${className}`.trim()}
      alt=""
      aria-hidden="true"
      draggable={false}
      onError={(event) => {
        const fallback = UI_3D_ICON_FALLBACKS[name];
        const image = event.currentTarget;

        if (fallback && image.dataset.tpFallback !== '1') {
          image.dataset.tpFallback = '1';
          image.src = fallback;
        }
      }}
    />
  );
}


type HomeNavIconName = 'menu' | 'home' | 'weather' | 'ai' | 'calendar' | 'fields';

function HomeNavIcon({
  name,
  className = '',
}: {
  name: HomeNavIconName;
  className?: string;
}) {
  return (
    <img
      src={HOME_NAV_V2[name]}
      className={`tp-nav-v2 ${className}`.trim()}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}


export default function HomeScreen(props: HomeScreenProps) {
  const {
    cmsRuntimeCss,
    realFields,
    setRealFields,
    favoriteFieldId,
    satelliteByField,
    loadFieldSatellite,
    fieldWeather,
    fieldHourlyWeather,
    loadFieldHourlyWeather,
    loadFieldWeather,
    setWeatherHubFieldId,
    openAddField,
    openAiAnalysisScreen,
    openCalendarScreen,
    openFieldDetail,
    handleDeleteField,
    setFieldControlFieldId,
    setScreen,
    setSideMenuOpen,
    sideMenuOpen,
    fieldStatusRequest,
  } = props;

  const gamification = useGamificationStore();
  const { profileName, points } = useHomeProfile();
  const [fieldGateNotice, setFieldGateNotice] = useState<{
    nextFieldNumber?: number;
    requiredPoints?: number;
    remainingPoints?: number;
    reason?: string;
  } | null>(null);
  const [irrigationRecordOpen, setIrrigationRecordOpen] = useState(false);
  const [fieldOperationOpen, setFieldOperationOpen] = useState(false);
  const [fieldsSheetOpen, setFieldsSheetOpen] = useState(false);
  const [quickSheet, setQuickSheet] = useState<'today' | 'notifications' | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [fieldStatusOpen, setFieldStatusOpen] = useState(false);
  const [fieldStatusInitialTab, setFieldStatusInitialTab] = useState<'summary' | 'plant' | 'crop' | 'soil' | 'irrigation' | 'risk' | 'data' | 'input'>('summary');
  const [fieldStatusInitialActionTarget, setFieldStatusInitialActionTarget] = useState<string | null>(null);
  const [fieldStatusRecordsNonce, setFieldStatusRecordsNonce] = useState(0);
  const [notificationInboxRevision, setNotificationInboxRevision] = useState(0);
  const [pointsOpen, setPointsOpen] = useState(false);
  const [homeHeaderPusulaInsight, setHomeHeaderPusulaInsight] =
    useState<PusulaInsight | null>(null);
  const [taskQuestionTarget, setTaskQuestionTarget] =
    useState<PusulaFieldQuestionTarget>(null);
  const [activeHomeLayer, setActiveHomeLayer] =
    useState<HomeLayer>('vegetation');
  const [soilMenuOpen, setSoilMenuOpen] = useState(false);
  const [homeSoilProperty, setHomeSoilProperty] =
    useState<HomeSoilProperty>('phh2o');
  const [homeSoilDepth, setHomeSoilDepth] = useState<HomeSoilDepth>('0-5cm');
  const [climateMenuOpen, setClimateMenuOpen] = useState(false);
  const [homeClimateLayer, setHomeClimateLayer] =
    useState<HomeClimateLayer>('soil-moisture');
  const [homeClimateDepth, setHomeClimateDepth] =
    useState<HomeClimateDepth>('0-7cm');
  const [homeNdviStats, setHomeNdviStats] =
    useState<EarthSearchNdviStats | null>(null);

  const {
    setFieldId: setHomeFieldId,
    field: homeField,
    fieldKey,
  } = useHomeFieldSelection({
    fields: realFields,
    favoriteFieldId,
  });

  useEffect(() => {
    const requestedFieldId = String(fieldStatusRequest?.fieldId ?? '').trim();
    if (!requestedFieldId || !fieldStatusRequest?.nonce) return;
    setHomeFieldId(requestedFieldId);
    setFieldStatusInitialTab(fieldStatusRequest.initialTab ?? 'summary');
    setFieldStatusInitialActionTarget(fieldStatusRequest.actionTarget ?? null);
    setFieldStatusOpen(true);
  }, [fieldStatusRequest?.nonce, fieldStatusRequest?.fieldId, fieldStatusRequest?.initialTab, fieldStatusRequest?.actionTarget, setHomeFieldId]);

  useEffect(() => subscribeNotificationInboxState(() => {
    setNotificationInboxRevision((value) => value + 1);
  }), []);

  useEffect(() => {
    const openFieldStatusFromEvent = (event: Event) => {
      const detail = (event as CustomEvent)?.detail ?? {};
      const requestedFieldId = String(detail.fieldId ?? '').trim();
      if (requestedFieldId) setHomeFieldId(requestedFieldId);
      const tab = String(detail.initialTab ?? 'summary') as typeof fieldStatusInitialTab;
      setQuickSheet(null);
      setTasksOpen(false);
      setFieldStatusInitialTab(tab);
      setFieldStatusInitialActionTarget(String(detail.actionTarget ?? '').trim() || null);
      setFieldStatusOpen(true);
    };
    window.addEventListener('tp:open-field-status', openFieldStatusFromEvent);
    return () => window.removeEventListener('tp:open-field-status', openFieldStatusFromEvent);
  }, [setHomeFieldId]);

  useEffect(() => {
    setHomeNdviStats(null);
  }, [fieldKey]);


  /*
   * Görevlerim ve Bildirimler aynı field_todos kaynağını kullanır.
   * Bildirimde görünen aksiyonlar ayrı sahte kayıt değildir.
   */
  const homeTasks = useFieldTasks(
    fieldKey,
    Boolean(fieldKey && homeField && !homeField.demo),
  );

  const {
    question: pusulaFieldQuestion,
    answerQuestion: answerPusulaFieldQuestion,
  } = usePusulaFieldCompletion({
    field: homeField,
    fields: realFields,
    preferredQuestion: taskQuestionTarget,
  });

  useEffect(() => {
    setTaskQuestionTarget(null);
  }, [fieldKey]);

  const [operationQuestionVisible, setOperationQuestionVisible] = useState(false);

  useEffect(() => {
    const handleNativeBack = (event: Event) => {
      const detail =
        (event as CustomEvent<{ handled?: boolean }>).detail ?? {};

      if (detail.handled) return;

      if (fieldStatusOpen) {
        detail.handled = true;
        setFieldStatusOpen(false);
        return;
      }

      if (fieldOperationOpen) {
        detail.handled = true;
        setFieldOperationOpen(false);
        return;
      }

      if (irrigationRecordOpen) {
        detail.handled = true;
        setIrrigationRecordOpen(false);
        return;
      }

      if (fieldsSheetOpen) {
        detail.handled = true;
        setFieldsSheetOpen(false);
        return;
      }

      if (quickSheet) {
        detail.handled = true;
        setQuickSheet(null);
        return;
      }

      if (tasksOpen) {
        detail.handled = true;
        setTasksOpen(false);
        return;
      }

      if (pointsOpen) {
        detail.handled = true;
        setPointsOpen(false);
        return;
      }

      if (soilMenuOpen) {
        detail.handled = true;
        setSoilMenuOpen(false);
        return;
      }

      if (climateMenuOpen) {
        detail.handled = true;
        setClimateMenuOpen(false);
        return;
      }

      if (operationQuestionVisible) {
        detail.handled = true;
        setOperationQuestionVisible(false);
      }
    };

    window.addEventListener(
      'tp:native-back',
      handleNativeBack as EventListener,
    );

    return () => {
      window.removeEventListener(
        'tp:native-back',
        handleNativeBack as EventListener,
      );
    };
  }, [
    fieldStatusOpen,
    fieldOperationOpen,
    irrigationRecordOpen,
    fieldsSheetOpen,
    quickSheet,
    tasksOpen,
    pointsOpen,
    soilMenuOpen,
    climateMenuOpen,
    operationQuestionVisible,
  ]);
  const homeIrrigation = useHomeIrrigationDecision(homeField);
  const homeNutrient = useHomeNutrientContext(homeField);
  const homePhenology = useHomePhenologyInsight(homeField);
  const decisionPhenology =
    homePhenology.phenology?.dataStatus === 'usable' &&
    homePhenology.phenology.stage &&
    homePhenology.phenology.stage !== 'unknown'
      ? homePhenology.phenology
      : null;

  const sharedPhenologySignatureRef = useRef('');
  const sharedPhenologySignature =
    decisionPhenology?.dataStatus === 'usable' &&
    decisionPhenology.stage &&
    decisionPhenology.stage !== 'unknown'
      ? [
          fieldKey,
          decisionPhenology.stage,
          decisionPhenology.stageLabel ?? '',
          decisionPhenology.confidence ?? '',
          ...(Array.isArray(decisionPhenology.basis)
            ? decisionPhenology.basis
            : decisionPhenology.basis
              ? [String(decisionPhenology.basis)]
              : []),
        ].join('|')
      : '';

  useEffect(() => {
    if (
      !fieldKey ||
      homeField?.demo ||
      !decisionPhenology ||
      !sharedPhenologySignature
    ) {
      sharedPhenologySignatureRef.current = '';
      return;
    }

    if (sharedPhenologySignatureRef.current === sharedPhenologySignature) {
      return;
    }

    sharedPhenologySignatureRef.current = sharedPhenologySignature;

    window.dispatchEvent(
      new CustomEvent('tp:field-context-updated', {
        detail: {
          fieldId: fieldKey,
          changedFields: ['phenology_context'],
          source: 'home-phenology-fusion',
          phenology: {
            stage: decisionPhenology.stage,
            stageLabel: decisionPhenology.stageLabel,
            confidence: decisionPhenology.confidence,
            dataStatus: decisionPhenology.dataStatus,
            basis: decisionPhenology.basis,
          },
        },
      }),
    );
  }, [
    fieldKey,
    homeField?.demo,
    sharedPhenologySignature,
    decisionPhenology?.stage,
    decisionPhenology?.stageLabel,
    decisionPhenology?.confidence,
    decisionPhenology?.dataStatus,
  ]);

  const phenologyStageChangeNotification = usePhenologyStageChangeNotification({
    fieldId: fieldKey,
    fieldName: String(homeField?.name ?? 'Tarlan'),
    phenology: decisionPhenology,
    enabled: Boolean(fieldKey && homeField && !homeField.demo),
  });

  const fieldEventPrompt = usePusulaFieldEventPrompt({
    fieldId: fieldKey,
    enabled: Boolean(fieldKey && homeField && !homeField.demo),
  });

  const satState = satelliteByField?.[fieldKey];
  const sat = satState?.data;
  const weather = fieldWeather?.__home__;
  const selectedFieldWeather = fieldKey ? fieldWeather?.[fieldKey] : null;
  const selectedHourlyWeather = fieldKey ? fieldHourlyWeather?.[fieldKey] : null;
  const [hourlyClock, setHourlyClock] = useState(() => Date.now());
  const hourlyPlan = buildHourlySprayPlan(
    selectedHourlyWeather?.status === 'ready' ? selectedHourlyWeather.data : null,
    hourlyClock,
  );
  const requestedFieldForecasts = useRef(new Set<string>());

  useEffect(() => {
    if (!homeField || homeField.demo || !fieldKey || typeof loadFieldWeather !== 'function') return;
    if (selectedFieldWeather || requestedFieldForecasts.current.has(fieldKey)) return;
    requestedFieldForecasts.current.add(fieldKey);
    void loadFieldWeather(homeField);
  }, [fieldKey, homeField, selectedFieldWeather, loadFieldWeather]);

  useEffect(() => {
    if (!homeField || homeField.demo || !fieldKey || typeof loadFieldHourlyWeather !== 'function') return;
    const update = () => {
      if (document.visibilityState !== 'visible') return;
      setHourlyClock(Date.now());
      void loadFieldHourlyWeather(homeField);
    };
    update();
    const timer = window.setInterval(update, 30 * 60 * 1000);
    document.addEventListener('visibilitychange', update);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', update); };
  }, [fieldKey, homeField, loadFieldHourlyWeather]);

  useEnsureHomeSatellite({
    field: homeField,
    fieldKey,
    status: satState?.status,
    loadFieldSatellite,
  });

  const resolvedHomeSatelliteDate = useHomeSatelliteDate({
    fieldKey,
    parcelGeometry: homeField?.parcelGeometry,
    satelliteDate: sat?.latestImageDate,
  });

  const {
    todayWeather,
    headerTemperatureLabel: headerWeatherTemperatureLabel,
    headerCondition: headerWeatherCondition,
    headerLocation: headerWeatherLocation,
  } = useHomeWeatherSignals({ weather, field: homeField });

  const {
    rainChance: quickRainChance,
    rainMm: quickRainMm,
    windKmh: quickWindKmh,
    temperature: quickTemperature,
    temperatureMin: quickTemperatureMin,
    hasUsableTodayWeather,
    irrigationQuick,
    sprayingQuick: dailySprayingQuick,
  } = useHomeWeatherSignals({
    weather: homeField?.demo ? weather : selectedFieldWeather,
    field: homeField,
  });

  const hourlyForecastFresh = selectedHourlyWeather?.status === 'ready' &&
    isHourlySprayForecastFresh(selectedHourlyWeather.data, hourlyClock);
  const nextHourlyWindow = hourlyPlan.windows[0];
  const sprayingQuick = homeField && !homeField.demo && selectedHourlyWeather?.status === 'ready'
    ? !hourlyForecastFresh
      ? { tone: 'neutral', title: 'Saatlik tahmini yenile', detail: hourlyPlan.message }
      : nextHourlyWindow && selectedHourlyWeather.data
      ? {
          tone: 'neutral',
          title: `Bugün ilaçlama havası uygun: ${formatForecastHour(nextHourlyWindow.from, selectedHourlyWeather.data.timezone)}–${formatForecastHour(nextHourlyWindow.to, selectedHourlyWeather.data.timezone)}`,
          detail: `Saatlik hava tahminine göre ${formatForecastHour(nextHourlyWindow.from, selectedHourlyWeather.data.timezone)}–${formatForecastHour(nextHourlyWindow.to, selectedHourlyWeather.data.timezone)} aralığını değerlendirebilirsin. ${hourlyPlan.nextRisk && hourlyPlan.nextRiskAt != null && hourlyPlan.nextRiskAt >= nextHourlyWindow.to ? `Sonrasında ${hourlyPlan.nextRisk}. ` : ''}İşlem öncesi tarladaki koşulları ve ürün etiketini kontrol et.`,
        }
      : { tone: 'neutral', title: 'Bugün ilaçlama havası uygun görünmüyor', detail: hourlyPlan.message }
    : homeField && !homeField.demo && selectedHourlyWeather?.status === 'error'
      ? { tone: 'neutral', title: 'Saatlik hava alınamadı', detail: 'İlaçlama saatini tahmin olmadan seçme; hava ekranından yeniden dene.' }
      : homeField && !homeField.demo && selectedHourlyWeather?.status === 'loading'
        ? { tone: 'neutral', title: 'Saatlik hava hazırlanıyor', detail: 'İlaçlama saati için tarla tahmini bekleniyor.' }
      : dailySprayingQuick;

  const homePusula = useHomePusula({
    field: homeField,
    fieldKey,
    layer: activeHomeLayer,
    soilProperty: homeSoilProperty,
    soilDepth: homeSoilDepth,
    climateLayer: homeClimateLayer,
    climateDepth: homeClimateDepth,
    weather,
    satellite: sat,
    ndviStats: homeNdviStats,
    phenology: decisionPhenology,
  });

  const {
    loading: homePusulaLoading,
    result: rawHomePusulaResult,
    error: homePusulaError,
    fieldSynthesis: rawFieldSynthesis,
    setSpatialSummary: setHomeLayerSpatialSummary,
    run: runHomePusula,
    layerLabel: activeHomeLayerLabel,
    headline: rawDisplayHeadline,
    summary: rawDisplaySummary,
  } = homePusula;

  const {
    followUp: ndviPhotoFollowUp,
    latestPoint: ndviTrackedPoint,
    latestComparison: ndviLatestComparison,
    dismiss: dismissNdviPhotoFollowUp,
    consume: consumeNdviPhotoFollowUp,
  } = useNdviObservationFollowUp({
    fieldId: homeField?.id,
    satelliteDate: resolvedHomeSatelliteDate,
    pusulaResult: rawHomePusulaResult,
  });

  // Alt katman veya derinlik değişirken önce önceki seçime ait uzamsal özeti
  // temizle. Böylece yeni veri gelene kadar eski katmanın sayısal özeti yeni
  // katmana taşınmaz.
  const setHomeSoilPropertySafe: typeof setHomeSoilProperty = (nextValue) => {
    setHomeLayerSpatialSummary(null);
    setHomeSoilProperty(nextValue);
  };

  const setHomeSoilDepthSafe: typeof setHomeSoilDepth = (nextValue) => {
    setHomeLayerSpatialSummary(null);
    setHomeSoilDepth(nextValue);
  };

  const setHomeClimateLayerSafe: typeof setHomeClimateLayer = (nextValue) => {
    setHomeLayerSpatialSummary(null);
    setHomeClimateLayer(nextValue);
  };

  const setHomeClimateDepthSafe: typeof setHomeClimateDepth = (nextValue) => {
    setHomeLayerSpatialSummary(null);
    setHomeClimateDepth(nextValue);
  };

  const resolvedPoints =
    gamification.status === 'ready' ? gamification.points : points;

  const headerPointsLabel =
    gamification.status === 'loading' && points == null
      ? '…'
      : `${Number(resolvedPoints ?? 0).toLocaleString('tr-TR')} P`;

  const nextCalendarItem = useNextCalendarItem({
    calendarItems: props.calendarItems,
    calendarEvents: props.calendarEvents,
    upcomingTasks: props.upcomingTasks,
    tasks: props.tasks,
    reminders: props.reminders,
  });

  const {
    todayDecisions: todayDecisionCards,
    notifications: homeSystemNotifications,
    pusulaDecision,
    nutrientProductionGuard,
    events: homeDecisionEvents,
    recentFieldOperations,
    recentFieldOperationsReady,
  } = useHomeDecisionEngine({
    fieldKey,
    activeHomeLayer,
    weatherStatus: homeField?.demo ? weather?.status : selectedFieldWeather?.status,
    hasUsableTodayWeather,
    quickTemperatureMin,
    quickTemperature,
    quickWindKmh,
    quickRainChance,
    quickRainMm,
    nextCalendarItem,
    fieldSynthesis: rawFieldSynthesis,
    homePusulaResult: rawHomePusulaResult,
    homeNdviStats,
    irrigationDecision: homeIrrigation.decision,
    irrigationLoading: homeIrrigation.loading,
    irrigationError: homeIrrigation.error,
    nutrient: homeNutrient,
    satelliteTrend: homePhenology.ndviTrend && homeField?.id != null
      ? {
          fieldId: fieldKey,
          status: homePhenology.timeSeriesStatus,
          quality: homePhenology.ndviTrend.quality,
          direction: homePhenology.ndviTrend.direction,
          observationCount: homePhenology.timeSeriesObservationCount,
          spanDays: homePhenology.timeSeriesSpanDays,
          latestDate: homePhenology.timeSeriesLatestDate,
        }
      : null,
    phenology: decisionPhenology,
    phenologyTimeSeriesStatus: homePhenology.timeSeriesStatus,
    irrigationQuick,
    sprayingQuick,
    hourlySprayWindow: Boolean(nextHourlyWindow),
    hourlySprayNextWindow: nextHourlyWindow && selectedHourlyWeather?.status === 'ready' && selectedHourlyWeather.data
      ? {
          from: nextHourlyWindow.from,
          to: nextHourlyWindow.to,
          label: `${formatForecastHour(nextHourlyWindow.from, selectedHourlyWeather.data.timezone)}–${formatForecastHour(nextHourlyWindow.to, selectedHourlyWeather.data.timezone)}`,
        }
      : null,
    hourlySprayForecastReady: hourlyForecastFresh,
    hourlySprayRisk: hourlyForecastFresh && hourlyPlan.nextRiskAt != null && hourlyPlan.nextRisk
      ? { at: hourlyPlan.nextRiskAt, detail: hourlyPlan.nextRisk }
      : null,
    resolvedHomeSatelliteDate,
    homeFieldId: homeField?.id,
    homeFieldCrop: homeField?.crop,
    observationFollowUp: ndviTrackedPoint
      ? {
          pointId: ndviTrackedPoint.id,
          direction: ndviTrackedPoint.direction,
          areaGeometry: ndviTrackedPoint.areaGeometry,
          latestSatelliteDate: ndviTrackedPoint.latestSatelliteDate,
          nextPhotoDueAt: ndviTrackedPoint.nextPhotoDueAt,
          comparisonStatus: ndviLatestComparison?.status ?? null,
          comparisonSummary: ndviLatestComparison?.summary ?? null,
          comparedAt: ndviLatestComparison?.comparedAt ?? null,
          trackedIssueLabel:
            String((ndviLatestComparison?.details as any)?.trackedIssue?.possibleIssue ?? '').trim() || null,
          trackedIssueStatus:
            ((ndviLatestComparison?.details as any)?.aiComparison?.trackedIssueStatus ?? null),
          trackedIssueSummary:
            String((ndviLatestComparison?.details as any)?.aiComparison?.trackedIssueSummary ?? '').trim() || null,
          dueForPhoto: ndviPhotoFollowUp?.id === ndviTrackedPoint.id,
        }
      : null,
  });

  // 14.4: Pusula'nın ham harita ve field-synthesis yorumları kullanıcıya
  // gösterilmeden önce HomeDecisionEngine'in ürettiği aynı production
  // besin guard sonucundan geçirilir. Böylece ikinci bir besin otoritesi yoktur.
  const homePusulaResult = useMemo(
    () =>
      applyNutrientGuardToMapResult(
        rawHomePusulaResult,
        nutrientProductionGuard,
      ),
    [rawHomePusulaResult, nutrientProductionGuard],
  );

  const fieldSynthesis = useMemo(
    () =>
      applyNutrientGuardToFieldSynthesis(
        rawFieldSynthesis,
        nutrientProductionGuard,
      ),
    [rawFieldSynthesis, nutrientProductionGuard],
  );

  const displayHeadline =
    fieldSynthesis?.headline ??
    homePusulaResult?.analysis?.headline ??
    rawDisplayHeadline;
  const displaySummary =
    fieldSynthesis?.summary ??
    homePusulaResult?.analysis?.summary ??
    rawDisplaySummary;

  const visibleHomeSystemNotifications = useMemo(() => {
    const merged = phenologyStageChangeNotification
      ? [
          phenologyStageChangeNotification,
          ...homeSystemNotifications.filter(
            (item) => item.id !== phenologyStageChangeNotification.id,
          ),
        ]
      : homeSystemNotifications;

    return [...merged]
      .filter((item) => !isNotificationHidden(item.id))
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))
      .slice(0, 12);
  }, [homeSystemNotifications, phenologyStageChangeNotification, notificationInboxRevision]);

  const homeNotificationCount = visibleHomeSystemNotifications.filter(
    (item) => !item.task && !isNotificationRead(item.id),
  ).length;

  const notificationTaskSyncKey = visibleHomeSystemNotifications
    .map((item: any) => [
      String(item?.id ?? ''),
      String(item?.task?.id ?? ''),
      String(item?.task?.status ?? ''),
      String(item?.title ?? ''),
    ].join(':'))
    .sort()
    .join('|');

  const ndviTaskAuthorityKey = [
    String(homeNdviStats?.sceneId ?? ''),
    String(homeNdviStats?.datetime ?? ''),
    ...(homeNdviStats?.relativeZones ?? [])
      .filter((zone) => zone?.status === 'weaker')
      .map((zone) => `${zone.area}:${Number(zone.deltaFromFieldMean).toFixed(4)}`)
      .sort(),
  ].join('|');
  const lastNotificationTaskSyncRef = useRef('');

  useEffect(() => {
    if (!fieldKey || homeField?.demo) return;

    const syncKey = `${fieldKey}::${notificationTaskSyncKey}::${ndviTaskAuthorityKey}`;
    if (lastNotificationTaskSyncRef.current === syncKey) return;
    lastNotificationTaskSyncRef.current = syncKey;

    let cancelled = false;

    void syncNotificationTasks(
      fieldKey,
      visibleHomeSystemNotifications,
      homeNdviStats,
    )
      .then(() => {
        if (!cancelled) return homeTasks.refresh();
      })
      .catch((error) => {
        if (lastNotificationTaskSyncRef.current === syncKey) {
          lastNotificationTaskSyncRef.current = '';
        }
        console.warn('[tasks] Bildirim görevleri senkronize edilemedi:', error);
      });

    return () => {
      cancelled = true;
    };
  }, [
    fieldKey,
    homeField?.demo,
    notificationTaskSyncKey,
    ndviTaskAuthorityKey,
    homeNdviStats,
    homeTasks.refresh,
  ]);

  const hasRecentFieldForecast = hasUsableFieldWeatherForecast(selectedFieldWeather);
  const fieldDataStatuses = buildHomeFieldDataStatuses({
    weather: { status: selectedFieldWeather?.status, available: Boolean(hasRecentFieldForecast) },
    phenology: {
      status: homePhenology.phenologyContextStatus,
      usable: decisionPhenology?.dataStatus === 'usable' && decisionPhenology.stage !== 'unknown',
      stageLabel: decisionPhenology?.stageLabel,
    },
    satellite: {
      status: homePhenology.timeSeriesStatus,
      quality: homePhenology.ndviTrend?.quality,
      observationCount: homePhenology.timeSeriesObservationCount,
      latestDate: homePhenology.timeSeriesLatestDate,
    },
    soil: {
      status: homeNutrient.status,
      reportDate: homeNutrient.latestAnalysis?.field_id === fieldKey
        ? homeNutrient.latestAnalysis.created_at : null,
    },
    irrigation: { status: homeIrrigation.status, decisionCode: homeIrrigation.decision?.decision },
  });

  /*
   * Pusula logosu normal analiz / karar / bildirim geldiğinde artık
   * aşağı inmez. Sadece kullanıcıdan gerçekten eksik bilgi istenirken
   * soru bileşeni aktif olur ve header logosu o sırada yerini bırakır.
   */
  const pusulaGuideAway = Boolean(
    pusulaFieldQuestion || ndviPhotoFollowUp || fieldEventPrompt.open,
  );

  const openHomeInsightTarget = (
    target: HomeTodayDecision['target'],
    context?: { observationPointId?: string | null; source?: string | null },
  ) => {
    if (target === 'field_growth') {
      if (homeField) {
        setQuickSheet(null);
        setTasksOpen(false);
        setFieldStatusInitialTab('plant');
        setFieldStatusOpen(true);
      } else {
        setScreen?.('home');
      }
      return;
    }

    if (target === 'map_vegetation') {
      openMapLayer('vegetation');
      window.setTimeout(() => {
        document.querySelector('.tp-map-stage')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 80);
      return;
    }

    if (target === 'irrigation_detail') {
      setQuickSheet(null);
      setTasksOpen(false);
      setFieldStatusInitialTab('irrigation');
      setFieldStatusOpen(true);
      return;
    }

    if (target === 'soil') {
      setQuickSheet(null);
      setTasksOpen(false);
      setFieldStatusInitialTab('soil');
      setFieldStatusOpen(true);
      return;
    }

    if (target === 'calendar') {
      if (typeof openCalendarScreen === 'function') {
        openCalendarScreen();
      } else {
        setScreen?.('calendar');
      }
      return;
    }

    if (target === 'ai') {
      if (typeof openAiAnalysisScreen === 'function') {
        openAiAnalysisScreen(homeField, context);
      } else {
        setScreen?.('aiAnalysis');
      }
      return;
    }

    if (target === 'weather') {
      if (fieldKey && typeof setWeatherHubFieldId === 'function') setWeatherHubFieldId(fieldKey);
      setScreen?.('weatherHub');
      return;
    }

    if (target === 'spray_weather') {
      if (fieldKey && typeof setWeatherHubFieldId === 'function') setWeatherHubFieldId(fieldKey);
      setScreen?.('weatherHub');
      window.setTimeout(() => document.getElementById('tp-spray-guide')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 180);
      return;
    }

    setScreen?.('home');
  };

  useEffect(() => {
    persistHomeNotifications({
      fieldId: fieldKey,
      fieldName: String(homeField?.name ?? 'Tarlan'),
      notifications: visibleHomeSystemNotifications,
    });
  }, [fieldKey, homeField?.name, visibleHomeSystemNotifications]);


  const openMapLayer = (section: HomeLayer) => {
    setActiveHomeLayer(section);
    setHomeLayerSpatialSummary(null);

    setSoilMenuOpen(section === 'soil');
    setClimateMenuOpen(section === 'climate');
  };

  const openFieldTask = (task: FieldTask) => {
    setTasksOpen(false);
    setQuickSheet(null);

    /*
     * action_target boş kalsa bile task_key üzerinden aynı noktaya
     * gidebiliriz. Böylece eski / yeni görev kayıtları bozulmaz.
     */
    const taskKeyTarget: Record<string, string> = {
      'irrigation-status': 'field-irrigation-status',
      'irrigation-method': 'field-irrigation-status',
      'model-surface-water-measurement': 'field-water-measurement',
      'canopy-development': 'field-canopy-development',
      'canopy-height': 'field-canopy-height',
      'model-planting-date': 'field-season',
      'model-last-irrigation': 'field-operation:Sulama',

      /* İleride üretilecek Pusula görevleri için hazır hedefler. */
      'soil-analysis': 'soil-analysis',
      'field-photo': 'field-photo',
      'ndvi-observation': 'map-observation',
      'weather-check': 'weather',
      'spray-weather': 'spray-weather',
      'irrigation-review': 'irrigation-detail',
      'calendar-task': 'calendar',
      'ai-analysis': 'ai',
    };

    const target =
      String(task.actionTarget ?? '').trim() ||
      taskKeyTarget[String(task.taskKey ?? '').trim()] ||
      '';

    /*
     * Eksik tarla bilgileri: kullanıcıyı başka bir sayfaya değil,
     * doğrudan o alanın gerçek seçim ekranına götür.
     */
    const fieldQuestionTargets: Record<
      string,
      Exclude<PusulaFieldQuestionTarget, null>
    > = {
      'field-irrigation-status': 'irrigation-status',
      'field-irrigation-method': 'irrigation-status',
      'field-canopy-development': 'canopy-development',
      'field-canopy-height': 'canopy-height',
    };

    const directQuestion = fieldQuestionTargets[target];
    if (directQuestion) {
      setTaskQuestionTarget(directQuestion);
      return;
    }

    /*
     * Gelişim / toprak / sulama gibi durum hedefleri artık eski Tarla Detayı'na
     * değil doğrudan yeni Tarla Durumu merkezinin ilgili sekmesine gider.
     */
    if (target === 'field-growth' && homeField) {
      setFieldStatusInitialTab('plant');
      setFieldStatusOpen(true);
      return;
    }

    if ((target === 'field-soil' || target === 'field-soil-profile') && homeField) {
      setFieldStatusInitialTab('soil');
      setFieldStatusOpen(true);
      return;
    }

    if (target === 'field-water-measurement' && homeField) {
      setFieldStatusInitialTab('input');
      setFieldStatusInitialActionTarget('field-water-measurement');
      setFieldStatusOpen(true);
      return;
    }

    if ((target === 'field-irrigation' || target === 'field-water') && homeField) {
      setFieldStatusInitialTab('irrigation');
      setFieldStatusInitialActionTarget(target);
      setFieldStatusOpen(true);
      return;
    }

    /* Ekim / dikim tarihi doğrudan veri giriş formuna gider. */
    if (target === 'field-season' && homeField) {
      openFieldDetail(homeField, {
        actionTarget: 'field-season',
      });
      return;
    }

    /*
     * Son sulama:
     * direkt yeni Sulama operasyonu giriş formu.
     */
    if (
      target === 'field-operation:Sulama' ||
      target === 'field-operation:irrigation'
    ) {
      setIrrigationRecordOpen(true);
      return;
    }

    /*
     * Toprak analizi:
     * seçili tarlanın analiz yükleme / giriş ekranı.
     */
    if (
      target === 'soil-analysis' ||
      target === 'field-soil-analysis'
    ) {
      setQuickSheet(null);
      setTasksOpen(false);
      setFieldStatusInitialTab('soil');
      setFieldStatusOpen(true);
      return;
    }

    /*
     * Harita / saha kontrolü / fotoğraf görevi:
     * direkt Sağlık katmanına git, ilgili alanı göster;
     * fotoğraf görevi ise fotoğraf girişini de aç.
     */
    if (
      target === 'map-observation' ||
      target === 'map-vegetation' ||
      target === 'field-photo' ||
      target === 'field-observation'
    ) {
      const sourceLayer = String(
        task.metadata?.sourceLayer ?? 'vegetation',
      ).trim() || 'vegetation';

      openMapLayer(sourceLayer as any);

      const importantArea =
        (task.metadata?.importantArea as
          | { area?: unknown; geometry?: unknown }
          | undefined) ??
        (
          task.metadata?.direction || task.metadata?.areaGeometry
            ? {
                area: task.metadata?.direction,
                geometry: task.metadata?.areaGeometry,
              }
            : undefined
        );

      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent('tp:home-map-show-pusula-area', {
            detail: {
              fieldId: String(homeField?.id ?? ''),
              layer: sourceLayer,
              openPhoto:
                target === 'field-photo' ||
                Boolean(task.metadata?.openPhoto),
              importantArea,
            },
          }),
        );

        document
          .querySelector('.tp-map-stage')
          ?.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
      }, 160);

      return;
    }

    /* Hava görevi: seçili tarlanın hava ekranı. */
    if (
      target === 'weather' ||
      target === 'field-weather'
    ) {
      openHomeInsightTarget('weather');
      return;
    }

    /* İlaçlama saati görevi: doğrudan saatlik uygunluk alanı. */
    if (
      target === 'spray-weather' ||
      target === 'field-spray-weather'
    ) {
      openHomeInsightTarget('spray_weather');
      return;
    }

    /* Sulama değerlendirme görevi: direkt sulama karar detayı. */
    if (
      target === 'irrigation-detail' ||
      target === 'field-irrigation-detail'
    ) {
      openHomeInsightTarget('irrigation_detail');
      return;
    }

    /* Takvim görevi: doğrudan Takvim. */
    if (target === 'calendar') {
      openHomeInsightTarget('calendar');
      return;
    }

    /* AI teşhis görevi: doğrudan AI analiz ekranı. */
    if (
      target === 'ai' ||
      target === 'ai-analysis'
    ) {
      openHomeInsightTarget('ai');
      return;
    }

    /*
     * Tarla Detayı içindeki gelecekteki hedeflerde sayfayı aç.
     * actionTarget App tarafına aktarılır; desteklenen hedefler
     * zamanla kendi alanlarına nokta atışı bağlanabilir.
     */
    if (homeField && target.startsWith('field-')) {
      openFieldDetail(homeField, {
        actionTarget: target,
      });
      return;
    }

    /*
     * Hedef tanımsızsa kullanıcıyı anlamsız bir ekrana atma.
     * Seçili tarlanın görev panelinde kalmak yerine tarla detayına
     * güvenli geçiş yap.
     */
    if (homeField) {
      openFieldDetail(homeField);
    }
  };

  const goDrawer = (screen: string, label: string) => {
    setSideMenuOpen(false);
    if (label === 'Tarlalarım') {
      setScreen('home');
      window.setTimeout(
        () =>
          document
            .querySelector('.tp-home-field')
            ?.scrollIntoView({ behavior: 'smooth' }),
        80
      );
      return;
    }
    setScreen(screen);
  };

  const handleHomeHeaderPusulaClick = () => {
    if (fieldEventPrompt.candidate) {
      fieldEventPrompt.openPrompt();
      return;
    }

    const headline = String(displayHeadline ?? '').trim();
    const summary = String(displaySummary ?? '').trim();

    setHomeHeaderPusulaInsight({
      id: `home-header-manual-${fieldKey || 'field'}-${Date.now()}`,
      gozlem:
        headline ||
        `${String(homeField?.name ?? 'Tarlan')} için güncel verileri birlikte takip ediyorum.`,
      yonlendirme:
        summary ||
        'Harita, hava, görevler ve tarla kayıtların güncellendikçe önemli değişiklikleri burada öne çıkaracağım.',
    });
  };

  const handleAddFieldClick = () => {
    try {
      window.sessionStorage.removeItem('tp_field_gate_notice');
    } catch {
      // sessionStorage kullanılamıyorsa normal akış devam eder.
    }

    try {
      if (typeof openAddField === 'function') {
        openAddField();
      } else {
        setScreen?.('addField');
        return;
      }
    } catch (error) {
      console.error('Tarla ekleme ekranı açılamadı:', error);
      setScreen?.('addField');
      return;
    }

    // App.tsx, puan/tarla hakkı yetersiz olduğunda ekranı home'da bırakıp
    // sebebi tp_field_gate_notice içine yazıyor. Bunu görünür bir uyarıya çevir.
    window.setTimeout(() => {
      try {
        const raw = window.sessionStorage.getItem('tp_field_gate_notice');
        if (!raw) return;

        const parsed = JSON.parse(raw);
        setFieldGateNotice({
          nextFieldNumber: Number(parsed?.nextFieldNumber) || undefined,
          requiredPoints: Number(parsed?.requiredPoints) || undefined,
          remainingPoints: Number(parsed?.remainingPoints) || undefined,
          reason: String(parsed?.reason || ''),
        });

        window.sessionStorage.removeItem('tp_field_gate_notice');
      } catch {
        // Geçersiz/geçici storage verisinde uyarı göstermeden devam et.
      }
    }, 0);
  };

  return (
    <>
      <style>{cmsRuntimeCss + onboardingStyles}</style>

      {!pusulaGuideAway && !operationQuestionVisible ? (
        <PusulaGuide
          insight={homeHeaderPusulaInsight}
          anchorSelector=".tp-brand-pusula-anchor"
          hasUnread={Boolean(
            fieldEventPrompt.candidate && fieldEventPrompt.needsAttention,
          )}
          onLogoClick={handleHomeHeaderPusulaClick}
        />
      ) : null}

      {pusulaFieldQuestion ? (
        <PusulaFieldQuestion
          question={pusulaFieldQuestion}
          onAnswer={async (value) => {
            await answerPusulaFieldQuestion(value);
            setTaskQuestionTarget(null);
          }}
        />
      ) : ndviPhotoFollowUp ? (
        <NdviObservationFollowUpPrompt
          point={ndviPhotoFollowUp}
          fieldName={String(homeField?.name ?? 'Tarlan')}
          onLater={() => void dismissNdviPhotoFollowUp()}
          onOpen={() => {
            consumeNdviPhotoFollowUp();
            openMapLayer('vegetation');

            if (typeof window !== 'undefined') {
              window.setTimeout(() => {
                window.dispatchEvent(
                  new CustomEvent('tp:home-map-show-pusula-area', {
                    detail: {
                      fieldId: String(homeField?.id ?? ''),
                      layer: 'vegetation',
                      openPhoto: true,
                      importantArea: {
                        area: ndviPhotoFollowUp.direction,
                        geometry: ndviPhotoFollowUp.areaGeometry,
                      },
                    },
                  }),
                );

                document
                  .querySelector('.tp-map-stage')
                  ?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'center',
                  });
              }, 180);
            }
          }}
        />
      ) : null}

      <div className="tp-v1">
        <AppDrawer
          open={sideMenuOpen}
          onClose={() => setSideMenuOpen(false)}
          onNavigate={(target, label) => goDrawer(String(target), label)}
          profileName={profileName}
          points={resolvedPoints}
        />

        <PusulaPointsModal
          open={pointsOpen}
          onClose={() => setPointsOpen(false)}
          points={resolvedPoints}
        />

        <header className="tp-v1-header">
          <button
            className="tp-menu-btn"
            onClick={() => setSideMenuOpen(true)}
            aria-label="Menüyü aç"
          >
            <HomeNavIcon name="menu" className="tp-ui3d-menu" />
          </button>
          <div className="tp-brand-pusula-wrap">
            <button
              type="button"
              className={`tp-brand-pusula-anchor${
                pusulaGuideAway || operationQuestionVisible ? ' tp-brand-pusula-away' : ''
              }${
                fieldEventPrompt.candidate &&
                fieldEventPrompt.needsAttention &&
                !pusulaGuideAway &&
                !operationQuestionVisible
                  ? ' tp-brand-pusula-event-attention'
                  : ''
              }`}
              aria-label={
                fieldEventPrompt.candidate
                  ? 'Pusula bir tarla değişikliği fark etti'
                  : 'Pusula'
              }
              title={
                fieldEventPrompt.candidate
                  ? 'Pusula bir şey fark etti'
                  : 'Pusula'
              }
              onClick={handleHomeHeaderPusulaClick}
            >
              <img
                src="https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-body.webp"
                alt="Pusula"
                draggable={false}
              />
              <img
                className="tp-brand-pusula-needle"
                src="https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-needle-centered.webp"
                alt=""
                aria-hidden="true"
                draggable={false}
              />
            </button>
          </div>
          <div className="tp-header-right">
            <button
              type="button"
              className="tp-header-weather"
              onClick={() => setScreen?.('weatherHub')}
              aria-label={`${headerWeatherLocation}, ${headerWeatherTemperatureLabel}, ${headerWeatherCondition}`}
              title="Hava Durumu"
            >
              <Ui3DIcon name="weather" className="tp-ui3d-header-weather" />
              <span className="tp-header-weather-copy">
                <small>{headerWeatherLocation}</small>
                <strong>{headerWeatherTemperatureLabel}</strong>
                <em>{headerWeatherCondition}</em>
              </span>
            </button>

            <button
              type="button"
              className="tp-score"
              aria-label={`Pusula puanı ${headerPointsLabel}`}
              title="Pusula Puanı"
              onClick={() => setPointsOpen(true)}
            >
              <span className="tp-score-opd-emblem" aria-hidden="true">
                <Ui3DIcon name="points" className="tp-ui3d-score-opd-source" />
              </span>
              <span className="tp-score-opd-label">PUSULA PUANI</span>
              <span className="tp-score-opd-value">{headerPointsLabel}</span>
              <span className="tp-score-opd-chevron">›</span>
            </button>
          </div>
        </header>

        <PusulaFieldEventSheet
          open={fieldEventPrompt.open}
          fieldName={String(homeField?.name ?? 'Tarlan')}
          candidate={fieldEventPrompt.candidate}
          onClose={fieldEventPrompt.closePrompt}
          onDismiss={fieldEventPrompt.dismiss}
          onConfirm={fieldEventPrompt.confirm}
        />

        <PusulaOperationQuestion
          fieldId={homeField?.demo ? '' : fieldKey}
          fieldName={String(homeField?.name ?? 'Tarlan')}
          operations={recentFieldOperations}
          ready={recentFieldOperationsReady}
          paused={
            pusulaGuideAway ||
            Boolean(quickSheet) ||
            sideMenuOpen ||
            irrigationRecordOpen ||
            fieldEventPrompt.needsAttention ||
            fieldEventPrompt.open
          }
          onActiveChange={setOperationQuestionVisible}
        />

        <PusulaFieldChange
          events={homeField?.demo ? [] : homeDecisionEvents}
          fieldId={fieldKey}
          fieldName={String(homeField?.name ?? 'Tarlan')}
          latestDate={homePhenology.timeSeriesLatestDate}
          operations={homeField?.demo ? [] : recentFieldOperations}
          points={homePhenology.timeSeriesPoints}
          quality={homePhenology.ndviTrend?.quality}
          phenology={decisionPhenology}
          paused={
            pusulaGuideAway ||
            Boolean(quickSheet) ||
            sideMenuOpen ||
            operationQuestionVisible ||
            fieldEventPrompt.needsAttention ||
            fieldEventPrompt.open
          }
          onMap={() => openHomeInsightTarget('map_vegetation')}
        />

        <main className="tp-main">
          <div className="tp-home-map-pusula-shell">
            <HomeMapSection
              onOpenToday={() => setQuickSheet('today')}
              onOpenNotifications={() => setQuickSheet('notifications')}
              onOpenTasks={() => setTasksOpen(true)}
              onOpenFieldStatus={() => {
                setQuickSheet(null);
                setTasksOpen(false);
                setFieldStatusInitialTab('summary');
                setFieldStatusInitialActionTarget(null);
                setFieldStatusOpen(true);
              }}
              notificationCount={homeNotificationCount}
              homeField={homeField}
              realFields={realFields}
              setHomeFieldId={setHomeFieldId}
              setFieldControlFieldId={setFieldControlFieldId}
              onAddField={handleAddFieldClick}
              onOpenFieldOperation={() => {
                if (!fieldKey || homeField?.demo) {
                  handleAddFieldClick();
                  return;
                }
                setFieldOperationOpen(true);
              }}
              activeHomeLayer={activeHomeLayer}
              openMapLayer={openMapLayer}
              soilMenuOpen={soilMenuOpen}
              setSoilMenuOpen={setSoilMenuOpen}
              homeSoilProperty={homeSoilProperty}
              setHomeSoilProperty={setHomeSoilPropertySafe}
              homeSoilDepth={homeSoilDepth}
              setHomeSoilDepth={setHomeSoilDepthSafe}
              climateMenuOpen={climateMenuOpen}
              setClimateMenuOpen={setClimateMenuOpen}
              homeClimateLayer={homeClimateLayer}
              setHomeClimateLayer={setHomeClimateLayerSafe}
              homeClimateDepth={homeClimateDepth}
              setHomeClimateDepth={setHomeClimateDepthSafe}
              satelliteData={sat}
              resolvedSatelliteDate={resolvedHomeSatelliteDate}
              onSpatialSummary={setHomeLayerSpatialSummary}
              ndviStats={homeNdviStats}
              onNdviStats={setHomeNdviStats}
            />

            <HomeMapPusulaStrip
              fieldName={String(homeField?.name ?? 'Tarlan')}
              layerLabel={activeHomeLayerLabel}
              activeLayer={activeHomeLayer}
              soilProperty={homeSoilProperty}
              climateLayer={homeClimateLayer}
              loading={
                homePusulaLoading ||
                (
                  activeHomeLayer === 'vegetation' &&
                  satState?.status === 'loading' &&
                  !sat?.ndviImage
                )
              }
              headline={displayHeadline}
              summary={displaySummary}
              result={homePusulaResult}
              synthesis={fieldSynthesis}
              ndviStats={homeNdviStats}
              error={homePusulaError}
              showOnMapAvailable={
                activeHomeLayer === 'vegetation' &&
                Boolean(sat?.ndviImage)
              }
              onRefresh={
                homeField?.id
                  ? async () => {
                      if (
                        activeHomeLayer === 'vegetation' &&
                        typeof loadFieldSatellite === 'function'
                      ) {
                        await loadFieldSatellite(homeField, true);
                      }
                      await runHomePusula(activeHomeLayer, true);
                    }
                  : undefined
              }
              onOpenLayer={(layer) => {
                openMapLayer(layer as HomeLayer);

                if (typeof window !== 'undefined') {
                  window.setTimeout(() => {
                    document
                      .querySelector('.tp-map-stage')
                      ?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                  }, 40);
                }
              }}
              onShowOnMap={() => {
                openMapLayer(activeHomeLayer);

                if (typeof window !== 'undefined') {
                  window.dispatchEvent(
                    new CustomEvent('tp:home-map-show-pusula-area', {
                      detail: {
                        fieldId: String(homeField?.id ?? ''),
                        layer: activeHomeLayer,
                        /*
                         * NDVI'da alan seçimini AI sonucundan değil doğrudan
                         * HomeInlineLayerMap'in güncel relativeZones verisinden
                         * yapıyoruz. Böylece kart, harita ve takip ekranı aynı
                         * weaker hücreleri gösterir.
                         */
                        importantArea:
                          activeHomeLayer === 'vegetation'
                            ? null
                            : homePusulaResult?.analysis?.importantArea ?? null,
                        spatial:
                          activeHomeLayer === 'vegetation'
                            ? null
                            : activeHomeLayer === 'radar-vv' ||
                                activeHomeLayer === 'radar-vh' ||
                                activeHomeLayer === 'radar-water'
                              ? homePusulaResult?.context?.radar?.spatial ?? null
                              : null,
                        relativeMode:
                          activeHomeLayer === 'vegetation' ? 'all' : undefined,
                      },
                    }),
                  );

                  window.setTimeout(() => {
                    document
                      .querySelector('.tp-map-stage')
                      ?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                      });
                  }, 40);
                }
              }}
            />
          </div>

          <FieldStatusCenter
            open={fieldStatusOpen}
            field={homeField}
            initialTab={fieldStatusInitialTab}
            initialActionTarget={fieldStatusInitialActionTarget}
            notifications={visibleHomeSystemNotifications}
            decisions={todayDecisionCards}
            irrigation={homeIrrigation}
            phenology={decisionPhenology}
            onClose={() => {
              setFieldStatusOpen(false);
              setFieldStatusInitialActionTarget(null);
            }}
            onOpenTarget={(target, context) => {
              setFieldStatusOpen(false);
              openHomeInsightTarget(target, context);
            }}
            onOpenIrrigationRecord={homeField && !homeField.demo ? () => {
              setIrrigationRecordOpen(true);
            } : undefined}
            onFieldPatch={homeField ? (patch) => {
              setRealFields((current: any[]) => current.map((item: any) =>
                String(item.id) === String(homeField.id) ? { ...item, ...patch } : item,
              ));
            } : undefined}
            recordsRefreshNonce={fieldStatusRecordsNonce}
            fieldEventCandidate={fieldEventPrompt.candidate}
            onOpenFieldEvent={fieldEventPrompt.candidate ? fieldEventPrompt.openPrompt : undefined}
          />

          <HomeTasksSheet
            open={tasksOpen}
            fieldId={homeField?.demo ? '' : fieldKey}
            fieldName={String(homeField?.name ?? 'Tarlan')}
            onClose={() => setTasksOpen(false)}
            onAction={openFieldTask}
            controller={homeTasks}
          />

          <HomeQuickSheets
            active={quickSheet}
            onClose={() => setQuickSheet(null)}
            decisions={todayDecisionCards}
            sprayWeather={homeField && !homeField.demo ? (
              decisionPhenology?.dataStatus === 'usable' && decisionPhenology.stage === 'post_harvest'
                ? { title: 'Bu tarlada hasat tamamlandı', detail: 'Hasat edilen ürün için ilaçlama önerisi gösterilmiyor. Güncel hava tahminine göz atabilirsin.' }
                : selectedHourlyWeather
                  ? { title: sprayingQuick.title, detail: sprayingQuick.detail }
                  : { title: 'Saatlik hava hazırlanıyor', detail: 'İlaçlama için uygun saatleri görmek üzere tarla tahmini bekleniyor.' }
            ) : null}
            notifications={visibleHomeSystemNotifications}
            tasks={homeTasks.tasks}
            fieldName={homeField?.name?.trim() || undefined}
            irrigationDecision={homeIrrigation.decision}
            irrigationWhatIf={homeIrrigation.whatIf}
            onOpenDecision={openHomeInsightTarget}
            onOpenTask={openFieldTask}
            onOpenNotifications={() => setScreen('notificationsHub')}
          />

          <HomeFieldDataStatus
              mapCorner
              fieldName={homeField?.demo || String(homeField?.id ?? '').startsWith('demo') ? null : homeField?.name}
              items={fieldDataStatuses}
              onOpen={openHomeInsightTarget}
              onReveal={() => {
                if (!homeField || homeField.demo || !fieldKey || typeof loadFieldWeather !== 'function') return;
                if (!selectedFieldWeather || selectedFieldWeather.status === 'idle' || selectedFieldWeather.status === 'error' ||
                    (selectedFieldWeather.status === 'ready' && !hasRecentFieldForecast)) {
                  void loadFieldWeather(homeField);
                }
              }}
          />

          {!realFields?.length && (
            <button
              style={{
                width: '100%',
                marginTop: 14,
                minHeight: 50,
                borderRadius: 16,
                border: '1px solid rgba(211,181,116,.34)',
                background: '#0d130f',
                color: '#f1e6d2',
                fontWeight: 800,
              }}
              onClick={handleAddFieldClick}
            >
              + İlk Tarlamı Ekle
            </button>
          )}
        </main>

        {fieldGateNotice && (
          <div
            className="tp-field-gate-backdrop"
            role="presentation"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setFieldGateNotice(null);
              }
            }}
          >
            <section
              className="tp-field-gate-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby="tp-field-gate-title"
            >
              <button
                type="button"
                className="tp-field-gate-x"
                onClick={() => setFieldGateNotice(null)}
                aria-label="Kapat"
              >
                ×
              </button>

              <small>TARLA HAKKI</small>
              <h3 id="tp-field-gate-title">
                {fieldGateNotice.reason === 'configured_limit'
                  ? 'Tarla Limitine Ulaştın'
                  : `${fieldGateNotice.nextFieldNumber ?? 'Yeni'}. Tarla Henüz Kilitli`}
              </h3>

              <p>
                {fieldGateNotice.reason === 'configured_limit'
                  ? 'Ücretsiz plandaki tarla hakkını kullandın. Premium ile sınırsız tarla ve tüm gelişmiş özellikleri açabilirsin.'
                  : `Yeni tarla eklemek için toplam ${Number(
                      fieldGateNotice.requiredPoints ?? 0
                    ).toLocaleString('tr-TR')} P gerekiyor. İstersen puanlarını inceleyebilir veya Premium'a geçebilirsin.`}
              </p>

              {fieldGateNotice.reason !== 'configured_limit' && (
                <div className="tp-field-gate-progress">
                  <span>Kalan Puan</span>
                  <strong>
                    {Number(
                      fieldGateNotice.remainingPoints ?? 0
                    ).toLocaleString('tr-TR')} P
                  </strong>
                </div>
              )}

              <div className="tp-field-gate-actions">
                <button
                  type="button"
                  className="tp-field-gate-premium"
                  onClick={() => {
                    setFieldGateNotice(null);
                    openPlanUpgrade({
                      requiredPlan: 'premium',
                      feature: 'Sınırsız tarla ve Premium özellikler',
                    });
                  }}
                >
                  Premium Ol
                </button>

                <button
                  type="button"
                  className="tp-field-gate-points"
                  onClick={() => {
                    // Puan modalını aynı kullanıcı etkileşimi içinde aç.
                    // Özellikle mobil Safari'de modal kapat -> setTimeout ->
                    // modal aç zinciri kaybolabildiği için iki state'i tek
                    // render döngüsünde değiştiriyoruz.
                    setPointsOpen(true);
                    setFieldGateNotice(null);
                  }}
                >
                  Puanlarımı Gör
                </button>
              </div>
            </section>
          </div>
        )}

        <FieldOperationModal
          open={fieldOperationOpen && Boolean(fieldKey) && !homeField?.demo}
          fieldId={fieldKey || null}
          fieldName={String(homeField?.name ?? 'Tarlan')}
          onClose={() => setFieldOperationOpen(false)}
          onSaved={() => {
            setFieldStatusRecordsNonce(Date.now());
          }}
        />

        <FieldOperationModal
          open={irrigationRecordOpen && Boolean(fieldKey) && !homeField?.demo}
          fieldId={fieldKey || null}
          fieldName={String(homeField?.name ?? 'Tarlan')}
          initialType="Sulama"
          onClose={() => setIrrigationRecordOpen(false)}
          onSaved={() => {
            homeIrrigation.refresh();
            setFieldStatusRecordsNonce(Date.now());
          }}
        />

        <HomeFieldsSheet
          open={fieldsSheetOpen}
          fields={realFields ?? []}
          selectedId={fieldKey}
          onClose={() => setFieldsSheetOpen(false)}
          onSelect={(id) => {
            setHomeFieldId(id);
            setFieldControlFieldId?.(id);
            setFieldsSheetOpen(false);
            window.setTimeout(() => document.querySelector('.tp-home-field')?.scrollIntoView({ behavior: 'smooth' }), 80);
          }}
          onDetail={(id) => {
            const field = (realFields ?? []).find((item: { id: string | number }) => String(item.id) === id);
            if (!field) return;
            setFieldsSheetOpen(false);
            setHomeFieldId(id);
            setFieldControlFieldId?.(id);
            setFieldStatusInitialTab('summary');
            setFieldStatusInitialActionTarget(null);
            window.setTimeout(() => setFieldStatusOpen(true), 40);
          }}
          onDelete={async (id) => {
            const field = (realFields ?? []).find((item: { id: string | number }) => String(item.id) === id);
            if (!field) throw new Error('Tarla bulunamadı.');
            await handleDeleteField(field);
          }}
          onReorder={(orderedIds) => {
            if (typeof setRealFields !== 'function') return;

            setRealFields((current: any[]) => {
              const byId = new Map(
                (current ?? []).map((field: any) => [
                  String(field?.id ?? ''),
                  field,
                ]),
              );

              const reordered = orderedIds
                .map((id) => byId.get(String(id)))
                .filter(Boolean);

              /*
               * Sıralama sırasında yeni eklenmiş / senkron gelmiş bir tarla varsa
               * yanlışlıkla kaybetme; listenin sonuna ekle.
               */
              for (const field of current ?? []) {
                if (!orderedIds.includes(String(field?.id ?? ''))) {
                  reordered.push(field);
                }
              }

              return reordered;
            });
          }}
          onAdd={() => {
            setFieldsSheetOpen(false);
            handleAddFieldClick();
          }}
        />

        <ClassicBottomNav
          activeScreen={fieldsSheetOpen ? 'fields' : 'home'}
          setScreen={setScreen}
          onOpenAi={openAiAnalysisScreen}
          onOpenCalendar={openCalendarScreen}
          onOpenFields={() => setFieldsSheetOpen(true)}
        />
      </div>
    </>
  );
}
