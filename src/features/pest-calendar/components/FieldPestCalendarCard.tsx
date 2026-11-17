import { useEffect, useMemo, useState } from 'react';
import { Bug, ChevronDown, ExternalLink } from 'lucide-react';
import type { Field } from '../../../types';
import { calendarForCrop, entryMonths, splitByMonth, type PestEntry } from '../data/pestCalendar';
import { PEST_SOURCES } from '../data/sources';
import {
  EST_BASE, MILDIYO, dayReachingTarget, effectiveTemperatureSum, isMildiyoDay, isoDay, loadPestWeather, type TempDay,
} from '../services/pestWeather.service';
import './FieldPestCalendarCard.css';

const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const MONTH_SHORT = ['O', 'Ş', 'M', 'N', 'M', 'H', 'T', 'A', 'E', 'E', 'K', 'A'];
const KIND_LABEL = { zararli: 'Zararlı', hastalik: 'Hastalık', yabanciot: 'Yabancı ot' } as const;
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long' }).format(new Date(`${iso}T00:00:00`));
const fmt = (v: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(v);

const biofixKey = (fieldId: string | number, entryId: string) => `tp-pest-biofix:${fieldId}:${entryId}`;
const readBiofix = (fieldId: string | number, entryId: string) => {
  try { return window.localStorage.getItem(biofixKey(fieldId, entryId)) || ''; } catch { return ''; }
};

function EntryRow({ entry, open, onToggle }: { entry: PestEntry; open: boolean; onToggle: () => void }) {
  const src = PEST_SOURCES[entry.kaynak];
  return (
    <li className={`tp-pest-entry tp-pest-${entry.tur}${open ? ' is-open' : ''}`}>
      <button type="button" onClick={onToggle} aria-expanded={open}>
        <span className="tp-pest-kind">{KIND_LABEL[entry.tur]}</span>
        <b>{entry.ad}</b>
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="tp-pest-entry-body">
          {entry.latince && <i>{entry.latince}</i>}
          <p><strong>Ne zaman:</strong> {entry.zaman}</p>
          {entry.izleme && <p><strong>Nasıl izlenir:</strong> {entry.izleme}</p>}
          {entry.esik && <p><strong>Ekonomik zarar eşiği:</strong> {entry.esik}</p>}
          {entry.not && <p className="tp-pest-note">{entry.not}</p>}
          {src && (
            <a href={src.url} target="_blank" rel="noreferrer">
              <ExternalLink size={13} aria-hidden="true" />
              {src.kurum} · {src.baslik}{entry.sayfa ? ` · s. ${entry.sayfa}` : ''}
            </a>
          )}
        </div>
      )}
    </li>
  );
}

export default function FieldPestCalendarCard({ field }: { field: Field }) {
  const calendar = useMemo(() => calendarForCrop(field.crop), [field.crop]);
  const today = useMemo(() => new Date(), []);
  const month = today.getMonth() + 1;
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const ddEntries = useMemo(() => calendar?.girdiler.filter((e) => e.gunDerece) ?? [], [calendar]);
  const [biofix, setBiofix] = useState<Record<string, string>>({});
  const [weather, setWeather] = useState<{ past: TempDay[]; forecast: TempDay[] } | null>(null);
  const [weatherError, setWeatherError] = useState('');

  useEffect(() => {
    setOpen(null); setShowAll(false);
    setBiofix(Object.fromEntries(ddEntries.map((e) => [e.id, readBiofix(field.id, e.id)])));
  }, [field.id, ddEntries]);

  const lat = field.parcelCentroidLat ?? field.latitude ?? null;
  const lng = field.parcelCentroidLng ?? field.longitude ?? null;
  const hasMildiyo = !!calendar?.girdiler.some((e) => e.kural === 'mildiyo');
  const earliestBiofix = Object.values(biofix).filter(Boolean).sort()[0] ?? '';
  const needsWeather = !!calendar && lat !== null && lng !== null && (hasMildiyo || !!earliestBiofix);

  useEffect(() => {
    if (!needsWeather || lat === null || lng === null) { setWeather(null); return; }
    let cancelled = false;
    const week = new Date(today); week.setDate(week.getDate() - 7);
    const start = earliestBiofix && new Date(`${earliestBiofix}T00:00:00`) < week ? new Date(`${earliestBiofix}T00:00:00`) : week;
    setWeatherError('');
    loadPestWeather(lat, lng, start, today)
      .then((w) => { if (!cancelled) setWeather(w); })
      .catch(() => { if (!cancelled) setWeatherError('Hava verisi şu an alınamadı.'); });
    return () => { cancelled = true; };
  }, [needsWeather, lat, lng, earliestBiofix, today]);

  if (!calendar) return null;
  const { thisMonth, phenology, other } = splitByMonth(calendar, month);
  const timeline = calendar.girdiler.filter((e) => entryMonths(e).length > 0);
  const todayIso = isoDay(today);

  const mildiyo = (() => {
    if (!hasMildiyo || !weather) return null;
    const weekAgo = new Date(today); weekAgo.setDate(weekAgo.getDate() - 7);
    const last7 = weather.past.filter((d) => d.date > isoDay(weekAgo) && d.date <= todayIso);
    return { past: last7.filter(isMildiyoDay).length, of: last7.length, next: weather.forecast.filter(isMildiyoDay).map((d) => d.date) };
  })();

  const saveBiofix = (entryId: string, value: string) => {
    setBiofix((prev) => ({ ...prev, [entryId]: value }));
    try {
      if (value) window.localStorage.setItem(biofixKey(field.id, entryId), value);
      else window.localStorage.removeItem(biofixKey(field.id, entryId));
    } catch { /* depolama kapalı */ }
  };
  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <section className="tp-pest-card" aria-label="Zararlı ve hastalık takvimi">
      <div className="tp-pest-head">
        <span aria-hidden="true"><Bug size={20} /></span>
        <div>
          <small>ZARARLI VE HASTALIK TAKVİMİ</small>
          <strong>{calendar.ad}</strong>
          <p>Bakanlık talimatlarındaki izleme zamanı, örnekleme ve ekonomik zarar eşikleri.</p>
        </div>
      </div>

      {timeline.length > 0 && (
        <div className="tp-pest-timeline" role="img" aria-label="Aylara göre izleme takvimi">
          <div className="tp-pest-tl-row tp-pest-tl-months">
            <span />
            {MONTH_SHORT.map((m, i) => <em key={i} className={i + 1 === month ? 'is-now' : ''}>{m}</em>)}
          </div>
          {timeline.map((e) => {
            const months = entryMonths(e);
            return (
              <div key={e.id} className={`tp-pest-tl-row tp-pest-${e.tur}`}>
                <span title={e.ad}>{e.ad}</span>
                {MONTH_SHORT.map((_, i) => (
                  <i key={i} className={`${months.includes(i + 1) ? 'on' : ''}${i + 1 === month ? ' is-now' : ''}`} />
                ))}
              </div>
            );
          })}
        </div>
      )}

      <h4>{MONTHS[month - 1]} ayında izlenecekler</h4>
      {thisMonth.length ? (
        <ul className="tp-pest-list">{thisMonth.map((e) => <EntryRow key={e.id} entry={e} open={open === e.id} onToggle={() => toggle(e.id)} />)}</ul>
      ) : <p className="tp-pest-empty">Kaynaklarda bu ay için adı geçen bir izleme yok.</p>}

      {mildiyo && (
        <div className={`tp-pest-alert${mildiyo.past || mildiyo.next.length ? ' is-risk' : ''}`}>
          <strong>Mildiyö salgın koşulu</strong>
          <p>
            Son {mildiyo.of} günde {mildiyo.past} gün ortalama sıcaklık {MILDIYO.tMin}–{MILDIYO.tMax} °C ve nem %{MILDIYO.rhMin}+ oldu.
            {mildiyo.next.length ? ` Tahminde uygun günler: ${mildiyo.next.map(dayLabel).join(', ')}.` : ' Önümüzdeki 7 günün tahmininde bu koşul yok.'}
          </p>
          <small>Talimat: koşullar oluşur oluşmaz harekete geçilir. Model verisidir, tarlayı yaprak altından kontrol edin.</small>
        </div>
      )}

      {ddEntries.map((e) => {
        const fix = biofix[e.id] || '';
        const target = e.gunDerece!.hedef;
        const sum = fix && weather ? effectiveTemperatureSum(weather.past, fix, todayIso) : null;
        const reach = fix && weather ? dayReachingTarget([...weather.past, ...weather.forecast], fix, target) : null;
        const pct = sum ? Math.min(100, (sum.total / target) * 100) : 0;
        return (
          <div key={e.id} className="tp-pest-dd">
            <strong>{e.ad} · gün-derece sayacı</strong>
            <label>
              Tuzakta ilk ergin yakalandığı gün
              <input type="date" value={fix} max={todayIso} onChange={(ev) => saveBiofix(e.id, ev.target.value)} />
            </label>
            {!fix && <p>Tarihi girince {EST_BASE} °C üstü etkili sıcaklıklar toplanır; {fmt(target)} gün-derece {e.gunDerece!.anlam}.</p>}
            {fix && lat === null && <p>Tarlanın konumu olmadığı için sıcaklık alınamıyor.</p>}
            {fix && sum && (
              <>
                <div className="tp-pest-dd-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
                <p>
                  <b>{fmt(sum.total)}</b> / {fmt(target)} gün-derece ({e.gunDerece!.anlam}).
                  {sum.total >= target ? ' Hedefe ulaşıldı.'
                    : reach ? ` Tahmine göre ${dayLabel(reach)} civarı.` : ' 7 günlük tahmin içinde ulaşılmıyor.'}
                  {sum.missing ? ` ${sum.missing} günün verisi eksik.` : ''}
                </p>
              </>
            )}
          </div>
        );
      })}
      {weatherError && <p className="tp-pest-empty">{weatherError}</p>}

      <button type="button" className="tp-pest-more" onClick={() => setShowAll((v) => !v)} aria-expanded={showAll}>
        {showAll ? 'Listeyi kapat' : `Tüm liste (${calendar.girdiler.length})`}
      </button>
      {showAll && (
        <>
          {phenology.length > 0 && (<>
            <h4>Bitki dönemine ve hava durumuna bağlı</h4>
            <ul className="tp-pest-list">{phenology.map((e) => <EntryRow key={e.id} entry={e} open={open === e.id} onToggle={() => toggle(e.id)} />)}</ul>
          </>)}
          {other.length > 0 && (<>
            <h4>Diğer aylarda</h4>
            <ul className="tp-pest-list">{other.map((e) => <EntryRow key={e.id} entry={e} open={open === e.id} onToggle={() => toggle(e.id)} />)}</ul>
          </>)}
        </>
      )}

      <p className="tp-pest-foot">
        {calendar.kapsam === 'kismi' && 'Bu ürün için resmî talimatın yalnızca erişilebilen bölümleri eklendi. '}
        İlaç adı ve doz burada yer almaz; reçeteyi yetkili ziraat mühendisi yazar. Bölgenizdeki tahmin-uyarı duyuruları için il/ilçe tarım müdürlüğünü takip edin.
      </p>
    </section>
  );
}
