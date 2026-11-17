import { useEffect, useMemo, useState } from 'react';
import { Droplets } from 'lucide-react';
import type { Field } from '../../../types';
import {
  IRRIGATION_SYSTEMS, SHADE_OPTIONS, calculateWaterNeed, decadeLabel, loadWaterNeedDataset,
  matchRehberCrops, pickStation, systemFromFieldMethod,
  type IrrigationSystemId, type WaterNeedDataset,
} from '../services/waterNeed.service';
import {
  buildRainLedger, irrigationFromActivities, loadSeasonWeather, seasonWindow, type DailyWeather,
} from '../services/rainLedger.service';
import './FieldWaterNeedCard.css';

const fmt = (value: number, digits = 0) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: digits }).format(value);
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(`${iso}T00:00:00`));
const MONTH_SHORT = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];

type ActivityLike = { type: string; activityDate: string; quantity: number | null; unit: string | null };

export default function FieldWaterNeedCard({ field, activities = [], plantingDate = null }: {
  field: Field; activities?: ActivityLike[]; plantingDate?: string | null;
}) {
  const [dataset, setDataset] = useState<WaterNeedDataset | null>(null);
  const [error, setError] = useState('');
  const [variant, setVariant] = useState<string | null>(null);
  const [system, setSystem] = useState<IrrigationSystemId>(() => systemFromFieldMethod(field.irrigationMethod));
  const [shade, setShade] = useState<number>(field.cropCycle === 'perennial' ? 75 : 80);

  useEffect(() => {
    let cancelled = false;
    loadWaterNeedDataset()
      .then((data) => { if (!cancelled) setDataset(data); })
      .catch(() => { if (!cancelled) setError('Su tüketimi verisi şu an yüklenemedi.'); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    setVariant(null);
    setSystem(systemFromFieldMethod(field.irrigationMethod));
  }, [field.id, field.crop, field.irrigationMethod]);

  const lat = field.parcelCentroidLat ?? field.latitude ?? null;
  const lng = field.parcelCentroidLng ?? field.longitude ?? null;
  const pick = useMemo(() => dataset
    ? pickStation(dataset.istasyonlar, field.crop, { lat, lng, city: field.city })
    : null, [dataset, field.crop, lat, lng, field.city]);
  const cropInRehber = useMemo(() => !!dataset && dataset.istasyonlar.some((s) =>
    matchRehberCrops(field.crop, Object.keys(s.bitkiler)).length > 0), [dataset, field.crop]);
  const variants = useMemo(() => pick ? matchRehberCrops(field.crop, Object.keys(pick.station.bitkiler)) : [],
    [pick, field.crop]);
  const crop = variant && variants.includes(variant) ? variant : variants[0] ?? null;
  const result = useMemo(() => pick && crop
    ? calculateWaterNeed(pick.station, crop, { system, shadePercent: shade })
    : null, [pick, crop, system, shade]);
  // ── Yağış sayacı ──
  const today = useMemo(() => new Date(), []);
  const seasonWin = useMemo(() => pick && crop
    ? seasonWindow(pick.station.bitkiler[crop].etc, today, plantingDate)
    : null, [pick, crop, today, plantingDate]);
  const wLat = lat ?? pick?.station.enlem ?? null;
  const wLng = lng ?? pick?.station.boylam ?? null;
  const [weather, setWeather] = useState<{ key: string; daily: DailyWeather[] } | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const weatherKey = seasonWin && wLat !== null && wLng !== null ? `${wLat},${wLng},${seasonWin.start.toISOString()}` : '';
  useEffect(() => {
    if (!seasonWin || wLat === null || wLng === null) return;
    let cancelled = false;
    setWeatherError('');
    loadSeasonWeather(wLat, wLng, seasonWin.start, today)
      .then((r) => { if (!cancelled) setWeather({ key: weatherKey, daily: r.daily }); })
      .catch(() => { if (!cancelled) setWeatherError('Yağış verisi şu an alınamadı.'); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weatherKey]);
  const ledger = useMemo(() => {
    if (!pick || !crop || !seasonWin || !weather || weather.key !== weatherKey) return null;
    return buildRainLedger({
      etc: pick.station.bitkiler[crop].etc, eto: pick.station.eto, window: seasonWin, today,
      seasonTotal: pick.station.bitkiler[crop].toplam,
      daily: weather.daily, irrigation: irrigationFromActivities(activities, field.area),
    });
  }, [pick, crop, seasonWin, weather, weatherKey, today, activities, field.area]);

  const sys = IRRIGATION_SYSTEMS.find((s) => s.id === system) ?? IRRIGATION_SYSTEMS[0];
  const area = Number.isFinite(field.area) && field.area > 0 ? field.area : null;
  const maxBar = result ? Math.max(...result.etc, ...result.effectiveRain, 1) : 1;

  return (
    <section className="tp-water-need" aria-labelledby={`tp-water-need-${field.id}`}>
      <div className="tp-water-need-head">
        <span className="tp-water-need-icon" aria-hidden="true"><Droplets size={20} /></span>
        <div>
          <span className="tp-water-need-kicker">SU İHTİYACI</span>
          <h3 id={`tp-water-need-${field.id}`}>{field.crop} ne kadar su ister?</h3>
        </div>
      </div>

      {error ? <p className="tp-water-need-empty" role="alert">{error}</p>
        : !dataset ? <p className="tp-water-need-empty">Su tüketimi verisi yükleniyor…</p>
        : !pick ? <p className="tp-water-need-empty">
            {!cropInRehber
              ? `“${field.crop}” bu rehberde yer almıyor. Rehber Türkiye’de sulanan yaklaşık 125 ürünü kapsar.`
              : lat === null && !field.city
                ? 'Tarlanın konumu veya ili kayıtlı olmadığı için yakın meteoroloji istasyonu bulunamadı.'
                : lat === null
                  ? `${field.city} ilinde “${field.crop}” için istasyon verisi yok. Tarlanın konumu eklenirse en yakın istasyon kullanılır.`
                  : `Tarlana 120 km içinde “${field.crop}” verisi olan istasyon yok.`}
          </p>
        : !result ? <p className="tp-water-need-empty">Bu ürün için rehberde su tüketimi değeri bulunmuyor.</p>
        : <>
          {variants.length > 1 && <label className="tp-water-need-field">
            Ürün çeşidi / ekim şekli
            <select value={crop ?? ''} onChange={(e) => setVariant(e.target.value)}>
              {variants.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </label>}

          <div className="tp-water-need-stats">
            <div>
              <span>Sezonluk su tüketimi</span>
              <strong>{fmt(result.seasonEtc)} mm</strong>
              <small>dekara ≈ {fmt(result.seasonEtc)} ton su</small>
            </div>
            <div>
              <span>{decadeLabel(result.current.decade)}</span>
              <strong>{result.current.inSeason ? `${fmt(result.current.etc)} mm` : 'Sezon dışı'}</strong>
              <small>{result.current.inSeason ? 'bu 10 günde tüketilen su' : 'bitki bu dönemde su tüketmiyor'}</small>
            </div>
          </div>

          <div className="tp-water-need-chart" role="img"
            aria-label={`10 günlük dönemlere göre su tüketimi; en yüksek ${fmt(Math.max(...result.etc))} mm`}>
            {result.etc.map((v, i) => (
              <span key={i} className={i === result.current.decade ? 'now' : undefined}>
                <i style={{ height: `${(v / maxBar) * 100}%` }} />
                {result.effectiveRain[i] > 0 && <b style={{ height: `${(result.effectiveRain[i] / maxBar) * 100}%` }} />}
              </span>
            ))}
          </div>
          <div className="tp-water-need-months" aria-hidden="true">
            {MONTH_SHORT.map((m, i) => <span key={i}>{m}</span>)}
          </div>
          <p className="tp-water-need-legend"><i /> Bitkinin tükettiği su <b /> Etkili yağış (yağışın %80'i)</p>


          {seasonWin && <div className="tp-water-need-ledger">
            <h4>Yağış sayacı</h4>
            {weatherError ? <p className="tp-water-need-empty">{weatherError}</p>
              : !ledger ? <p className="tp-water-need-empty">Sezon başından beri düşen yağışlar toplanıyor…</p>
              : <>
                <div className="tp-water-need-remaining">
                  <span>Bu sezon daha gereken su</span>
                  <strong>{fmt(ledger.remaining)} mm</strong>
                  <small>dekara ≈ {fmt(ledger.remaining)} ton{area ? ` · tarlanın tamamı ≈ ${fmt(ledger.remaining * area)} ton` : ''}</small>
                  <div className="tp-water-need-progress" aria-hidden="true">
                    <i style={{ width: `${Math.min(100, (ledger.effectiveRain / Math.max(ledger.seasonNeed, 1)) * 100)}%` }} />
                    <b style={{ width: `${Math.min(100, (ledger.irrigation / Math.max(ledger.seasonNeed, 1)) * 100)}%` }} />
                  </div>
                  <small className="tp-water-need-progress-legend">
                    <i /> Yağış <b /> Sulama · sezon ihtiyacı {fmt(ledger.seasonNeed)} mm
                  </small>
                </div>
                <dl className="tp-water-need-results">
                  <div><dt>Sezon başlangıcı</dt><dd>{dayLabel(ledger.seasonStart)}{ledger.fromPlanting ? ' (ekim)' : ''}</dd></div>
                  <div><dt>O günden beri düşen yağış</dt><dd>{fmt(ledger.rainTotal, 1)} mm</dd></div>
                  <div><dt>Bitkiye yarayan kısmı (%80)</dt><dd>{fmt(ledger.effectiveRain, 1)} mm</dd></div>
                  <div><dt>Kayıtlı sulamaların</dt><dd>{ledger.irrigation > 0 ? `${fmt(ledger.irrigation, 1)} mm` : 'Kayıt yok'}</dd></div>
                  <div><dt>Bitkinin bugüne kadar tükettiği</dt><dd>{fmt(ledger.usedSoFar)} mm</dd></div>
                  <div className="total"><dt>Şu anki su açığı</dt>
                    <dd>{ledger.deficitNow > 0 ? `${fmt(ledger.deficitNow)} mm` : 'Açık yok'}</dd></div>
                </dl>
                {ledger.rainEvents.length > 0 && <div className="tp-water-need-rains">
                  <span>Son yağışlar</span>
                  <ul>{ledger.rainEvents.map((e) => <li key={e.date}><b>{fmt(e.mm, 1)} mm</b> {dayLabel(e.date)}</li>)}</ul>
                </div>}
                <p className="tp-water-need-note tp-water-need-note-info">
                  Yağışlar her gün otomatik eklenir. Sulama yaptığında İşlemler’e “Sulama” kaydını su miktarıyla (m³) girersen sayaçtan düşülür.
                  {ledger.missingDays > 0 && ` ${ledger.missingDays} günün verisi henüz yayımlanmadı.`}
                </p>
              </>}
          </div>}
          <div className="tp-water-need-calc">
            <h4>Sulama hesaplayıcı</h4>
            <label className="tp-water-need-field">
              Sulama yöntemi
              <select value={system} onChange={(e) => setSystem(e.target.value as IrrigationSystemId)}>
                {IRRIGATION_SYSTEMS.map((s) => <option key={s.id} value={s.id}>
                  {s.label}{s.ea ? ` · randıman %${Math.round(s.ea * 100)}` : ''}
                </option>)}
              </select>
            </label>
            {sys.drip && <label className="tp-water-need-field">
              Bitkinin gölgelediği alan
              <select value={shade} onChange={(e) => setShade(Number(e.target.value))}>
                {SHADE_OPTIONS.map((o) => <option key={o.ps} value={o.ps}>{o.label} · %{o.ps}</option>)}
              </select>
            </label>}

            <dl className="tp-water-need-results">
              <div><dt>Sezonda düşen etkili yağış</dt><dd>{fmt(result.seasonEffectiveRain)} mm</dd></div>
              <div><dt>Net sulama suyu ihtiyacı</dt><dd>{fmt(result.seasonNet)} ton/da</dd></div>
              <div className="total"><dt>Vermen gereken toplam su</dt>
                <dd>{result.seasonGross === null ? '—' : `${fmt(result.seasonGross)} ton/da`}</dd></div>
              {area && <div className="total"><dt>Tarlanın tamamı ({fmt(area, 1)} da)</dt>
                <dd>{fmt((result.seasonGross ?? result.seasonNet) * area)} ton
                  {result.seasonGross === null ? ' (net)' : ''}</dd></div>}
              {result.current.inSeason && <div><dt>Bu 10 günde verilecek su</dt>
                <dd>{result.current.net === 0 ? 'Yağış yeterli'
                  : `${fmt(result.current.gross ?? result.current.net, 1)} ton/da${result.current.gross === null ? ' (net)' : ''}`}</dd></div>}
            </dl>
            {sys.ea === null && <p className="tp-water-need-note">
              Salma, karık ve tava sulamada su kaybı tarladan tarlaya çok değiştiği için rehber bir randıman vermez;
              burada yağışı düşülmüş <b>net</b> ihtiyaç gösteriliyor. Gerçekte verilen su bundan fazla olur.
            </p>}
            {field.irrigationStatus === 'rainfed' && <p className="tp-water-need-note">
              Tarlan kuru tarım olarak kayıtlı. Net ihtiyaç, bitkinin yağışla karşılanamayan su açığını gösterir.
            </p>}
          </div>

          <p className="tp-water-need-source">
            Kaynak: TAGEM–DSİ, <i>Türkiye’de Sulanan Bitkilerin Bitki Su Tüketimleri</i> (2017), uzun yıllar ortalaması.
            {' '}{pick.station.ad} istasyonu ({pick.basis === 'konum' && pick.distanceKm !== null
              ? `${fmt(pick.distanceKm)} km uzakta, `
              : `${pick.station.il} ili, `}rakım {fmt(pick.station.rakim)} m).
            {result.source === 'hesap' && ' Bu istasyonun tablosu rehberde okunamadığı için değerler rehberin kendi katsayılarıyla hesaplandı.'}
            {' '}Yılın gerçek hava durumu bu değerlerden farklı olabilir.
            {seasonWin && ' Yağış sayacı: Open-Meteo (ERA5 arşivi ve tahmin modeli) günlük yağış ve ET₀ verisi; ölçüm değil model verisidir.'}
          </p>
        </>}
    </section>
  );
}
