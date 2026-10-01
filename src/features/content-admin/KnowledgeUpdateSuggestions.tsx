import type { UpdateCandidate, UpdateSuggestion, UpdateTarget } from './services/knowledgeUpdateSuggestions.service';
import './KnowledgeUpdateSuggestions.css';

export default function KnowledgeUpdateSuggestions({ candidate, suggestions, targets, busy, onSelect }: {
  candidate: UpdateCandidate;
  suggestions: UpdateSuggestion[];
  targets: UpdateTarget[];
  busy: boolean;
  onSelect: (id: string | null) => void;
}) {
  if (candidate.candidate_type === 'news') return null;
  if (!suggestions.length && !candidate.target_content_id && candidate.candidate_type !== 'knowledge_update') return null;
  const selected = targets.find((target) => target.id === candidate.target_content_id);
  const options = selected && !suggestions.some((item) => item.target.id === selected.id)
    ? [{ target: selected, score: 0, reason: 'Bu adaya bağlı mevcut kart' }, ...suggestions]
    : suggestions;
  return (
    <section className="tp-knowledge-updates" aria-label="Mevcut bilgi kartını güncelle">
      <strong>{candidate.target_content_id ? 'Mevcut karta güncelleme' : 'Benzer bilgi kartları'}</strong>
      <p>Seçimden sonra yayın onayı verdiğinde hedef kartın metni bu adayın metniyle değiştirilir. Metinler otomatik birleştirilmez.</p>
      <small>Öneriler bu panelde yüklenen son 300 içerikle sınırlıdır; tüm arşivde kopya bulunmadığı anlamına gelmez.</small>
      {!options.length && !candidate.target_content_id && <p>Yüklenen yayınlarda belirgin bir eşleşme bulunamadı.</p>}
      {candidate.target_content_id && !selected && <p role="alert">Bağlı kart bu listede yok. Yenile veya aşağıdaki bağlantıyı kaldır.</p>}
      {options.map(({ target, reason }) => (
        <div className="tp-knowledge-updates__option" key={target.id}>
          <strong>{target.title}</strong>
          <small>{reason}</small>
          <details>
            <summary>Mevcut metin ile adayı karşılaştır</summary>
            <h4>Yayındaki metin</h4>
            <p className="tp-knowledge-updates__text">{target.body || target.excerpt || 'Metin yok.'}</p>
            <h4>Aday metni</h4>
            <p className="tp-knowledge-updates__text">{candidate.body_draft || candidate.short_summary || 'Metin yok.'}</p>
          </details>
          <button type="button" disabled={busy || candidate.target_content_id === target.id}
            onClick={() => onSelect(target.id)}>
            {candidate.target_content_id === target.id ? 'Güncellenecek kart seçildi' : 'Bu kartı güncellemek için seç'}
          </button>
        </div>
      ))}
      {(candidate.target_content_id || candidate.candidate_type === 'knowledge_update') && (
        <button type="button" disabled={busy} onClick={() => onSelect(null)}>Bağlantıyı kaldır · yeni kart olarak değerlendir</button>
      )}
      <small>Hedef seçimi bu sayfada tutulur. Yayın ancak “Onayla ve Güncelle” ile yapılır.</small>
    </section>
  );
}
