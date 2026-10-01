import { useId, useMemo, useState } from 'react';
import { buildContentCoverage } from './services/contentCoverage.service';
import type { CoverageCandidate, CoveragePublication, CoverageScope, CoverageTopic } from './services/contentCoverage.service';
import './ContentCoveragePanel.css';

export default function ContentCoveragePanel({ publications, candidates, ready, loading, onOpen, onDraft }: {
  publications: CoveragePublication[];
  candidates: CoverageCandidate[];
  ready: boolean;
  loading: boolean;
  onOpen: (list: 'queue' | 'published', ids: string[], label: string) => void;
  onDraft: (topic: CoverageTopic, crop: string) => void;
}) {
  const [crop, setCrop] = useState('');
  const [scope, setScope] = useState<CoverageScope>('guide');
  const listId = useId();
  const coverage = useMemo(() => buildContentCoverage(publications, candidates, crop, scope), [publications, candidates, crop, scope]);
  if (loading) return <p role="status">İçerik kayıtları yükleniyor…</p>;
  if (!ready) return <p role="alert">İçerik kayıtları alınamadı. Boşluk analizi için Yenile'ye bas.</p>;
  return (
    <section className="tp-content-coverage" aria-label="İçerik boşluk analizi">
      <header>
        <h3>Hangi konuda içerik eksik?</h3>
        <p>Yüklenen son 300 içerik ve son 300 aday içindeki kategori ve ürün etiketlerine göre. Statik rehberler ve yüklenmeyen eski kayıtlar bu sayımda yoktur.</p>
      </header>
      <div className="tp-content-coverage__filters">
        <label>Ürün<input list={listId} value={crop} onChange={(event) => setCrop(event.target.value)} placeholder="Tüm ürünler · veya ürün yaz" /></label>
        <datalist id={listId}>{coverage.cropOptions.map((value) => <option key={value} value={value} />)}</datalist>
        <label>İçerik<select value={scope} onChange={(event) => setScope(event.target.value as CoverageScope)}>
          <option value="guide">Bilgi Rehberi</option><option value="article">Makaleler</option><option value="all">Rehber + Makale</option>
        </select></label>
        {crop ? <button type="button" onClick={() => setCrop('')}>Ürün filtresini temizle</button> : null}
      </div>
      <p className="tp-content-coverage__note">{coverage.untaggedCropCount} kayıtta ürün etiketi yok; bunlar ürün seçildiğinde sayılmaz. Seçili kapsamda {coverage.unclassified} kayıt konuya ayrılamadı. Bir kayıt birden fazla konuda sayılabilir.</p>
      <div className="tp-content-coverage__grid">
        {coverage.rows.map((row) => {
          const label = `${crop.trim() || 'Tüm ürünler'} · ${row.topic.label}`;
          return <article key={row.topic.id}>
            <h4>{row.topic.label}</h4>
            <span className={`tp-content-coverage__state is-${row.state}`}>
              {row.state === 'covered' ? 'Yayın var' : row.state === 'awaiting-review' ? 'Yayın yok · aday bekliyor' : 'Yüklenen kayıtlarda yok'}
            </span>
            <p><strong>{row.publishedIds.length}</strong> yayında · <strong>{row.candidateIds.length}</strong> aday</p>
            <div className="tp-content-coverage__actions">
              <button type="button" disabled={!row.publishedIds.length} onClick={() => onOpen('published', row.publishedIds, label)}>Yayınları aç</button>
              <button type="button" disabled={!row.candidateIds.length} onClick={() => onOpen('queue', row.candidateIds, label)}>Adayları aç</button>
              {scope !== 'article' && !row.publishedIds.length && !row.candidateIds.length ? <button type="button" onClick={() => onDraft(row.topic, crop.trim())}>Rehber taslağı aç</button> : null}
            </div>
          </article>;
        })}
      </div>
    </section>
  );
}
