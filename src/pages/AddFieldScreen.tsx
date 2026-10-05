import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import FieldMap from '../components/FieldMap';
import MobileWheelPicker from '../components/MobileWheelPicker';
import { TURKEY_CROP_PICKER_OPTIONS } from '../data/crops';
import type { MapBoundaryCandidate } from '../lib/parcelService';
import type { CropCycle, LocationOption, Screen } from '../types';
import type { CropVarietyOption } from '../features/fields/services/cropVarietyCatalog.service';
import './AddFieldMobile.css';

const PUSULA_BODY_SRC =
  'https://xwyfidtktauxivsosmex.supabase.co/storage/v1/object/public/pusula/compass-body.webp';


type Setter<T> = (value: T) => void;

type MapStartView = {
  center: [number, number];
  zoom: number;
  source: 'village' | 'district' | 'province';
};

async function geocodeTurkeyLocation(parts: string[]): Promise<[number, number] | null> {
  const query = [...parts.filter(Boolean), 'Türkiye'].join(', ');
  if (!query.trim()) return null;

  try {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5500);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=tr&addressdetails=0&q=${encodeURIComponent(query)}`,
      {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      },
    );

    window.clearTimeout(timeoutId);

    if (!response.ok) return null;

    const rows = await response.json();
    if (!Array.isArray(rows) || !rows.length) return null;

    const latitude = Number(rows[0]?.lat);
    const longitude = Number(rows[0]?.lon);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    return [longitude, latitude];
  } catch {
    return null;
  }
}


type AddFieldScreenProps = {
  cmsRuntimeCss: string;
  setScreen: Setter<Screen>;
  fieldName: string;
  setFieldName: Setter<string>;
  selectedProvinceId: number | null;
  selectedDistrictId: number | null;
  provinceOptions: LocationOption[];
  districtOptions: LocationOption[];
  villageOptions: LocationOption[];
  fieldVillage: string;
  locationOptionsLoading: boolean;
  locationOptionsMessage: string;
  fieldAda: string;
  setFieldAda: Setter<string>;
  fieldParcel: string;
  setFieldParcel: Setter<string>;
  parcelLookupLoading: boolean;
  parcelLookupMessage: string;
  parcelGeometry: any | null;
  parcelLookupSource: string;
  mapBoundaryLoading: boolean;
  mapBoundaryMessage: string;
  mapBoundaryCandidates: MapBoundaryCandidate[];
  mapBoundarySuggestedCandidateId: string | null;
  parcelLocationMessage: string;
  fieldLatitude: number | null;
  fieldLongitude: number | null;
  fieldArea: string;
  setFieldArea: Setter<string>;
  fieldSeason: string;
  setFieldSeason: Setter<string>;
  fieldCrop: string;
  fieldVarietyId: string;
  fieldVarietyName: string;
  fieldVarietyOptions: CropVarietyOption[];
  fieldVarietyLoading: boolean;
  fieldVarietyMessage: string;
  fieldCropCycle: CropCycle;
  fieldPlantingYear: string;
  setFieldPlantingYear: Setter<string>;
  fieldBearing: boolean;
  setFieldBearing: Setter<boolean>;
  fieldFormMessage: string;
  fieldFormLoading: boolean;
  getDistrictDisplayName: (name: string) => string;
  handleProvinceSelection: (value: string) => void;
  handleDistrictSelection: (value: string) => void;
  handleVillageSelection: (value: string) => void;
  handleParcelLookup: () => void | Promise<void>;
  handleMapBoundaryLookup: (anchor: { latitude: number; longitude: number }) => void | Promise<void>;
  handleMapBoundaryAccept: (candidate: MapBoundaryCandidate, anchor: { latitude: number; longitude: number }) => void;
  clearMapBoundarySearch: () => void;
  openOfficialParcelQuery: () => void;
  handleFieldCropSelection: (value: string) => void;
  handleFieldVarietySelection: (value: string) => void;
  handleAddField: (event: FormEvent) => void | Promise<void>;
};

export default function AddFieldScreen(props: AddFieldScreenProps) {
  const {
    cmsRuntimeCss,setScreen,fieldName,setFieldName,selectedProvinceId,selectedDistrictId,
    provinceOptions,districtOptions,villageOptions,fieldVillage,locationOptionsLoading,locationOptionsMessage,
    fieldAda,setFieldAda,fieldParcel,setFieldParcel,parcelLookupLoading,parcelLookupMessage,parcelGeometry,
    parcelLookupSource,mapBoundaryLoading,mapBoundaryMessage,mapBoundaryCandidates,mapBoundarySuggestedCandidateId,
    parcelLocationMessage,fieldLatitude,fieldLongitude,fieldArea,setFieldArea,fieldSeason,
    setFieldSeason,fieldCrop,fieldVarietyId,fieldVarietyName,fieldVarietyOptions,fieldVarietyLoading,fieldVarietyMessage,fieldCropCycle,fieldPlantingYear,setFieldPlantingYear,fieldBearing,setFieldBearing,
    fieldFormMessage,fieldFormLoading,getDistrictDisplayName,handleProvinceSelection,handleDistrictSelection,
    handleVillageSelection,handleParcelLookup,handleMapBoundaryLookup,handleMapBoundaryAccept,clearMapBoundarySearch,
    openOfficialParcelQuery,handleFieldCropSelection,handleFieldVarietySelection,handleAddField,
  } = props;

  const [step,setStep] = useState(0);
  const [pendingLocation, setPendingLocation] = useState<'district' | 'village' | null>(null);
  const [districtOpenToken, setDistrictOpenToken] = useState(0);
  const [villageOpenToken, setVillageOpenToken] = useState(0);
  const [parcelMode, setParcelMode] = useState<'official' | 'map'>('official');
  const [mapBoundaryAnchor, setMapBoundaryAnchor] = useState<{ latitude: number; longitude: number } | null>(null);
  const [previewCandidateId, setPreviewCandidateId] = useState<string | null>(null);
  const [mapPickMode, setMapPickMode] = useState(false);
  const [mapStartView, setMapStartView] = useState<MapStartView | null>(null);
  const [mapStartLocationKey, setMapStartLocationKey] = useState('');
  const fieldNameRef = useRef<HTMLInputElement>(null);
  const steps = ['Konum','Parsel','Ürün','Tarla Profili'];

  useEffect(() => {
    if (step !== 0 || locationOptionsLoading) return;
    if (pendingLocation === 'district' && selectedProvinceId && districtOptions.length) {
      setDistrictOpenToken((token) => token + 1);
      setPendingLocation(null);
    } else if (pendingLocation === 'village' && selectedDistrictId && villageOptions.length) {
      setVillageOpenToken((token) => token + 1);
      setPendingLocation(null);
    }
  }, [step, pendingLocation, locationOptionsLoading, selectedProvinceId, selectedDistrictId, districtOptions.length, villageOptions.length]);

  useEffect(() => {
    if (!mapBoundaryCandidates.length) {
      setPreviewCandidateId(null);
      return;
    }

    const preferred =
      mapBoundaryCandidates.find((candidate) => candidate.id === mapBoundarySuggestedCandidateId) ??
      mapBoundaryCandidates[0];
    setPreviewCandidateId(preferred?.id ?? null);
  }, [mapBoundaryCandidates, mapBoundarySuggestedCandidateId]);

  useEffect(() => {
    if (parcelMode !== 'map' || step !== 1 || mapBoundaryAnchor) return;
    if (fieldLatitude === null || fieldLongitude === null) return;
    if (!Number.isFinite(fieldLatitude) || !Number.isFinite(fieldLongitude)) return;

    setMapBoundaryAnchor({
      latitude: fieldLatitude,
      longitude: fieldLongitude,
    });
  }, [
    parcelMode,
    step,
    mapBoundaryAnchor,
    fieldLatitude,
    fieldLongitude,
  ]);


  const selectedProvinceName = useMemo(
    () =>
      provinceOptions.find((item) => item.id === selectedProvinceId)?.name?.trim() ?? '',
    [provinceOptions, selectedProvinceId],
  );

  const selectedDistrictName = useMemo(
    () =>
      districtOptions.find((item) => item.id === selectedDistrictId)?.name?.trim() ?? '',
    [districtOptions, selectedDistrictId],
  );

  const selectedVillageName = fieldVillage.trim();

  useEffect(() => {
    if (!selectedProvinceName || !selectedDistrictName || !selectedVillageName) {
      setMapStartView(null);
      setMapStartLocationKey('');
      return;
    }

    const locationKey = [
      selectedProvinceName,
      selectedDistrictName,
      selectedVillageName,
    ]
      .map((part) => part.toLocaleLowerCase('tr-TR'))
      .join('|');

    if (mapStartLocationKey === locationKey && mapStartView) return;

    let cancelled = false;

    const resolveMapStart = async () => {
      // Best effort only: failure must never block field creation.
      const villageCenter = await geocodeTurkeyLocation([
        selectedVillageName,
        selectedDistrictName,
        selectedProvinceName,
      ]);

      if (cancelled) return;

      if (villageCenter) {
        setMapStartView({
          center: villageCenter,
          zoom: 13.8,
          source: 'village',
        });
        setMapStartLocationKey(locationKey);
        return;
      }

      const districtCenter = await geocodeTurkeyLocation([
        selectedDistrictName,
        selectedProvinceName,
      ]);

      if (cancelled) return;

      if (districtCenter) {
        setMapStartView({
          center: districtCenter,
          zoom: 10.8,
          source: 'district',
        });
        setMapStartLocationKey(locationKey);
        return;
      }

      const provinceCenter = await geocodeTurkeyLocation([
        selectedProvinceName,
      ]);

      if (cancelled) return;

      if (provinceCenter) {
        setMapStartView({
          center: provinceCenter,
          zoom: 8.2,
          source: 'province',
        });
      } else {
        setMapStartView(null);
      }

      setMapStartLocationKey(locationKey);
    };

    const timerId = window.setTimeout(() => {
      void resolveMapStart();
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [
    selectedProvinceName,
    selectedDistrictName,
    selectedVillageName,
    mapStartLocationKey,
    mapStartView,
  ]);

  const previewCandidate = useMemo(
    () => mapBoundaryCandidates.find((candidate) => candidate.id === previewCandidateId) ?? null,
    [mapBoundaryCandidates, previewCandidateId],
  );

  const normalizedParcelSource = parcelLookupSource.toLocaleLowerCase('tr-TR');
  const mapBoundarySourceIsManual = normalizedParcelSource.includes('kullanıcı çizimi');
  const mapBoundarySourceIsAutomatic = normalizedParcelSource.includes('agribound');
  const mapBoundarySourceIsMap = mapBoundarySourceIsManual || mapBoundarySourceIsAutomatic;

  const searchBoundaryAtPoint = async (point: { latitude: number; longitude: number }) => {
    setMapBoundaryAnchor(point);
    setPreviewCandidateId(null);
    setMapPickMode(false);
    clearMapBoundarySearch();
    await handleMapBoundaryLookup(point);
  };

  const selectMapPoint = (point: { latitude: number; longitude: number }) => {
    if (!mapPickMode || mapBoundaryLoading) return;
    void searchBoundaryAtPoint(point);
  };

  const startMapBoundarySelection = () => {
    if (mapBoundaryLoading) return;

    setPreviewCandidateId(null);
    clearMapBoundarySearch();

    const knownPoint =
      mapBoundaryAnchor ??
      (fieldLatitude !== null && fieldLongitude !== null
        ? { latitude: fieldLatitude, longitude: fieldLongitude }
        : null);

    if (knownPoint) {
      void searchBoundaryAtPoint(knownPoint);
      return;
    }

    setMapBoundaryAnchor(null);
    setMapPickMode(true);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation || mapBoundaryLoading) return;

    setMapPickMode(false);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void searchBoundaryAtPoint({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      () => undefined,
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const acceptMapBoundary = () => {
    if (!previewCandidate || !mapBoundaryAnchor) return;
    handleMapBoundaryAccept(previewCandidate, mapBoundaryAnchor);
  };

  const acceptManualBoundary = (result: {
    geometry: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;
    areaSquareMeters: number;
    areaDecare: number;
  }) => {
    const geometry = result.geometry.geometry;
    const firstCoordinate =
      geometry.type === 'Polygon'
        ? geometry.coordinates?.[0]?.[0]
        : geometry.coordinates?.[0]?.[0]?.[0];

    const fallbackAnchor =
      Array.isArray(firstCoordinate) &&
      Number.isFinite(Number(firstCoordinate[0])) &&
      Number.isFinite(Number(firstCoordinate[1]))
        ? {
            longitude: Number(firstCoordinate[0]),
            latitude: Number(firstCoordinate[1]),
          }
        : null;

    const anchor =
      mapBoundaryAnchor ??
      (fieldLatitude !== null && fieldLongitude !== null
        ? { latitude: fieldLatitude, longitude: fieldLongitude }
        : fallbackAnchor);

    if (!anchor) return;

    const candidate: MapBoundaryCandidate = {
      id: `manual-${Date.now()}`,
      geometry: result.geometry,
      containsAnchor: true,
      areaM2: result.areaSquareMeters,
      areaDecare: result.areaDecare,
      areaDifferenceRatio: null,
      confidence: null,
      source: 'Kullanıcı çizimi',
    };

    setMapPickMode(false);
    setPreviewCandidateId(null);
    clearMapBoundarySearch();
    handleMapBoundaryAccept(candidate, anchor);
  };

  const canNext = useMemo(() => {
    if (step === 0) return Boolean(selectedProvinceId && selectedDistrictId && fieldVillage);
    if (step === 1) {
      return parcelMode === 'map'
        ? Boolean(parcelGeometry && mapBoundarySourceIsMap)
        : Boolean(parcelGeometry || (fieldAda.trim() && fieldParcel.trim()));
    }
    if (step === 2) return Boolean(fieldCrop && fieldName.trim());
    return true;
  }, [
    step,
    selectedProvinceId,
    selectedDistrictId,
    fieldVillage,
    parcelMode,
    parcelGeometry,
    mapBoundarySourceIsMap,
    fieldAda,
    fieldParcel,
    fieldCrop,
    fieldName,
  ]);

  const next = async () => {
    if (
      step === 1 &&
      parcelMode === 'official' &&
      !parcelGeometry &&
      fieldAda.trim() &&
      fieldParcel.trim()
    ) {
      await handleParcelLookup();
      return;
    }
    if (step < 3) setStep(step + 1);
  };

  const openMapAdd = () => {
    if (!selectedProvinceId || !selectedDistrictId || !fieldVillage) return;
    setParcelMode('map');
    setMapPickMode(false);
    setMapBoundaryAnchor(null);
    clearMapBoundarySearch();
    setStep(1);
  };

  return <>
    <style>{cmsRuntimeCss}</style>


    <div className="tp-chat-field">
      <div className="tp-chat-shell">
        <header className="tp-field-top">
          <button
            type="button"
            className="tp-field-back"
            onClick={()=>setScreen('home')}
            aria-label="Ana sayfaya dön"
          >
            ←
          </button>

          <div className="tp-field-brand">
            <div className="tp-field-brand-word">
              <span>Tarla</span><strong>Pusula</strong>
            </div>
            <small>YENİ TARLA</small>
          </div>

          <div className="tp-field-step-badge" aria-label={`Adım ${step+1} / ${steps.length}`}>
            <strong>{String(step+1).padStart(2,'0')}</strong>
            <span>/0{steps.length}</span>
          </div>
        </header>

        <nav className="tp-field-steps" aria-label="Tarla ekleme adımları">
          {steps.map((label,i)=>(
            <div
              key={label}
              className={`tp-field-step${i===step?' is-current':''}${i<step?' is-done':''}`}
            >
              <i>{i<step?'✓':i+1}</i>
              <span>{label}</span>
            </div>
          ))}
        </nav>

        <section className="tp-field-hero">
          <div className="tp-field-hero-compass" aria-hidden="true">
            <img src={PUSULA_BODY_SRC} alt="" draggable={false} />
          </div>

          <div className="tp-field-hero-copy">
            <span className="tp-field-eyebrow">
              YENİ TARLA · ADIM {String(step+1).padStart(2,'0')}
            </span>

            <h1>
              {step===0 && 'Önce tarlanın konumunu bulalım.'}
              {step===1 && 'Şimdi gerçek sınırı seçelim.'}
              {step===2 && 'Tarlada ne yetişiyor?'}
              {step===3 && 'Son bilgileri tamamlayalım.'}
            </h1>

            <p>
              {step===0 && 'İl, ilçe ve köy/mahalleyi seç. Ardından haritayı doğru bölgeye açacağız.'}
              {step===1 && 'Resmî ada/parsel ile ilerleyebilir veya haritada tarlanın sınırlarını kendin çizebilirsin.'}
              {step===2 && 'Ürün ve çeşit bilgisi; uydu, iklim, rehber ve Pusula önerilerini kişiselleştirir.'}
              {step===3 && 'Alan ve sezon bilgileriyle tarla profilini tamamlayıp Pusula’ya bağlayacağız.'}
            </p>
          </div>
        </section>

        <section className="tp-field-form">
          {step===0 && (
            <div className="tp-grid">
              <label>
                İl
                <MobileWheelPicker
                  title="İl seç"
                  value={selectedProvinceId ? String(selectedProvinceId):''}
                  onChange={(value) => { handleProvinceSelection(value); setPendingLocation('district'); }}
                  searchable
                  options={provinceOptions.map(x=>({
                    value:String(x.id),
                    label:x.name,
                  }))}
                />
              </label>

              <label>
                İlçe
                <MobileWheelPicker
                  title="İlçe seç"
                  value={selectedDistrictId ? String(selectedDistrictId):''}
                  onChange={(value) => { handleDistrictSelection(value); setPendingLocation('village'); }}
                  disabled={!selectedProvinceId || districtOptions.length === 0}
                  autoOpenToken={districtOpenToken}
                  searchable
                  options={districtOptions.map(x=>({
                    value:String(x.id),
                    label:getDistrictDisplayName(x.name),
                  }))}
                />
              </label>

              <label className="full">
                Köy / Mahalle
                <MobileWheelPicker
  title="Köy / mahalle seç"
  value={String(
    villageOptions.find(
      item => item.name === fieldVillage
    )?.id ?? ''
  )}
  onChange={(value) => {
    handleVillageSelection(value);
    setPendingLocation(null);
    setParcelMode('map');
    setMapPickMode(false);
    setMapBoundaryAnchor(null);
    setStep(1);
  }}
  disabled={!selectedDistrictId || villageOptions.length === 0}
  autoOpenToken={villageOpenToken}
  searchable
  options={villageOptions.map(x=>({
    value:String(x.id),
    label:x.name,
  }))}
/>
              </label>

              {(locationOptionsLoading || locationOptionsMessage) && (
                <div className="tp-note full">
                  {locationOptionsLoading
                    ? 'Konumlar yükleniyor…'
                    : locationOptionsMessage}
                </div>
              )}

              <div className="full">
                <button
                  type="button"
                  className="tp-field-primary-action"
                  disabled={!selectedProvinceId || !selectedDistrictId || !fieldVillage}
                  onClick={openMapAdd}
                >
                  <span>✏️</span>
                  Çizimle Ekle
                </button>
                <div className="tp-note" style={{marginTop:7}}>
                  İl, ilçe ve köy/mahalleyi seç. Harita o bölgeden açılır; tarlana yaklaşıp köşeleri işaretleyerek parsel sınırını çiz.
                </div>
              </div>
            </div>
          )}

          {step===1 && (
            <>
              <div className="tp-parcel-mode">
                <button
                  type="button"
                  className={parcelMode==='official' ? 'active' : ''}
                  onClick={()=>{ setMapPickMode(false); setParcelMode('official'); }}
                >
                  Ada / Parsel ile Bul
                </button>
                <button
                  type="button"
                  className={parcelMode==='map' ? 'active' : ''}
                  onClick={()=>{
                    setParcelMode('map');
                    setMapPickMode(false);
                    setMapBoundaryAnchor(null);
                    clearMapBoundarySearch();
                  }}
                >
                  Çizimle Ekle
                </button>
              </div>

              {parcelMode==='official' ? (
                <>
                  <div className="tp-grid">
                    <label>
                      Ada
                      <input
                        value={fieldAda}
                        onChange={e=>setFieldAda(e.target.value)}
                        inputMode="numeric"
                        placeholder="Örn: 123"
                      />
                    </label>

                    <label>
                      Parsel
                      <input
                        value={fieldParcel}
                        onChange={e=>setFieldParcel(e.target.value)}
                        inputMode="numeric"
                        placeholder="Örn: 45"
                      />
                    </label>
                  </div>

                  <button
                    className="tp-choice tp-field-lookup-button"
                    style={{marginTop:10}}
                    type="button"
                    disabled={parcelLookupLoading}
                    onClick={()=>void handleParcelLookup()}
                  >
                    {parcelLookupLoading ? 'Parsel aranıyor…' : '⌖ Parseli Bul'}
                  </button>

                  {parcelLookupMessage && (
                    <div className="tp-found">{parcelLookupMessage}</div>
                  )}

                  {parcelGeometry && (
                    <div className="tp-map-preview">
                      <FieldMap
                        initialCenter={[
                          fieldLongitude ?? 35.2433,
                          fieldLatitude ?? 38.9637,
                        ]}
                        initialZoom={17}
                        height={250}
                        parcelGeometry={parcelGeometry}
                        sections={[]}
                        drawEnabled={false}
                      />
                    </div>
                  )}

                  <div className="tp-note">
                    {parcelLookupSource ? `Kaynak: ${parcelLookupSource}` : parcelLocationMessage}
                  </div>

                  <button
                    className="tp-choice tp-field-external-button"
                    style={{marginTop:8}}
                    type="button"
                    onClick={openOfficialParcelQuery}
                  >
                    Resmî Parsel Sorgu ↗
                  </button>
                </>
              ) : (
                <>
                  <p className="tp-map-boundary-help">
                    Harita seçtiğin il / ilçe / köy çevresinden başlar. Haritada tarlana yaklaş, “Parsel Sınırını Çiz”e bas ve köşeleri sırayla işaretle. En az 3 nokta seçtikten sonra “Çizimi Bitir” de.
                  </p>

                  <label style={{marginBottom:10}}>
                    Alanı biliyorsan (dekar)
                    <input
                      value={fieldArea}
                      onChange={e=>setFieldArea(e.target.value)}
                      inputMode="decimal"
                      placeholder="İsteğe bağlı · çizince otomatik hesaplanır"
                    />
                  </label>

                  <div className="tp-map-boundary-map">
                    <FieldMap
                      initialCenter={
                        mapStartView?.center ??
                        (
                          fieldLongitude !== null && fieldLatitude !== null
                            ? [fieldLongitude, fieldLatitude]
                            : [35.2433, 38.9637]
                        )
                      }
                      initialZoom={
                        mapStartView?.zoom ??
                        (
                          fieldLongitude !== null && fieldLatitude !== null
                            ? 13.8
                            : 6
                        )
                      }
                      height={360}
                      parcelGeometry={parcelGeometry && mapBoundarySourceIsMap ? parcelGeometry : null}
                      sections={[]}
                      drawEnabled
                      drawButtonLabel="✏️ Parsel Sınırını Çiz"
                      constrainDrawingToParcel={false}
                      onSectionDrawn={acceptManualBoundary}
                    />
                  </div>

                  <div className="tp-note" style={{margin:'8px 0 0'}}>
                    {mapStartView
                      ? `Harita ${
                          mapStartView.source === 'village'
                            ? `${selectedVillageName} çevresinden`
                            : mapStartView.source === 'district'
                              ? `${selectedDistrictName} ilçesinden`
                              : `${selectedProvinceName} ilinden`
                        } açıldı. Yakınlaştırıp parsel köşelerini çiz.`
                      : 'Konum hazırlanıyor… Haritayı yine elle kaydırıp yakınlaştırabilirsin.'}
                  </div>

                  <div className="tp-found">
                    {parcelGeometry && mapBoundarySourceIsMap
                      ? '✓ Çizdiğin parsel sınırı kaydedildi. İstersen “Parsel Sınırını Çiz” ile yeniden çizebilirsin.'
                      : 'Henüz parsel çizilmedi. Haritada tarlana yaklaş ve çizimi başlat.'}
                  </div>

                  {false && mapBoundaryCandidates.length > 0 && (
                    <div className="tp-map-candidates">
                      {mapBoundaryCandidates.map((candidate,index)=>{
                        const active = candidate.id === previewCandidateId;
                        return (
                          <button
                            key={candidate.id}
                            type="button"
                            className={`tp-map-candidate ${active ? 'active' : ''}`}
                            onClick={()=>setPreviewCandidateId(candidate.id)}
                          >
                            <div>
                              <strong>Öneri {index+1}{candidate.id === mapBoundarySuggestedCandidateId ? ' · Pusula önerisi' : ''}</strong>
                              <small>
                                {candidate.containsAnchor ? 'Seçtiğin noktayı içeriyor' : 'Yakındaki sınır'}
                                {candidate.confidence !== null ? ` · güven %${Math.round(candidate.confidence*100)}` : ''}
                              </small>
                            </div>
                            <span>
                              {candidate.areaDecare !== null
                                ? `${candidate.areaDecare.toLocaleString('tr-TR',{maximumFractionDigits:2})} da`
                                : 'Alan yok'}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {false && previewCandidate && (
                    <>
                      <div className="tp-map-warning">
                        Uydu/model tabanlı sınır adayıdır; resmî kadastro sınırı değildir. Beyaz-kesik sınırı kontrol edip yalnız doğruysa kullan.
                      </div>
                      <button
                        className="tp-choice active"
                        style={{marginTop:10,width:'100%'}}
                        type="button"
                        onClick={acceptMapBoundary}
                      >
                        ✓ Bu sınırı kullan
                      </button>
                    </>
                  )}

                  {parcelGeometry && mapBoundarySourceIsMap && (
                    <div className="tp-note" style={{marginTop:10}}>
                      Seçilen sınır hazır · Kaynak: {parcelLookupSource}
                      {mapBoundarySourceIsManual ? ' · Çizdiğin sınır resmî kadastro sınırı değildir.' : ''}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {step===2 && (
            <div className="tp-grid">
              <label className="full">
                Ürün
                <MobileWheelPicker
                  title="Ürün seç"
                  value={fieldCrop}
                  onChange={handleFieldCropSelection}
                  searchable
                  options={TURKEY_CROP_PICKER_OPTIONS}
                />
              </label>

              <label className="full">
                Çeşit <span style={{color:'#697586',fontWeight:500}}>(isteğe bağlı)</span>
                <MobileWheelPicker
                  title={`${fieldCrop || 'Ürün'} çeşidi seç`}
                  value={fieldVarietyId}
                  onChange={handleFieldVarietySelection}
                  disabled={!fieldCrop || fieldVarietyLoading}
                  searchable
                  searchPlaceholder="Çeşit ara…"
                  placeholder={
                    fieldVarietyLoading
                      ? 'Çeşitler yükleniyor…'
                      : fieldCrop
                        ? 'Çeşit seç veya bilmiyorum'
                        : 'Önce ürün seç'
                  }
                  options={[
                    {
                      value:'__unknown__',
                      label:'Çeşidimi bilmiyorum',
                      subtitle:'Çeşit-spesifik hesaplarda kesin sonuç üretilmez',
                    },
                    ...fieldVarietyOptions.map((item)=>({
                      value:item.id,
                      label:item.varietyName,
                      subtitle:[
                        item.varietyType,
                        item.usageType,
                        item.registrationYear ? `Tescil ${item.registrationYear}` : null,
                        item.sourceAuthority,
                      ].filter(Boolean).join(' · '),
                    })),
                  ]}
                />
                {fieldCrop && (fieldVarietyMessage || fieldVarietyName) && (
                  <div className="tp-note" style={{marginTop:8}}>
                    {fieldVarietyName
                      ? `Seçili çeşit: ${fieldVarietyName}`
                      : fieldVarietyMessage}
                  </div>
                )}
              </label>

              <label className="full">
                Tarla adı
                <input
                  ref={fieldNameRef}
                  value={fieldName}
                  onChange={e=>setFieldName(e.target.value)}
                  placeholder="Örn: Şeno Tarlası"
                />
              </label>
            </div>
          )}

          {step===3 && (
            <div className="tp-grid">
              <label>
                Alan (da)
                <input
                  value={fieldArea}
                  onChange={e=>setFieldArea(e.target.value)}
                  inputMode="decimal"
                />
              </label>

              <label>
                Sezon
                <input
                  value={fieldSeason}
                  onChange={e=>setFieldSeason(e.target.value)}
                  inputMode="numeric"
                />
              </label>

              {fieldCropCycle!=='annual' && (
                <>
                  <label>
                    Dikim yılı
                    <input
                      value={fieldPlantingYear}
                      onChange={e=>setFieldPlantingYear(e.target.value)}
                      inputMode="numeric"
                    />
                  </label>

                  <div className="tp-field-choice-block">
                    <span className="tp-field-choice-label">Ürün veriyor mu?</span>
                    <div
                      className="tp-choice-row"
                      role="group"
                      aria-label="Ürün veriyor mu?"
                    >
                      <button
                        type="button"
                        className={`tp-choice ${fieldBearing ? 'active' : ''}`}
                        aria-pressed={fieldBearing}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setFieldBearing(true);
                        }}
                      >
                        Evet
                      </button>

                      <button
                        type="button"
                        className={`tp-choice ${!fieldBearing ? 'active' : ''}`}
                        aria-pressed={!fieldBearing}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setFieldBearing(false);
                        }}
                      >
                        Hayır
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="full tp-note">
                Toprak analizin varsa daha sonra tarla profilinden yükleyebilirsin.
                Yoksa Pusula tahmini SoilGrids profilini ayrı olarak kullanır.
              </div>

              {fieldFormMessage && (
                <div className="full tp-found">
                  {fieldFormMessage}
                </div>
              )}
            </div>
          )}
        </section>

        <div className="tp-field-actions">
          <button
            className="back"
            type="button"
            onClick={()=>step===0 ? setScreen('home') : setStep(step-1)}
          >
            Geri
          </button>

          {step===0 ? null : step<3 ? (
            <button
              className="next"
              type="button"
              disabled={!canNext || parcelLookupLoading}
              onClick={()=>void next()}
            >
              Devam →
            </button>
          ) : (
            <form style={{flex:1}} onSubmit={handleAddField}>
              <button
                className="next"
                style={{width:'100%'}}
                type="submit"
                disabled={fieldFormLoading}
              >
                {fieldFormLoading
                  ? 'Tarlan oluşturuluyor…'
                  : 'Tarlayı Oluştur ✓'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  </>;
}
