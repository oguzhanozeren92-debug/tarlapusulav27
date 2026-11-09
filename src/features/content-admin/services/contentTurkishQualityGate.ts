/** Source-grounded publication gate for foreign crop/news content.
 * Rewriting must finish before approving: a foreign original cannot be published
 * with its English source title or an English paragraph by accident.
 */
export type TranslationCandidate = {
  original_language?: string | null;
  source_refs?: Array<Record<string, unknown>> | null;
  title_suggested?: string | null;
  short_summary?: string | null;
  body_draft?: string | null;
  structured_body?: { translation_status?: string | null } | null;
};
const leftoverEnglish = /\b(?:late[- ]deficit irrigation|post[- ]harvest|crop yield|fruit quality|pest management|disease management|field scouting|drip irrigation|soil moisture|water stress|heat stress|crop production|yield improvement|field trial|irrigation scheduling|precision agriculture|climate resilience|orchard management)\b/i;
const obviousEnglishSentence = /\b(?:the|this|these|those|with|from|which|should|their|farmers|researchers|according|study)\s+(?:[a-z]+\s+){2,}/gi;

export function translationPublicationProblem(item: TranslationCandidate): string | null {
  const language = String(item.original_language || item.source_refs?.[0]?.language || 'tr').toLowerCase().trim();
  if (!language || language.startsWith('tr')) return null;
  if (item.structured_body?.translation_status !== 'translated_full_tr') {
    return 'Yabancı kaynaklı içerik önce tam Türkçe çeviri ve editoryal kontrolden geçmeli.';
  }
  const title = String(item.title_suggested || '').trim();
  const summary = String(item.short_summary || '').trim();
  const body = String(item.body_draft || '').trim();
  if (title.length < 12 || summary.length < 45 || body.length < 100) {
    return 'Kaynak ve Türkçe içerik yetersiz: başlık, özet ve açıklama yeniden işlenmeli.';
  }
  const visible = [title,summary,body].join(' ');
  if (leftoverEnglish.test(visible) || (visible.match(obviousEnglishSentence)?.length || 0) >= 2) {
    return 'İçerikte İngilizce veya yarım çevrilmiş tarım ifadesi kaldı. Yeniden Türkçeleştir.';
  }
  return null;
}
