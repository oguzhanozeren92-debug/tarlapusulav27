import { useEffect, useRef, useState } from 'react';
import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { TURKEY_CROPS } from '../../../data/crops';
import {
  lookupMapBoundary,
  lookupParcel,
  type MapBoundaryCandidate,
} from '../../../lib/parcelService';
import { createUserField, deleteUserField, fetchUserFields } from '../../../services/fieldService';
import {
  fetchDistrictOptions,
  fetchProvinceOptions,
  fetchVillageOptions,
} from '../../../services/locationService';
import { getNextFieldGate } from '../../../gamification/useGamificationStore';
import { getDistrictDisplayName, getDistrictLookupName } from '../../../utils/locationUtils';
import { shouldShowPusulaIntro } from '../../../components/PusulaIntroTrailer';
import {
  fetchCropVarieties,
  isLocalOfficialVarietyId,
  type CropVarietyOption,
} from '../services/cropVarietyCatalog.service';
import type { CropCycle, Field, LocationOption, Screen } from '../../../types';

type UseFieldRegistryControllerOptions = {
  screen: Screen;
  setScreen: Dispatch<SetStateAction<Screen>>;
  isNewUserPreview: boolean;
  setPusulaIntroOpen: Dispatch<SetStateAction<boolean>>;
};

export function useFieldRegistryController({
  screen,
  setScreen,
  isNewUserPreview,
  setPusulaIntroOpen,
}: UseFieldRegistryControllerOptions) {
  const [realFields, setRealFields] = useState<Field[]>([]);
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [, setFieldsLoading] = useState(false);

  const [fieldFormLoading, setFieldFormLoading] = useState(false);
  const [fieldFormMessage, setFieldFormMessage] = useState('');
  const [fieldName, setFieldName] = useState('');
  const [fieldCity, setFieldCity] = useState('');
  const [fieldDistrict, setFieldDistrict] = useState('');
  const [fieldVillage, setFieldVillage] = useState('');

  const [provinceOptions, setProvinceOptions] = useState<LocationOption[]>([]);
  const [districtOptions, setDistrictOptions] = useState<LocationOption[]>([]);
  const [villageOptions, setVillageOptions] = useState<LocationOption[]>([]);
  const [selectedProvinceId, setSelectedProvinceId] = useState<number | null>(null);
  const [selectedDistrictId, setSelectedDistrictId] = useState<number | null>(null);
  const [locationOptionsLoading, setLocationOptionsLoading] = useState(false);
  const [locationOptionsMessage, setLocationOptionsMessage] = useState('');

  const [fieldAda, setFieldAda] = useState('');
  const [fieldParcel, setFieldParcel] = useState('');
  const [fieldLatitude, setFieldLatitude] = useState<number | null>(null);
  const [fieldLongitude, setFieldLongitude] = useState<number | null>(null);
  const [, setParcelLocationLoading] = useState(false);
  const [parcelLocationMessage, setParcelLocationMessage] = useState('');
  const [, setShowSatellitePreview] = useState(false);
  const [parcelLookupLoading, setParcelLookupLoading] = useState(false);
  const [parcelLookupMessage, setParcelLookupMessage] = useState('');
  const [parcelGeometry, setParcelGeometry] = useState<any | null>(null);
  const [parcelLookupSource, setParcelLookupSource] = useState('');
  const [mapBoundaryLoading, setMapBoundaryLoading] = useState(false);
  const [mapBoundaryMessage, setMapBoundaryMessage] = useState('');
  const [mapBoundaryCandidates, setMapBoundaryCandidates] = useState<MapBoundaryCandidate[]>([]);
  const [mapBoundarySuggestedCandidateId, setMapBoundarySuggestedCandidateId] = useState<string | null>(null);

  const [fieldArea, setFieldArea] = useState('');
  const [fieldCrop, setFieldCrop] = useState('');
  const [fieldVarietyId, setFieldVarietyId] = useState('');
  const [fieldVarietyName, setFieldVarietyName] = useState('');
  const [fieldVarietyOptions, setFieldVarietyOptions] = useState<CropVarietyOption[]>([]);
  const [fieldVarietyLoading, setFieldVarietyLoading] = useState(false);
  const [fieldVarietyMessage, setFieldVarietyMessage] = useState('');
  const varietyRequestRef = useRef(0);
  const [fieldSeason, setFieldSeason] = useState(String(new Date().getFullYear()));
  const [fieldCropCycle, setFieldCropCycle] = useState<CropCycle>('annual');
  const [fieldPlantingYear, setFieldPlantingYear] = useState('');
  const [fieldBearing, setFieldBearing] = useState(true);

  const loadFieldVarietyOptions = async (cropName: string) => {
    const requestId = ++varietyRequestRef.current;
    setFieldVarietyLoading(true);
    setFieldVarietyMessage('');
    try {
      const options = await fetchCropVarieties(cropName);
      if (requestId !== varietyRequestRef.current) return;
      setFieldVarietyOptions(options);
      setFieldVarietyMessage(
        options.length
          ? `${options.length.toLocaleString('tr-TR')} resmî çeşit bulundu.`
          : 'Bu ürünün resmî çeşitleri henüz kataloğa aktarılmadı. Çeşidi bilmiyorum seçeneğiyle devam edebilirsin.',
      );
    } catch (error) {
      if (requestId !== varietyRequestRef.current) return;
      console.error('Çeşit kataloğu yüklenemedi:', error);
      setFieldVarietyOptions([]);
      setFieldVarietyMessage('Çeşit kataloğu şu anda alınamadı. Ürün kaydı yine yapılabilir.');
    } finally {
      if (requestId === varietyRequestRef.current) setFieldVarietyLoading(false);
    }
  };

  const handleFieldCropSelection = (cropName: string) => {
    const crop = TURKEY_CROPS.find((item) => item.name === cropName);
    setFieldCrop(cropName);
    setFieldVarietyId('');
    setFieldVarietyName('');
    setFieldVarietyOptions([]);
    setFieldVarietyMessage('');
    if (cropName.trim()) void loadFieldVarietyOptions(cropName);
    if (!crop) return;
    setFieldCropCycle(crop.cycle);
    if (crop.cycle === 'annual') {
      setFieldPlantingYear('');
      setFieldBearing(true);
    }
  };

  const handleFieldVarietySelection = (value: string) => {
    if (!value || value === '__unknown__') {
      setFieldVarietyId(value === '__unknown__' ? '__unknown__' : '');
      setFieldVarietyName('');
      return;
    }

    const variety = fieldVarietyOptions.find((item) => item.id === value);
    setFieldVarietyId(value);
    setFieldVarietyName(variety?.varietyName ?? '');
  };

  const loadFields = async () => {
    setFieldsLoading(true);
    try {
      const normalized = await fetchUserFields();
      setRealFields(normalized);

      if (
        screen === 'home' &&
        !isNewUserPreview &&
        normalized.length === 0 &&
        shouldShowPusulaIntro()
      ) {
        window.setTimeout(() => setPusulaIntroOpen(true), 320);
      }
    } catch (error) {
      console.error('Tarlalar yüklenemedi:', error);
    } finally {
      setFieldsLoading(false);
    }
  };

  const loadProvinceOptions = async () => {
    setLocationOptionsLoading(true);
    setLocationOptionsMessage('');
    try {
      setProvinceOptions(await fetchProvinceOptions());
    } catch (error) {
      console.error('İl listesi yüklenemedi:', error);
      setLocationOptionsMessage('İl listesi yüklenemedi.');
    } finally {
      setLocationOptionsLoading(false);
    }
  };

  const loadDistrictOptions = async (provinceId: number) => {
    setLocationOptionsLoading(true);
    setLocationOptionsMessage('');
    try {
      setDistrictOptions(await fetchDistrictOptions(provinceId));
    } catch (error) {
      console.error('İlçe listesi yüklenemedi:', error);
      setDistrictOptions([]);
      setLocationOptionsMessage('İlçe listesi yüklenemedi.');
    } finally {
      setLocationOptionsLoading(false);
    }
  };

  const loadVillageOptions = async (districtId: number) => {
    setLocationOptionsLoading(true);
    setLocationOptionsMessage('');
    try {
      setVillageOptions(await fetchVillageOptions(districtId));
    } catch (error) {
      console.error('Köy / mahalle listesi yüklenemedi:', error);
      setVillageOptions([]);
      setLocationOptionsMessage('Köy / mahalle listesi yüklenemedi.');
    } finally {
      setLocationOptionsLoading(false);
    }
  };

  const handleProvinceSelection = (value: string) => {
    const provinceId = value ? Number(value) : null;
    const province = provinceOptions.find((item) => item.id === provinceId);
    setSelectedProvinceId(provinceId);
    setFieldCity(province?.name ?? '');
    setSelectedDistrictId(null);
    setFieldDistrict('');
    setFieldVillage('');
    setDistrictOptions([]);
    setVillageOptions([]);
    if (provinceId !== null) void loadDistrictOptions(provinceId);
  };

  const handleDistrictSelection = (value: string) => {
    const districtId = value ? Number(value) : null;
    const district = districtOptions.find((item) => item.id === districtId);
    setSelectedDistrictId(districtId);
    setFieldDistrict(district?.name ?? '');
    setFieldVillage('');
    setVillageOptions([]);
    if (districtId !== null) void loadVillageOptions(districtId);
  };

  const handleVillageSelection = (value: string) => {
    const villageId = value ? Number(value) : null;
    const village = villageOptions.find((item) => item.id === villageId);
    setFieldVillage(village?.name ?? '');
  };

  useEffect(() => {
    if (screen === 'addField' && provinceOptions.length === 0) {
      void loadProvinceOptions();
    }
  }, [screen]);

  const clearMapBoundarySearch = () => {
    setMapBoundaryLoading(false);
    setMapBoundaryMessage('');
    setMapBoundaryCandidates([]);
    setMapBoundarySuggestedCandidateId(null);
  };

  const handleMapBoundaryLookup = async (anchor: { latitude: number; longitude: number }) => {
    setMapBoundaryLoading(true);
    setMapBoundaryMessage('Uydu tabanlı sınır adayları aranıyor…');
    setMapBoundaryCandidates([]);
    setMapBoundarySuggestedCandidateId(null);

    const parsedArea = Number(fieldArea.replace(',', '.'));

    try {
      const result = await lookupMapBoundary({
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        areaDecare: Number.isFinite(parsedArea) && parsedArea > 0 ? parsedArea : null,
        maxCandidates: 6,
      });

      setMapBoundaryCandidates(result.candidates);
      setMapBoundarySuggestedCandidateId(result.suggestedCandidateId);

      if (!result.candidates.length) {
        setMapBoundaryMessage(
          result.message ??
            'Bu noktada güvenilir bir sınır adayı bulunamadı. Haritada başka bir nokta seçip tekrar deneyebilirsin.',
        );
        return;
      }

      setMapBoundaryMessage(
        `${result.candidates.length} sınır adayı bulundu. Haritada ve listedeki alanları kontrol edip doğru olanı seç.`,
      );
    } catch (error) {
      console.error('Uydu sınır adayları alınamadı:', error);
      setMapBoundaryMessage(
        error instanceof Error ? error.message : 'Uydu sınır adayları alınamadı.',
      );
    } finally {
      setMapBoundaryLoading(false);
    }
  };

  const handleMapBoundaryAccept = (
    candidate: MapBoundaryCandidate,
    anchor: { latitude: number; longitude: number },
  ) => {
    setParcelGeometry(candidate.geometry);
    setFieldLatitude(anchor.latitude);
    setFieldLongitude(anchor.longitude);
    setParcelLookupSource(candidate.source || 'Agribound · Fields of The World');
    setShowSatellitePreview(true);
    setFieldAda('');
    setFieldParcel('');

    if (candidate.areaDecare !== null && candidate.areaDecare > 0) {
      setFieldArea(
        candidate.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 3 }),
      );
    }

    setParcelLookupMessage(
      `Haritadan seçtiğin sınır kullanılıyor${
        candidate.areaDecare
          ? ` • ${candidate.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} da`
          : ''
      }. Bu sınır resmî kadastro sınırı değildir.`,
    );
  };

  const handleParcelLookup = async () => {
    setParcelLookupMessage('');
    if (
      !fieldCity.trim() ||
      !fieldDistrict.trim() ||
      !fieldVillage.trim() ||
      !fieldAda.trim() ||
      !fieldParcel.trim()
    ) {
      setParcelLookupMessage('Önce il, ilçe, köy / mahalle, ada ve parsel bilgilerini doldur.');
      return;
    }

    setParcelLookupLoading(true);
    try {
      const result = await lookupParcel({
        province: fieldCity,
        district: getDistrictLookupName(
          fieldDistrict,
          provinceOptions,
          selectedProvinceId,
          fieldCity,
        ),
        village: fieldVillage,
        ada: fieldAda,
        parcel: fieldParcel,
      });

      if (!result.found || !result.geometry) {
        setParcelGeometry(null);
        setParcelLookupSource('');
        setShowSatellitePreview(false);
        setParcelLookupMessage(result.message ?? 'Bu bilgilerle eşleşen parsel bulunamadı.');
        return;
      }

      setParcelGeometry(result.geometry);
      setParcelLookupSource(result.source ?? '');
      clearMapBoundarySearch();
      if (result.centroid) {
        setFieldLatitude(result.centroid.latitude);
        setFieldLongitude(result.centroid.longitude);
      }
      if (
        result.areaDecare !== null &&
        result.areaDecare !== undefined &&
        Number.isFinite(result.areaDecare)
      ) {
        setFieldArea(result.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 3 }));
      }

      setShowSatellitePreview(true);
      setParcelLookupMessage(
        `Parsel bulundu${
          result.areaDecare
            ? ` • ${result.areaDecare.toLocaleString('tr-TR', { maximumFractionDigits: 3 })} da`
            : ''
        }.`,
      );
    } catch (error) {
      console.error('Parsel sorgulanamadı:', error);
      setParcelGeometry(null);
      setParcelLookupSource('');
      setShowSatellitePreview(false);
      setParcelLookupMessage(error instanceof Error ? error.message : 'Parsel sorgulanamadı.');
    } finally {
      setParcelLookupLoading(false);
    }
  };

  const openOfficialParcelQuery = () => {
    window.open('https://parselsorgu.tkgm.gov.tr/', '_blank', 'noopener,noreferrer');
  };

  useEffect(() => {
    if (screen === 'home') void loadFields();
  }, [screen]);

  const openAddField = () => {
    const gate = getNextFieldGate(realFields.length);
    if (!gate.allowed) {
      const message =
        gate.reason === 'configured_limit'
          ? 'Şimdilik en fazla 3 tarla hakkı tanımlı.'
          : `${gate.nextFieldNumber}. tarla için ${Number(gate.requiredPoints ?? 0).toLocaleString(
              'tr-TR',
            )} toplam puan gerekiyor. ${Number(gate.remainingPoints ?? 0).toLocaleString(
              'tr-TR',
            )} puan daha kazanmalısın.`;
      setFieldFormMessage(message);

      try {
        window.sessionStorage.setItem(
          'tp_field_gate_notice',
          JSON.stringify({
            nextFieldNumber: gate.nextFieldNumber,
            requiredPoints: gate.requiredPoints,
            remainingPoints: gate.remainingPoints,
            reason: gate.reason,
          }),
        );
      } catch {
        // sessionStorage kapalıysa yalnızca ana ekrana dön.
      }

      setScreen('home');
      return;
    }

    setFieldFormMessage('');
    setScreen('addField');
  };

  const resetFieldForm = () => {
    setFieldName('');
    setFieldCity('');
    setFieldDistrict('');
    setFieldVillage('');
    setSelectedProvinceId(null);
    setSelectedDistrictId(null);
    setDistrictOptions([]);
    setVillageOptions([]);
    setLocationOptionsMessage('');
    setFieldAda('');
    setFieldParcel('');
    setFieldLatitude(null);
    setFieldLongitude(null);
    setParcelLocationLoading(false);
    setParcelLocationMessage('');
    setShowSatellitePreview(false);
    setParcelLookupLoading(false);
    setParcelLookupMessage('');
    setParcelGeometry(null);
    setParcelLookupSource('');
    clearMapBoundarySearch();
    setFieldArea('');
    setFieldCrop('');
    setFieldVarietyId('');
    setFieldVarietyName('');
    setFieldVarietyOptions([]);
    setFieldVarietyLoading(false);
    setFieldVarietyMessage('');
    setFieldSeason(String(new Date().getFullYear()));
    setFieldCropCycle('annual');
    setFieldPlantingYear('');
    setFieldBearing(true);
    setFieldFormMessage('');
  };

  const handleAddField = async (event: FormEvent) => {
    event.preventDefault();
    if (isNewUserPreview) {
      setFieldFormMessage(
        'Yeni kullanıcı önizleme modu: Formu test edebilirsin; gerçek hesabına tarla kaydedilmez.',
      );
      return;
    }

    const gate = getNextFieldGate(realFields.length);
    if (!gate.allowed) {
      setFieldFormMessage(
        gate.reason === 'configured_limit'
          ? 'Şimdilik en fazla 3 tarla hakkı tanımlı.'
          : `${gate.nextFieldNumber}. tarla için ${Number(gate.requiredPoints ?? 0).toLocaleString(
              'tr-TR',
            )} toplam puan gerekiyor. ${Number(gate.remainingPoints ?? 0).toLocaleString(
              'tr-TR',
            )} puan daha kazanmalısın.`,
      );
      return;
    }

    const hasParcelIdentity = Boolean(fieldAda.trim() && fieldParcel.trim());
    const hasAcceptedBoundary = Boolean(parcelGeometry);

    if (
      !fieldName.trim() ||
      !fieldCity.trim() ||
      !fieldDistrict.trim() ||
      !fieldVillage.trim() ||
      (!hasParcelIdentity && !hasAcceptedBoundary) ||
      !fieldArea.trim() ||
      !fieldCrop.trim()
    ) {
      setFieldFormMessage(
        'Konum, tarla adı, alan ve ürün bilgilerini doldur; ayrıca ada/parsel gir veya haritadan bir sınır seç.',
      );
      return;
    }

    const areaValue = Number(fieldArea.replace(',', '.'));
    const seasonValue = Number(fieldSeason);
    const plantingYearValue = fieldPlantingYear.trim() ? Number(fieldPlantingYear) : null;

    if (!Number.isFinite(areaValue) || areaValue <= 0) {
      setFieldFormMessage('Alan bilgisini geçerli bir dekar değeri olarak gir.');
      return;
    }
    if (!Number.isInteger(seasonValue) || seasonValue < 2000 || seasonValue > 2100) {
      setFieldFormMessage('Üretim yılı geçerli değil.');
      return;
    }
    if (
      fieldCropCycle === 'perennial' &&
      plantingYearValue !== null &&
      (!Number.isInteger(plantingYearValue) ||
        plantingYearValue < 1900 ||
        plantingYearValue > new Date().getFullYear())
    ) {
      setFieldFormMessage('Dikim yılı geçerli değil.');
      return;
    }

    setFieldFormLoading(true);
    setFieldFormMessage('');
    try {
      await createUserField({
        name: fieldName,
        city: fieldCity,
        district: fieldDistrict,
        village: fieldVillage,
        ada: fieldAda,
        parcel: fieldParcel,
        latitude: fieldLatitude,
        longitude: fieldLongitude,
        parcelGeometry,
        parcelLookupSource,
        areaDecare: areaValue,
        crop: fieldCrop,
        varietyId:
          fieldVarietyId &&
          fieldVarietyId !== '__unknown__' &&
          !isLocalOfficialVarietyId(fieldVarietyId)
            ? fieldVarietyId
            : null,
        varietyName: fieldVarietyName || null,
        season: seasonValue,
        cropCycle: fieldCropCycle,
        plantingYear: plantingYearValue,
        bearing: fieldBearing,
      });

      resetFieldForm();
      setScreen('home');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tarla kaydedilemedi.';
      console.error('Tarla kayıt hatası:', error);
      setFieldFormMessage(message);
    } finally {
      setFieldFormLoading(false);
    }
  };

  const handleDeleteField = async (field: Field) => {
    if (field.demo || isNewUserPreview) {
      throw new Error('Önizleme tarlası silinemez.');
    }

    await deleteUserField(String(field.id));
    setRealFields((current) => current.filter((item) => String(item.id) !== String(field.id)));
    setSelectedField((current) => String(current?.id) === String(field.id) ? null : current);
    setScreen('home');
  };

  const districtDisplayName = (districtName: string) =>
    getDistrictDisplayName(
      districtName,
      provinceOptions,
      selectedProvinceId,
      fieldCity,
    );

  return {
    realFields,
    setRealFields,
    selectedField,
    setSelectedField,
    fieldFormLoading,
    fieldFormMessage,
    setFieldFormMessage,
    fieldName,
    setFieldName,
    fieldCity,
    fieldDistrict,
    fieldVillage,
    provinceOptions,
    districtOptions,
    villageOptions,
    selectedProvinceId,
    selectedDistrictId,
    locationOptionsLoading,
    locationOptionsMessage,
    fieldAda,
    setFieldAda,
    fieldParcel,
    setFieldParcel,
    fieldLatitude,
    fieldLongitude,
    parcelLocationMessage,
    parcelLookupLoading,
    parcelLookupMessage,
    parcelGeometry,
    parcelLookupSource,
    mapBoundaryLoading,
    mapBoundaryMessage,
    mapBoundaryCandidates,
    mapBoundarySuggestedCandidateId,
    fieldArea,
    setFieldArea,
    fieldCrop,
    fieldVarietyId,
    fieldVarietyName,
    fieldVarietyOptions,
    fieldVarietyLoading,
    fieldVarietyMessage,
    fieldSeason,
    setFieldSeason,
    fieldCropCycle,
    fieldPlantingYear,
    setFieldPlantingYear,
    fieldBearing,
    setFieldBearing,
    loadFields,
    loadProvinceOptions,
    handleProvinceSelection,
    handleDistrictSelection,
    handleVillageSelection,
    handleParcelLookup,
    handleMapBoundaryLookup,
    handleMapBoundaryAccept,
    clearMapBoundarySearch,
    openOfficialParcelQuery,
    openAddField,
    resetFieldForm,
    handleFieldCropSelection,
    handleFieldVarietySelection,
    handleAddField,
    handleDeleteField,
    districtDisplayName,
  };
}
