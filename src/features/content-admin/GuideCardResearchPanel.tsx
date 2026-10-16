import { useState, type FormEvent } from 'react';
import { BookOpen, ExternalLink, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import './GuideCardResearchPanel.css';

type VerifiedSource = {
  title: string;
  url: string;
  institution: string;
  language: string;
  publication_type: string;
  score: number;
};
type GeneratedCard = { id: string; title: string; words: number; source: string };
type ExistingCard = { url: string; title: string; id: string; status: string };
type UnavailableSource = { url: string; title: string; reason: string };
const statusText = (status: string) =>
  status === 'published' ? 'Yayında' :
  status === 'approved' ? 'Onaylandı' : 'Onay bekliyor';
type EngineResult = {
  error?: string;
  message?: string;
  sources?: VerifiedSource[];
  created?: GeneratedCard[];
  existing?: ExistingCard[];
  alreadyExists?: ExistingCard[];
  unavailable?: UnavailableSource[];
  failures?: Array<{ url: string; reason: string }>;
};

async function askEngine(body: Record<string, unknown>): Promise<EngineResult> {
  // The server checks the session and the is_admin() RPC before any source lookup or generation.
  const { data, error } = await supabase.functions.invoke('knowledge-content-scan', { body });
  if (error) throw error;
  if (data?.error) throw new Error(String(data.error));
  return data as EngineResult;
}

export default function GuideCardResearchPanel({ onCreated }: { onCreated: () => Promise<void> }) {
  const [area, setArea] = useState('Bitkisel üretim');
  const [topic, setTopic] = useState('');
  const [region, setRegion] = useState('Türkiye geneli');
  const [audience, setAudience] = useState('Küçük ve orta ölçekli çiftçiler');
  const [limit, setLimit] = useState(5);
  const [sources, setSources] = useState<VerifiedSource[]>([]);
  const [existing, setExisting] = useState<ExistingCard[]>([]);
  const [unavailable, setUnavailable] = useState<UnavailableSource[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [created, setCreated] = useState<GeneratedCard[]>([]);
  const [failures, setFailures] = useState<Array<{ url: string; reason: string }>>([]);
  const [busy, setBusy] = useState<'search' | 'generate' | ''>('');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setError('');
    setCreated([]);
    setFailures([]);
    setSources([]);
    setExisting([]);
    setUnavailable([]);
    setSelected([]);
    setSearched(false);
    setBusy('search');
    setProgress('İzin verilen resmî ve üniversite kaynakları araştırılıyor…');
    try {
      const data = await askEngine({ action: 'search', area, topic: topic.trim(), region, audience });
      const items = data.sources || [];
      setSources(items);
      setExisting(data.existing || []);
      setUnavailable(data.unavailable || []);
      setSelected(items.slice(0, limit).map((item) => item.url));
      setSearched(true);
      setProgress(data.message || (items.length + ' erişilebilir yeni kaynak bulundu. Belge metni kart hazırlanırken ayrıca doğrulanacak.'));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Kaynak araştırması tamamlanamadı.');
      setProgress('');
    } finally {
      setBusy('');
    }
  }

  function toggleSource(url: string) {
    setSelected((before) => before.includes(url) ? before.filter((item) => item !== url) : [...before, url]);
  }

  async function generate() {
    if (!selected.length || busy) return;
    setBusy('generate');
    setError('');
    setCreated([]);
    setFailures([]);
    const chosen = sources.filter((source) => selected.includes(source.url)).slice(0, limit);
    const generated: GeneratedCard[] = [];
    const rejected: Array<{ url: string; reason: string }> = [];
    const duplicates: ExistingCard[] = [];
    try {
      // Small batches prevent an Edge Function timeout. Failed source checks are never published.
      for (let index = 0; index < chosen.length; index += 2) {
        setProgress((index + 1) + '/' + chosen.length + ' kaynak inceleniyor, taslak hazırlanıyor…');
        const segment = chosen.slice(index, index + 2);
        try {
          const data = await askEngine({
            action: 'generate', area, topic: topic.trim(), region, audience,
            count: segment.length, sources: segment.map(({ url, title }) => ({ url, title })),
          });
          generated.push(...(data.created || []));
          rejected.push(...(data.failures || []));
          duplicates.push(...(data.alreadyExists || []));
          setCreated([...generated]);
          setExisting((before) => [...before, ...duplicates].filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index));
          setFailures([...rejected]);
        } catch (cause) {
          rejected.push(...segment.map((item) => ({
            url: item.url, reason: cause instanceof Error ? cause.message : 'Kaynak işlenemedi.',
          })));
          setFailures([...rejected]);
        }
      }
      setProgress(generated.length
        ? (generated.length + ' yeni taslak onay kuyruğuna eklendi. Kaynağı ve fotoğrafları yayın öncesi kontrol et.')
        : rejected.length
          ? 'Yeni taslak oluşturulamadı. Aşağıda hangi kaynağın neden işlenemediği yazıyor.'
          : 'Bu konudaki kart zaten hazırlanmış; gereksiz bir kopya oluşturulmadı.');
      if (generated.length) await onCreated();
    } finally {
      setBusy('');
    }
  }

  return (
    <section className="tp-guide-research">
      <div className="tp-guide-research__heading">
        <div className="tp-guide-research__icon"><BookOpen size={21} /></div>
        <div>
          <h2>Bilgi Rehberi Araştırma Motoru</h2>
          <p>Kaynak bul → özgün Türkçe bilgi kartına dönüştür → admin onayına gönder.</p>
        </div>
      </div>
      <form className="tp-guide-research__form" onSubmit={(event) => void search(event)}>
        <label>Alan
          <input value={area} onChange={(event) => setArea(event.target.value)} maxLength={80} required placeholder="Örn. Domates yetiştiriciliği" />
        </label>
        <label>Alt konu
          <input value={topic} onChange={(event) => setTopic(event.target.value)} maxLength={110} required minLength={3} placeholder="Örn. Sulama, mildiyö, fide çökerten" />
        </label>
        <label>Bölge
          <input value={region} onChange={(event) => setRegion(event.target.value)} maxLength={80} placeholder="Türkiye geneli" />
        </label>
        <label>Hedef kitle
          <input value={audience} onChange={(event) => setAudience(event.target.value)} maxLength={90} placeholder="Küçük ve orta ölçekli çiftçiler" />
        </label>
        <label>İstenen kart sayısı
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {[1, 3, 5, 10, 15, 20].map((number) => <option key={number} value={number}>{number} kart</option>)}
          </select>
        </label>
        <button className="tp-guide-research__action" type="submit" disabled={Boolean(busy) || topic.trim().length < 3}>
          <Search size={16} /> {busy === 'search' ? 'Araştırılıyor…' : 'Kaynakları Ara'}
        </button>
      </form>
      <div className="tp-guide-research__note">
        <ShieldCheck size={17} />
        <span>Yalnız Bakanlık, TAGEM, DergiPark ve belirlenmiş üniversite Extension alan adları. 100–180 kelime, 3–5 madde, saha önerisi, uyarı ve açık kaynak bilgisi zorunlu. Kaynak okunamazsa içerik üretilmez.</span>
      </div>
      {error ? <p className="tp-guide-research__error" role="alert">{error}</p> : null}
      {progress ? <p className="tp-guide-research__progress" role="status">{progress}</p> : null}
      {searched ? (
        <div className="tp-guide-research__results">
          <div className="tp-guide-research__results-head">
            <strong>Yeni ve erişilebilir kaynaklar ({sources.length})</strong>
            <span>En fazla {limit} kaynak seçilebilir.</span>
          </div>
          {sources.length ? (
            <div className="tp-guide-research__sources">
              {sources.map((source) => (
                <label key={source.url} className="tp-guide-research__source">
                  <input type="checkbox" checked={selected.includes(source.url)} onChange={() => toggleSource(source.url)} disabled={Boolean(busy)} />
                  <span>
                    <strong>{source.title}</strong>
                    <small>{source.institution} · {source.language} · {source.publication_type}</small>
                  </span>
                  <a href={source.url} target="_blank" rel="noopener noreferrer" aria-label="Kaynağı aç" onClick={(event) => event.stopPropagation()}><ExternalLink size={16} /></a>
                </label>
              ))}
            </div>
          ) : <p className="tp-guide-research__empty">
            {existing.length
              ? 'Bu konuda zaten hazırlanmış kart var. Yeni kaynak bulunamadı.'
              : 'Yeni kart oluşturmak için erişilebilir ve güvenilir kaynak bulunamadı.'}
          </p>}
          <button className="tp-guide-research__action" type="button" onClick={() => void generate()} disabled={Boolean(busy) || selected.length === 0}>
            <Sparkles size={16} /> {busy === 'generate' ? 'Kartlar hazırlanıyor…' : 'Seçilen Kaynaklardan Taslak Oluştur'}
          </button>
        </div>
      ) : null}
      {existing.length ? (
        <div className="tp-guide-research__already">
          <strong>Mevcut kartlar ({existing.length})</strong>
          <p>Bu kaynaklardan aynı konuda tekrar kart oluşturulmaz; ilgili kartı İçerik Yönetimi’nde açabilirsin.</p>
          {existing.map((item) => (
            <div key={item.id} className="tp-guide-research__already-row">
              <span>{item.title}</span>
              <small>{statusText(item.status)}</small>
            </div>
          ))}
        </div>
      ) : null}
      {unavailable.length ? (
        <details className="tp-guide-research__failures">
          <summary>Erişilemeyen kaynaklar ayıklandı ({unavailable.length})</summary>
          {unavailable.map((item) => (
            <p key={item.url}><strong>{item.title}: {item.reason}</strong><span>{item.url}</span></p>
          ))}
        </details>
      ) : null}
      {created.length ? (
        <div className="tp-guide-research__drafts">
          <strong>Onaya gönderilen taslaklar</strong>
          {created.map((card) => <p key={card.id}>{card.title} <small>({card.words} kelime)</small></p>)}
          <p className="tp-guide-research__helper">Onay Bekleyenler sekmesinden metni, kaynağı ve gerekli görselleri kontrol etmeden yayınlama.</p>
        </div>
      ) : null}
      {failures.length ? (
        <details className="tp-guide-research__failures" open={!created.length}>
          <summary>Üretilemeyen kaynaklar ({failures.length}) — nedenini göster</summary>
          {failures.map((item, index) => (
            <p key={item.url + index}><strong>{item.reason}</strong><span>{item.url}</span></p>
          ))}
        </details>
      ) : null}
    </section>
  );
}
