import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { supabase } from '../../../supabaseClient';
import {
  importArticleRadarCandidate,
  listArticleRadarCandidates,
  scanArticleRadar,
  setArticleRadarCandidateStatus,
  type KnowledgeArticleCandidate,
  type KnowledgeArticleStatus,
} from '../services/articleRadar';
import './KnowledgeArticleRadar.css';

const AUTO_IMPORT_LICENSES = new Set(['cc0', 'cc-by', 'public-domain']);

function normalizedLicense(value: string | null | undefined) {
  return String(value ?? '').trim().toLowerCase();
}

function canAutoImport(candidate: KnowledgeArticleCandidate) {
  return Boolean(candidate.pdf_url && AUTO_IMPORT_LICENSES.has(normalizedLicense(candidate.license)));
}

function statusLabel(status: KnowledgeArticleStatus) {
  if (status === 'imported') return 'Rehber için alındı';
  if (status === 'ignored') return 'Gizlendi';
  return 'Aday';
}


function metadataText(candidate: KnowledgeArticleCandidate, key: string) {
  const value = candidate.metadata?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function sourceLanguageLabel(candidate: KnowledgeArticleCandidate) {
  const raw = metadataText(candidate, 'sourceLanguage') || String(candidate.language ?? '').trim().toLowerCase();
  if (raw === 'tr' || raw === 'turkish') return 'Türkçe kaynak';
  if (raw === 'en' || raw === 'english') return 'İngilizce kaynak';
  if (!raw || raw === 'unknown' || raw === 'und') return 'Kaynak dili belirtilmemiş';
  return 'Yabancı kaynak';
}

function isTurkishReady(candidate: KnowledgeArticleCandidate) {
  return metadataText(candidate, 'translationStatus') === 'ready';
}

function authorText(candidate: KnowledgeArticleCandidate) {
  const names = (candidate.authors ?? []).map((item) => item?.name).filter(Boolean).slice(0, 4);
  if (!names.length) return '';
  return `${names.join(', ')}${(candidate.authors?.length ?? 0) > 4 ? ' ve diğerleri' : ''}`;
}

export default function KnowledgeArticleRadar({ onImported }: { onImported?: () => void | Promise<void> }) {
  const currentYear = new Date().getFullYear();
  const [query, setQuery] = useState('');
  const [fromYear, setFromYear] = useState(Math.max(2000, currentYear - 5));
  const [openAccessOnly, setOpenAccessOnly] = useState(false);
  const [statusFilter, setStatusFilter] = useState<KnowledgeArticleStatus | 'all'>('candidate');
  const [candidates, setCandidates] = useState<KnowledgeArticleCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  const visible = useMemo(() => candidates, [candidates]);

  const ensureTurkish = async (rows: KnowledgeArticleCandidate[], filter: KnowledgeArticleStatus | 'all') => {
    const pendingIds = rows.filter((candidate) => !isTurkishReady(candidate)).map((candidate) => candidate.id).slice(0, 60);
    if (!pendingIds.length) return rows;

    const { data, error } = await supabase.functions.invoke('knowledge-article-radar', {
      body: { action: 'translate', candidateIds: pendingIds },
    });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return listArticleRadarCandidates(filter);
  };

  const refresh = async (filter: KnowledgeArticleStatus | 'all' = statusFilter) => {
    setLoading(true);
    try {
      const rows = await listArticleRadarCandidates(filter);
      const translatedRows = await ensureTurkish(rows, filter);
      setCandidates(translatedRows.filter(isTurkishReady));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh(statusFilter).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Makale adayları yüklenemedi.');
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const scan = async (event: FormEvent) => {
    event.preventDefault();
    setMessage('');
    setErrorMessage('');
    setBusy('scan');
    try {
      const result = await scanArticleRadar({ query, fromYear, openAccessOnly, limit: 20 });
      setStatusFilter('candidate');
      const rows = await listArticleRadarCandidates('candidate');
      const translatedRows = await ensureTurkish(rows, 'candidate');
      setCandidates(translatedRows.filter(isTurkishReady));
      setMessage(`${result.found} çalışma bulundu; ${result.stored} aday Türkçeleştirilerek hazırlandı. Sonuçlar yayınlanmaz, önce sen incelersin.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Makale taraması tamamlanamadı.');
    } finally {
      setBusy('');
    }
  };

  const updateStatus = async (candidate: KnowledgeArticleCandidate, status: 'candidate' | 'ignored') => {
    setMessage('');
    setErrorMessage('');
    setBusy(`status:${candidate.id}`);
    try {
      await setArticleRadarCandidateStatus(candidate.id, status);
      await refresh(statusFilter);
      setMessage(status === 'ignored' ? 'Kaynak adayı gizlendi.' : 'Kaynak yeniden aday listesine alındı.');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Kaynak durumu güncellenemedi.');
    } finally {
      setBusy('');
    }
  };

  const importCandidate = async (candidate: KnowledgeArticleCandidate) => {
    setMessage('');
    setErrorMessage('');
    setBusy(`import:${candidate.id}`);
    try {
      const result = await importArticleRadarCandidate(candidate.id);
      await refresh(statusFilter);
      await onImported?.();
      if (result.extractionError) {
        setMessage(`PDF Bilgi Rehberi hazırlığına alındı fakat otomatik çıkarım tamamlanamadı: ${result.extractionError}. Belgeyi aşağıdaki PDF bölümünden yeniden çıkarabilirsin.`);
      } else if (result.extraction) {
        setMessage(`Kaynak Bilgi Rehberi hazırlığına alındı; PDF’den ${result.extraction.claimCount ?? 0} bilgi parçası çıkarıldı. Aşağıdaki belge bölümünden rehberde kullanacaklarını seçebilirsin.`);
      } else {
        setMessage(result.alreadyImported ? 'Bu çalışma zaten Bilgi Rehberi hazırlık alanında.' : 'Kaynak Bilgi Rehberi hazırlığına alındı ve seçim ekranına gönderildi.');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Kaynak Bilgi Rehberi hazırlığına alınamadı.');
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="tp-ka-card tp-kar">
      <div className="tp-ka-head">
        <div>
          <h3>Bilgi Rehberi Kaynak Radarı</h3>
          <p className="tp-ka-sub">OpenAlex, Crossref ve Semantic Scholar üzerinden Bilgi Rehberi için kaynak tarar. Yabancı kaynakların başlığı ve metin özeti admin ekranına gelmeden otomatik Türkçeleştirilir.</p>
        </div>
        <span className="tp-ka-status">3 AKADEMİK KAYNAK</span>
      </div>

      <form className="tp-kar-toolbar" onSubmit={scan}>
        <label className="tp-kar-search">Konu / ürün / araştırma
          <input className="tp-ka-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Örn. badem, buğday sulama, fındık hastalıkları" />
        </label>
        <label>Başlangıç yılı
          <input className="tp-ka-input" type="number" min="1900" max={currentYear + 1} value={fromYear} onChange={(event) => setFromYear(Number(event.target.value) || currentYear - 5)} />
        </label>
        <label className="tp-kar-check">
          <input type="checkbox" checked={openAccessOnly} onChange={(event) => setOpenAccessOnly(event.target.checked)} />
          Sadece açık erişim
        </label>
        <button className="tp-ka-btn tp-ka-btn-primary tp-kar-submit" type="submit" disabled={busy === 'scan' || query.trim().length < 3}>
          {busy === 'scan' ? 'Taranıyor…' : 'Rehber Kaynaklarını Tara'}
        </button>
      </form>

      <p className="tp-kar-note">Buradaki çalışmalar Bilgi Rehberi için kaynak adaylarıdır. Admin yalnız Türkçe başlık ve Türkçe metin özeti görür; orijinal yabancı metin arka planda kaynak kanıtı olarak saklanır. Güvenli lisanslı PDF varsa “Rehberde Kullan” ile içeriği parçalara ayırırız. Hiçbiri otomatik yayınlanmaz.</p>

      {message && <div className="tp-kar-result">{message}</div>}
      {errorMessage && <div className="tp-kar-result is-error">{errorMessage}</div>}

      <div className="tp-kar-status-tabs">
        {(['candidate', 'imported', 'ignored', 'all'] as const).map((status) => (
          <button key={status} type="button" className={`tp-kar-status-tab ${statusFilter === status ? 'is-active' : ''}`} onClick={() => setStatusFilter(status)}>
            {status === 'candidate' ? 'Kaynak Adayları' : status === 'imported' ? 'Rehbere Alınanlar' : status === 'ignored' ? 'Gizlenenler' : 'Tümü'}
          </button>
        ))}
      </div>

      <div className="tp-kar-list">
        {loading && <div className="tp-kar-empty">Makale adayları yükleniyor…</div>}
        {!loading && visible.length === 0 && <div className="tp-kar-empty">Bu görünümde makale adayı yok.</div>}
        {!loading && visible.map((candidate) => {
          const autoImport = canAutoImport(candidate);
          const authors = authorText(candidate);
          return (
            <article className="tp-kar-article" key={candidate.id}>
              <div className="tp-kar-top">
                <div>
                  <h4 className="tp-kar-title">{candidate.title}</h4>
                  <p className="tp-kar-source">
                    {[candidate.source_name, candidate.publication_year ? String(candidate.publication_year) : null].filter(Boolean).join(' · ') || 'Kaynak bilgisi yok'}
                  </p>
                  {authors && <div className="tp-kar-author">{authors}</div>}
                  <p style={{ margin: '10px 0 0', lineHeight: 1.55, color: '#2f3437', fontSize: '0.92rem' }}>
                    {metadataText(candidate, 'turkishSummary') || 'Bu kaynak için Türkçe özet bulunamadı; tam metin rehber hazırlığı aşamasında incelenecek.'}
                  </p>
                </div>
                <span className="tp-ka-status" data-status={candidate.status === 'imported' ? 'approved' : candidate.status === 'ignored' ? 'rejected' : 'review'}>{statusLabel(candidate.status)}</span>
              </div>

              <div className="tp-kar-meta">
                {candidate.is_oa && <span className="tp-kar-pill">Açık erişim</span>}
                {candidate.oa_status && <span className="tp-kar-pill">OA: {candidate.oa_status}</span>}
                {candidate.license && <span className={`tp-kar-pill ${autoImport ? 'is-license' : 'is-warning'}`}>Lisans: {candidate.license}</span>}
                <span className="tp-kar-pill">Atıf: {candidate.cited_by_count ?? 0}</span>
                <span className="tp-kar-pill">{sourceLanguageLabel(candidate)}</span>
                {(candidate.topics ?? []).slice(0, 4).map((topic) => <span className="tp-kar-pill" key={`${candidate.id}:${topic}`}>{topic}</span>)}
              </div>

              <div className="tp-kar-actions">
                {candidate.oa_url && <a className="tp-ka-btn" href={candidate.oa_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Kaynağı aç</a>}
                {!candidate.oa_url && candidate.doi && <a className="tp-ka-btn" href={candidate.doi} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>DOI aç</a>}
                {candidate.pdf_url && <a className="tp-ka-btn" href={candidate.pdf_url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', textDecoration: 'none' }}>Açık PDF</a>}
                {candidate.status === 'candidate' && (
                  <button className="tp-ka-btn tp-ka-btn-primary" type="button" disabled={!autoImport || Boolean(busy)} title={!autoImport ? 'Otomatik aktarım için doğrudan PDF ve CC0 / CC BY / public-domain lisansı gerekli.' : undefined} onClick={() => void importCandidate(candidate)}>
                    {busy === `import:${candidate.id}` ? 'Hazırlanıyor…' : 'Rehberde Kullan'}
                  </button>
                )}
                {candidate.status === 'candidate' && <button className="tp-ka-btn" type="button" disabled={Boolean(busy)} onClick={() => void updateStatus(candidate, 'ignored')}>Gizle</button>}
                {candidate.status === 'ignored' && <button className="tp-ka-btn" type="button" disabled={Boolean(busy)} onClick={() => void updateStatus(candidate, 'candidate')}>Adaylara döndür</button>}
              </div>

              {candidate.status === 'imported' && <div className="tp-kar-import-ok">PDF Bilgi Rehberi hazırlığına bağlandı. Aşağıdaki belge bölümünde çıkarılan bilgi parçalarını PDF sırasıyla seç; yalnız seçtiklerin rehber taslağında kullanılacak.</div>}
              {candidate.status === 'candidate' && !autoImport && <div className="tp-kar-note">Otomatik aktarım kapalı: {candidate.pdf_url ? `lisans ${candidate.license || 'belirsiz'}` : 'doğrudan açık PDF bulunamadı'}. Kaynağı açıp lisansını doğruladıktan sonra uygun PDF’yi elle yükleyebilirsin.</div>}
            </article>
          );
        })}
      </div>
    </section>
  );
}
