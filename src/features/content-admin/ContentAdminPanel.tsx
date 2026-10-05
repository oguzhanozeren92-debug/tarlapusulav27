import { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ExternalLink,
  Image as ImageIcon,
  Newspaper,
  Pencil,
  Plus,
  Upload,
  RefreshCw,
  Search,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import KnowledgeUpdateSuggestions from './KnowledgeUpdateSuggestions';
import KnowledgeAdminPanel from '../knowledge/components/KnowledgeAdminPanel';
import ContentCoveragePanel from './ContentCoveragePanel.tsx';
import { suggestKnowledgeUpdates, validateUpdateTarget } from './services/knowledgeUpdateSuggestions.service';
import './ContentAdminPanel.css';

type CandidateStatus = 'pending' | 'approved' | 'rejected' | 'held';
type CandidateType = 'news' | 'knowledge_new' | 'knowledge_update';
type AdminTab = 'queue' | 'published' | 'manual' | 'pdf' | 'sources' | 'coverage';
type QueueFilter = 'all' | 'news' | 'article' | 'guide';
type SourceChannel = 'news' | 'article' | 'guide';

type ChartData = {
  title?: string | null;
  type?: 'bar' | 'line' | string | null;
  labels?: string[] | null;
  values?: number[] | null;
  unit?: string | null;
};

type TableData = {
  title?: string | null;
  columns?: string[] | null;
  rows?: Array<Array<string | number | null>> | null;
};

type StructuredBody = {
  problem?: string | null;
  findings?: string[] | null;
  practical_takeaway?: string | null;
  chart_data?: ChartData | null;
  table_data?: TableData | null;
  channel?: 'news' | 'article' | 'guide' | string | null;
  crop_matches?: string[] | null;
  topic?: string | null;
  user_crop_match_count?: number | null;
  crop_priority?: number | null;
  producer_practicality_score?: number | null;
  discovery_mode?: string | null;
  translation_status?: string | null;
  producer_summary_status?: string | null;
  admin_visibility?: string | null;
  queue_block_reason?: string | null;
};

type Candidate = {
  id: string;
  candidate_type: CandidateType;
  content_subtype: string | null;
  title_suggested: string;
  short_summary: string | null;
  body_draft: string | null;
  structured_body: StructuredBody | null;
  source_refs: Array<Record<string, unknown>> | null;
  suggested_category: string | null;
  suggested_tags: string[] | null;
  suggested_crops: string[] | null;
  original_language: string | null;
  relevance_score: number | null;
  trust_score: number | null;
  novelty_score: number | null;
  copyright_status: 'safe' | 'review' | 'blocked';
  workflow_status: CandidateStatus;
  target_content_id: string | null;
  generated_at: string;
  reviewed_at: string | null;
  admin_score: number | null;
  admin_note: string | null;
  doi_number: string | null;
  author_text: string | null;
  institution_text: string | null;
  reading_time_minutes: number | null;
  image_search_keyword: string | null;
  coverage_scope: 'turkey' | 'world' | null;
  country_code: string | null;
  country_name: string | null;
  location_text: string | null;
  event_date: string | null;
  payload_r2_key: string | null;
  payload_public_url: string | null;
  payload_status: string | null;
  image_status: string | null;
};

type ContentItem = {
  tags?: string[] | null;
  crop_tags?: string[] | null;
  source_refs?: Array<Record<string, unknown>> | null;
  id: string;
  content_type: 'news' | 'knowledge';
  content_subtype: string | null;
  title: string;
  excerpt: string | null;
  body: string;
  status: 'draft' | 'approved' | 'published' | 'archived' | 'removed';
  category: string | null;
  doi_number: string | null;
  average_rating: number | string;
  rating_count: number;
  views_count: number;
  published_at: string | null;
  updated_at: string;
  coverage_scope: 'turkey' | 'world' | null;
  country_code: string | null;
  country_name: string | null;
  location_text: string | null;
  event_date: string | null;
  payload_r2_key: string | null;
  payload_public_url: string | null;
  payload_status: string | null;
  image_status: string | null;
};

type ContentSource = {
  id: string;
  name: string;
  base_url: string;
  source_type: string;
  language: string;
  country: string | null;
  trust_score: number;
  active: boolean;
  scan_frequency_hours: number;
  last_scanned_at: string | null;
  metadata: Record<string, unknown> | null;
};

type ContentImage = {
  id: string;
  candidate_id: string | null;
  content_id: string | null;
  public_url: string | null;
  original_url: string | null;
  license_type: string | null;
  credit_text: string | null;
  status: string;
  is_cover: boolean;
};

type CandidateEdits = {
  score: number;
  note: string;
};

type EditorDraft = {
  title: string;
  summary: string;
  body: string;
  category: string;
  doi: string;
  author: string;
  institution: string;
  imageKeyword: string;
  coverageScope: 'turkey' | 'world';
  locationText: string;
  eventDate: string;
  problem: string;
  finding1: string;
  finding2: string;
  finding3: string;
  takeaway: string;
  chartJson: string;
  tableJson: string;
};

type ManualContentDraft = {
  kind: 'news' | 'article' | 'guide';
  title: string;
  summary: string;
  body: string;
  category: string;
  coverageScope: 'turkey' | 'world';
  locationText: string;
  eventDate: string;
  author: string;
  institution: string;
  doi: string;
  takeaway: string;
  tags: string;
  crops: string;
  imageKeyword: string;
  sourceName: string;
  sourceUrl: string;
};

type SourceDraft = {
  name: string;
  channel: 'news' | 'article' | 'guide';
  guideCategory: 'growing' | 'disease' | 'pest' | 'weed' | 'nutrition' | 'irrigation' | 'fertilization' | 'soil' | 'harvest_storage';
  baseUrl: string;
  sourceKind: 'html' | 'rss' | 'official' | 'api';
  language: string;
  country: string;
  trustScore: number;
  scanFrequencyHours: number;
  apiProvider: 'openalex' | 'semantic_scholar' | 'arxiv' | 'core';
  query: string;
};

const emptyManualDraft = (): ManualContentDraft => ({
  kind: 'news',
  title: '',
  summary: '',
  body: '',
  category: '',
  coverageScope: 'turkey',
  locationText: '',
  eventDate: new Date().toISOString().slice(0, 10),
  author: '',
  institution: '',
  doi: '',
  takeaway: '',
  tags: '',
  crops: '',
  imageKeyword: '',
  sourceName: '',
  sourceUrl: '',
});

const emptySourceDraft = (): SourceDraft => ({
  name: '',
  channel: 'news',
  guideCategory: 'growing',
  baseUrl: '',
  sourceKind: 'html',
  language: 'tr',
  country: 'TR',
  trustScore: 85,
  scanFrequencyHours: 12,
  apiProvider: 'openalex',
  query: '',
});

const apiProviderUrl = (provider: SourceDraft['apiProvider']) => {
  if (provider === 'semantic_scholar') return 'https://api.semanticscholar.org/graph/v1/paper/search';
  if (provider === 'arxiv') return 'https://export.arxiv.org/api/query';
  if (provider === 'core') return 'https://api.core.ac.uk/v3/search/works';
  return 'https://api.openalex.org/works';
};

const commaList = (value: string) =>
  value.split(',').map((item) => item.trim()).filter(Boolean).slice(0, 20);

const makeManualExcerpt = (value: string, max = 420) => {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const clipped = text.slice(0, max);
  const sentenceEnd = Math.max(
    clipped.lastIndexOf('. '),
    clipped.lastIndexOf('! '),
    clipped.lastIndexOf('? '),
  );
  if (sentenceEnd >= Math.floor(max * 0.58)) {
    return clipped.slice(0, sentenceEnd + 1).trim();
  }
  const wordEnd = clipped.lastIndexOf(' ');
  return `${clipped.slice(0, wordEnd > 0 ? wordEnd : max).trim()}…`;
};

const SAFE_IMAGE_LICENSES = new Set(['cc0', 'pdm', 'by', 'by-sa', 'cc-by', 'cc-by-sa', 'public-domain', 'public_domain', 'admin-upload']);

const fmtDate = (value: string | null | undefined) => {
  if (!value) return '—';
  try {
    return new Intl.DateTimeFormat('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  } catch {
    return value;
  }
};

const slugify = (value: string, suffix: string) => {
  const base = value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return `${base || 'icerik'}-${suffix.slice(0, 8)}`;
};

const sourceName = (candidate: Candidate) => {
  const first = candidate.source_refs?.[0];
  const name = first?.source_name;
  return typeof name === 'string' && name.trim() ? name : 'Kaynak';
};

const sourceUrl = (candidate: Candidate) => {
  const first = candidate.source_refs?.[0];
  const url = first?.url;
  return typeof url === 'string' ? url : '';
};

const isArticleCandidate = (candidate: Candidate) => candidate.content_subtype === 'article' || candidate.structured_body?.channel === 'article';
const isGuideCandidate = (candidate: Candidate) =>
  candidate.content_subtype === 'guide' ||
  candidate.structured_body?.channel === 'guide' ||
  Boolean(candidate.suggested_tags?.some((tag) => tag.toLocaleLowerCase('tr-TR') === 'bilgi rehberi'));
const typeLabel = (candidate: Candidate) => {
  if (isArticleCandidate(candidate)) return 'Ar-Ge Makalesi';
  if (isGuideCandidate(candidate)) return 'Bilgi Rehberi';
  if (candidate.candidate_type === 'news') return 'Haber';
  if (candidate.candidate_type === 'knowledge_update') return 'Bilgi güncellemesi';
  return 'Bilgi Merkezi';
};

function ratingNumber(value: number | string | null | undefined) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function parseJsonOrNull(value: string) {
  const text = value.trim();
  if (!text) return null;
  return JSON.parse(text);
}

function editorDraft(candidate: Candidate): EditorDraft {
  const findings = Array.isArray(candidate.structured_body?.findings)
    ? candidate.structured_body!.findings!.slice(0, 3)
    : [];
  return {
    title: candidate.title_suggested || '',
    summary: candidate.short_summary || '',
    body: candidate.body_draft || '',
    category: candidate.suggested_category || '',
    doi: candidate.doi_number || '',
    author: candidate.author_text || '',
    institution: candidate.institution_text || '',
    imageKeyword: candidate.image_search_keyword || '',
    coverageScope: candidate.coverage_scope === 'world' ? 'world' : 'turkey',
    locationText: candidate.location_text || '',
    eventDate: candidate.event_date ? new Date(candidate.event_date).toISOString().slice(0, 10) : '',
    problem: candidate.structured_body?.problem || '',
    finding1: findings[0] || '',
    finding2: findings[1] || '',
    finding3: findings[2] || '',
    takeaway: candidate.structured_body?.practical_takeaway || '',
    chartJson: candidate.structured_body?.chart_data ? JSON.stringify(candidate.structured_body.chart_data, null, 2) : '',
    tableJson: candidate.structured_body?.table_data ? JSON.stringify(candidate.structured_body.table_data, null, 2) : '',
  };
}

export default function ContentAdminPanel() {
  const [activeTab, setActiveTab] = useState<AdminTab>('queue');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [published, setPublished] = useState<ContentItem[]>([]);
  const [sources, setSources] = useState<ContentSource[]>([]);
  const [images, setImages] = useState<ContentImage[]>([]);
  const [edits, setEdits] = useState<Record<string, CandidateEdits>>({});
  const [editorCandidate, setEditorCandidate] = useState<Candidate | null>(null);
  const [draft, setDraft] = useState<EditorDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState('');
  const [message, setMessage] = useState('');
  const [searchText, setSearchText] = useState('');
  const [manualDraft, setManualDraft] = useState<ManualContentDraft>(() => emptyManualDraft());
  const [manualImage, setManualImage] = useState<File | null>(null);
  const [manualImagePreview, setManualImagePreview] = useState('');
  const [manualRightsConfirmed, setManualRightsConfirmed] = useState(false);
  const [sourceDraft, setSourceDraft] = useState<SourceDraft>(() => emptySourceDraft());
  const [sourceChannelTab, setSourceChannelTab] = useState<SourceChannel>('news');
  const [updateTargets, setUpdateTargets] = useState<Record<string, string | null>>({});
  const [coverageFilter, setCoverageFilter] = useState<{ list: 'queue' | 'published'; ids: string[]; label: string } | null>(null);
  const [coverageReady, setCoverageReady] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setCoverageReady(false);
    setMessage('');
    try {
      const [candidateRes, itemRes, sourceRes, imageRes] = await Promise.all([
        supabase
          .from('content_candidates')
          .select('*')
          .eq('workflow_status', 'pending')
          .order('generated_at', { ascending: false })
          .limit(300),
        supabase
          .from('content_items')
          .select('id,content_type,content_subtype,title,excerpt,body,status,category,tags,crop_tags,source_refs,doi_number,average_rating,rating_count,views_count,published_at,updated_at,coverage_scope,country_code,country_name,location_text,event_date,payload_r2_key,payload_public_url,payload_status,image_status')
          .in('status', ['published', 'approved', 'removed'])
          .order('updated_at', { ascending: false })
          .limit(300),
        supabase
          .from('content_sources')
          .select('id,name,base_url,source_type,language,country,trust_score,active,scan_frequency_hours,last_scanned_at,metadata')
          .order('trust_score', { ascending: false }),
        supabase
          .from('content_images')
          .select('id,candidate_id,content_id,public_url,original_url,license_type,credit_text,status,is_cover')
          .order('created_at', { ascending: false })
          .limit(700),
      ]);

      if (candidateRes.error) throw candidateRes.error;
      if (itemRes.error) throw itemRes.error;
      if (sourceRes.error) throw sourceRes.error;
      if (imageRes.error) throw imageRes.error;

      const nextCandidates = (candidateRes.data ?? []) as Candidate[];
      setCandidates(nextCandidates);
      setUpdateTargets({});
      setCoverageFilter(null);
      setCoverageReady(true);
      setPublished((itemRes.data ?? []) as ContentItem[]);
      setSources((sourceRes.data ?? []) as ContentSource[]);
      setImages((imageRes.data ?? []) as ContentImage[]);
      setEdits((current) => {
        const next = { ...current };
        nextCandidates.forEach((candidate) => {
          if (!next[candidate.id]) {
            next[candidate.id] = {
              score: candidate.admin_score ?? 5,
              note: candidate.admin_note ?? '',
            };
          }
        });
        return next;
      });
    } catch (error: any) {
      setMessage(error?.message || 'İçerik merkezi yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const queue = useMemo(() => {
    const needle = searchText.trim().toLocaleLowerCase('tr-TR');
    return candidates.filter((candidate) => {
      if (candidate.workflow_status !== 'pending') return false;

      const translationStatus = String(
        candidate.structured_body?.translation_status ?? '',
      ).toLocaleLowerCase('tr-TR');

      const producerSummaryStatus = String(
        candidate.structured_body?.producer_summary_status ?? '',
      ).toLocaleLowerCase('tr-TR');

      const backgroundOnly =
        candidate.structured_body?.admin_visibility === 'background_only' ||
        ['processing', 'pending_ai', 'failed_auto', 'blocked'].includes(translationStatus) ||
        ['processing', 'pending_ai', 'blocked'].includes(producerSummaryStatus);

      if (backgroundOnly) return false;
      if (coverageFilter?.list === 'queue' && !coverageFilter.ids.includes(candidate.id)) return false;
      if (queueFilter === 'news' && candidate.candidate_type !== 'news') return false;
      if (queueFilter === 'article' && !isArticleCandidate(candidate)) return false;
      if (queueFilter === 'guide' && !isGuideCandidate(candidate)) return false;
      if (!needle) return true;
      return `${candidate.title_suggested} ${candidate.short_summary ?? ''} ${sourceName(candidate)} ${(candidate.suggested_crops ?? []).join(' ')} ${candidate.structured_body?.topic ?? ''}`
        .toLocaleLowerCase('tr-TR')
        .includes(needle);
    });
  }, [candidates, queueFilter, searchText, coverageFilter]);

  const updateSuggestions = useMemo(() => new Map(
    queue.map((candidate) => [candidate.id, suggestKnowledgeUpdates(candidate, published)]),
  ), [queue, published]);

  const imageForCandidate = (candidateId: string) =>
    images.find((image) => image.candidate_id === candidateId && image.is_cover) ??
    images.find((image) => image.candidate_id === candidateId);

  const imageForContent = (contentId: string) =>
    images.find((image) => image.content_id === contentId && image.is_cover) ??
    images.find((image) => image.content_id === contentId);

  const safeImagesForCandidate = (candidateId: string) =>
    images.filter((image) =>
      image.candidate_id === candidateId &&
      image.status !== 'rejected' &&
      Boolean(image.license_type) &&
      SAFE_IMAGE_LICENSES.has(String(image.license_type).toLowerCase())
    );

  const guideImageProgress = (candidate: Candidate) => {
    const safe = safeImagesForCandidate(candidate.id);
    const hasCover = safe.some((image) => image.is_cover);
    return { safe, count: safe.length, hasCover, ready: hasCover && safe.length >= 3 };
  };

  const setCandidateEdit = (candidateId: string, patch: Partial<CandidateEdits>) => {
    setEdits((current) => ({
      ...current,
      [candidateId]: {
        score: current[candidateId]?.score ?? 5,
        note: current[candidateId]?.note ?? '',
        ...patch,
      },
    }));
  };

  const openEditor = (candidate: Candidate) => {
    setEditorCandidate(candidate);
    setDraft(editorDraft(candidate));
  };

  const saveEditor = async () => {
    if (!editorCandidate || !draft) return;
    setWorkingId(editorCandidate.id);
    setMessage('');
    try {
      const chart = parseJsonOrNull(draft.chartJson);
      const table = parseJsonOrNull(draft.tableJson);
      const structured: StructuredBody | null = isArticleCandidate(editorCandidate)
        ? {
            problem: draft.problem.trim() || null,
            findings: [draft.finding1, draft.finding2, draft.finding3].map((item) => item.trim()).filter(Boolean),
            practical_takeaway: draft.takeaway.trim() || null,
            chart_data: chart,
            table_data: table,
          }
        : editorCandidate.structured_body;

      const { error } = await supabase
        .from('content_candidates')
        .update({
          title_suggested: draft.title.trim(),
          short_summary: draft.summary.trim() || null,
          body_draft: draft.body.trim() || null,
          suggested_category: draft.category.trim() || null,
          doi_number: draft.doi.trim() || null,
          author_text: draft.author.trim() || null,
          institution_text: draft.institution.trim() || null,
          image_search_keyword: draft.imageKeyword.trim() || null,
          coverage_scope: draft.coverageScope,
          country_code: draft.coverageScope === 'turkey' ? 'TR' : null,
          country_name: draft.coverageScope === 'turkey' ? 'Türkiye' : null,
          location_text: draft.locationText.trim() || null,
          event_date: draft.eventDate ? new Date(`${draft.eventDate}T00:00:00Z`).toISOString() : null,
          structured_body: structured,
        })
        .eq('id', editorCandidate.id);
      if (error) throw error;
      setMessage('Taslak kaydedildi.');
      setEditorCandidate(null);
      setDraft(null);
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Taslak kaydedilemedi. Grafik/Tablo JSON alanını kontrol et.');
    } finally {
      setWorkingId('');
    }
  };

  const reviewCandidate = async (candidate: Candidate, status: 'held' | 'rejected') => {
    setWorkingId(candidate.id);
    setMessage('');
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Admin oturumu bulunamadı.');
      const edit = edits[candidate.id] ?? { score: 5, note: '' };
      const { error } = await supabase
        .from('content_candidates')
        .update({
          workflow_status: status,
          reviewed_at: new Date().toISOString(),
          reviewed_by: auth.user.id,
          admin_score: edit.score,
          admin_note: edit.note || null,
        })
        .eq('id', candidate.id);
      if (error) throw error;

      await supabase.from('content_feedback').insert({
        candidate_id: candidate.id,
        score: edit.score,
        feedback_note: edit.note || null,
        created_by: auth.user.id,
      });

      setMessage(status === 'held' ? 'İçerik beklemeye alındı.' : 'İçerik reddedildi.');
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'İşlem tamamlanamadı.');
    } finally {
      setWorkingId('');
    }
  };



  const setManualImageFile = (file: File | null) => {
    if (manualImagePreview) URL.revokeObjectURL(manualImagePreview);
    setManualImage(file);
    setManualImagePreview(file ? URL.createObjectURL(file) : '');
  };

  const uploadImageToR2 = async ({
    file,
    candidateId,
    contentId,
    altText,
    rightsConfirmed = true,
  }: {
    file: File;
    candidateId?: string;
    contentId?: string;
    altText?: string;
    rightsConfirmed?: boolean;
  }) => {
    const form = new FormData();
    form.append('file', file);
    if (candidateId) form.append('candidateId', candidateId);
    if (contentId) form.append('contentId', contentId);
    form.append('rightsConfirmed', rightsConfirmed ? 'true' : 'false');
    form.append('altText', altText || '');
    const { data, error } = await supabase.functions.invoke('content-admin-image-upload', { body: form });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const uploadCoverFile = async ({
    file,
    candidateId,
    contentId,
    busyId,
    title,
  }: {
    file: File;
    candidateId?: string;
    contentId?: string;
    busyId: string;
    title: string;
  }) => {
    if (!window.confirm('Bu görseli TarlaPusula’da yayınlama / kullanma hakkına sahip olduğunu onaylıyor musun?')) return;
    setWorkingId(busyId);
    setMessage('Görsel R2’ye yükleniyor…');
    try {
      const data = await uploadImageToR2({ file, candidateId, contentId, altText: title, rightsConfirmed: true });
      setMessage(`Görsel R2’ye yüklendi · ${Math.max(1, Math.round(Number(data?.bytes || file.size) / 1024))} KB`);
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Görsel yüklenemedi.');
    } finally {
      setWorkingId('');
    }
  };

  const publishManualContent = async () => {
    const title = manualDraft.title.trim();
    const body = manualDraft.body.trim();
    if (!title || !body) {
      setMessage('Manuel yayın için başlık ve içerik zorunlu.');
      return;
    }
    if (manualImage && !manualRightsConfirmed) {
      setMessage('Yüklediğin görselin kullanım hakkını onaylaman gerekiyor.');
      return;
    }
    if (manualDraft.kind === 'news') {
      const manualSourceName = manualDraft.sourceName.trim();
      const manualSourceUrl = manualDraft.sourceUrl.trim();
      if (!manualSourceName || !/^https?:\/\//i.test(manualSourceUrl)) {
        setMessage('Manuel haberde kaynak adı ve orijinal kaynak bağlantısı zorunlu.');
        return;
      }
    }

    setWorkingId('__manual__');
    setMessage('Manuel içerik hazırlanıyor…');
    let createdContentId = '';
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Admin oturumu bulunamadı.');

      const now = new Date().toISOString();
      const article = manualDraft.kind === 'article';
      const guide = manualDraft.kind === 'guide';
      if (article) {
        const manualYear = manualDraft.eventDate ? Number(manualDraft.eventDate.slice(0, 4)) : NaN;
        if (!Number.isFinite(manualYear) || manualYear < 2010) {
          throw new Error('Manuel makale için tarih 2010 veya sonrası olmalı.');
        }
      }
      const eventDate = manualDraft.eventDate ? new Date(`${manualDraft.eventDate}T00:00:00Z`).toISOString() : null;
      const sourceRefs = manualDraft.sourceUrl.trim()
        ? [{
            source_name: manualDraft.sourceName.trim() || 'Admin kaynağı',
            url: manualDraft.sourceUrl.trim(),
            language: 'tr',
            published_at: eventDate,
            attribution_required: manualDraft.kind === 'news',
          }]
        : [];
      const words = body.split(/\s+/).filter(Boolean).length;

      const { data, error } = await supabase
        .from('content_items')
        .insert({
          content_type: article || guide ? 'knowledge' : 'news',
          content_subtype: article ? 'article' : guide ? 'guide' : 'general',
          title,
          slug: slugify(title, crypto.randomUUID()),
          excerpt: manualDraft.summary.trim() || makeManualExcerpt(body),
          body,
          tags: commaList(manualDraft.tags),
          crop_tags: commaList(manualDraft.crops),
          source_refs: sourceRefs,
          status: 'draft',
          published_at: null,
          last_scientific_update_at: article || guide ? now : null,
          created_by: auth.user.id,
          updated_by: auth.user.id,
          category: manualDraft.category.trim() || (article ? 'Araştırma' : guide ? 'Bilgi Rehberi' : 'Tarım Gündemi'),
          doi_number: article ? (manualDraft.doi.trim() || null) : null,
          author_text: article ? (manualDraft.author.trim() || null) : null,
          institution_text: article ? (manualDraft.institution.trim() || null) : null,
          reading_time_minutes: Math.max(1, Math.ceil(words / 210)),
          image_search_keyword: manualDraft.imageKeyword.trim() || null,
          coverage_scope: manualDraft.coverageScope,
          country_code: manualDraft.coverageScope === 'turkey' ? 'TR' : null,
          country_name: manualDraft.coverageScope === 'turkey' ? 'Türkiye' : null,
          location_text: manualDraft.locationText.trim() || null,
          event_date: eventDate,
          structured_body: article
            ? {
                problem: null,
                findings: [],
                practical_takeaway: manualDraft.takeaway.trim() || null,
                chart_data: null,
                table_data: null,
              }
            : {},
          image_status: 'missing',
        })
        .select('id')
        .single();
      if (error) throw error;
      createdContentId = data.id;

      if (manualImage) {
        await uploadImageToR2({
          file: manualImage,
          contentId: createdContentId,
          altText: title,
          rightsConfirmed: true,
        });
      } else {
        const { data: coverData, error: coverError } = await supabase.functions.invoke('content-cover-image', {
          body: {
            contentId: createdContentId,
            keyword: manualDraft.imageKeyword.trim() || undefined,
          },
        });
        if (coverError) throw coverError;
        if (coverData?.error) throw new Error(coverData.error);
      }

      const { error: publishError } = await supabase
        .from('content_items')
        .update({
          status: 'published',
          published_at: now,
          updated_at: now,
          updated_by: auth.user.id,
          image_status: 'ready',
        })
        .eq('id', createdContentId);
      if (publishError) throw publishError;

      setMessage(article ? 'Makale doğrudan yayınlandı ve kapağı R2’ye kaydedildi.' : guide ? 'Bilgi Rehberi içeriği yayınlandı ve kapağı R2’ye kaydedildi.' : 'Manuel haber yayınlandı ve kapağı R2’ye kaydedildi.');
      setManualDraft(emptyManualDraft());
      setManualImageFile(null);
      setManualRightsConfirmed(false);
      setActiveTab('published');
      await loadAll();
    } catch (error: any) {
      if (createdContentId) {
        await supabase.from('content_items').delete().eq('id', createdContentId);
      }
      setMessage(error?.message || 'Manuel içerik yayınlanamadı.');
    } finally {
      setWorkingId('');
    }
  };

  const addSource = async () => {
    const name = sourceDraft.name.trim();
    let baseUrl = sourceDraft.baseUrl.trim();
    if (sourceDraft.sourceKind === 'api' && !baseUrl) baseUrl = apiProviderUrl(sourceDraft.apiProvider);
    if (!name || !baseUrl) {
      setMessage('Kaynak adı ve adresi zorunlu.');
      return;
    }

    setWorkingId('__source_add__');
    setMessage('Kaynak ekleniyor…');
    try {
      const metadata: Record<string, unknown> = {
        channel: sourceDraft.channel,
        guide_category: sourceDraft.channel === 'guide' ? sourceDraft.guideCategory : null,
        translation: 'tr',
        coverage_scope: sourceDraft.country.trim().toUpperCase() === 'TR' ? 'turkey' : 'world',
        producer_focus: true,
        priority_theme: 'admin_added',
        content_license: 'review',
      };
      if (sourceDraft.sourceKind === 'api') {
        metadata.api_provider = sourceDraft.apiProvider;
        metadata.query = sourceDraft.query.trim();
      } else if (sourceDraft.sourceKind !== 'rss') {
        metadata.item_selector = 'main a[href], article a[href]';
      }

      const { error } = await supabase.from('content_sources').insert({
        name,
        base_url: baseUrl,
        source_type: sourceDraft.sourceKind,
        language: sourceDraft.language.trim() || 'tr',
        country: sourceDraft.country.trim() || null,
        trust_score: Math.max(1, Math.min(100, Number(sourceDraft.trustScore) || 70)),
        active: true,
        scan_frequency_hours: Math.max(1, Math.min(720, Number(sourceDraft.scanFrequencyHours) || 24)),
        metadata,
      });
      if (error) throw error;
      setSourceDraft(emptySourceDraft());
      setMessage('Yeni kaynak eklendi. İstersen hemen Tara düğmesiyle test edebilirsin.');
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Kaynak eklenemedi.');
    } finally {
      setWorkingId('');
    }
  };

  const reprocessCandidate = async (candidate: Candidate) => {
    setWorkingId(candidate.id);
    setMessage('İçerik kaynak üzerinden yeniden zenginleştiriliyor…');
    try {
      const { data, error } = await supabase.functions.invoke('content-reprocess', {
        body: { candidateId: candidate.id, rewrite: true, forceImage: false },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessage('Metin genişletildi; tarih, konum ve R2 içerik paketi güncellendi.');
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'İçerik yeniden işlenemedi.');
    } finally {
      setWorkingId('');
    }
  };

  const prepareCandidateImages = async (candidate: Candidate) => {
    setWorkingId(candidate.id);
    const guide = isGuideCandidate(candidate);
    setMessage(guide ? 'Rehber için gerçek ve açık lisanslı görseller hazırlanıyor…' : 'Açık lisanslı görsel hazırlanıyor…');
    try {
      const { data, error } = await supabase.functions.invoke('content-image-job', {
        body: {
          candidateId: candidate.id,
          keyword: candidate.image_search_keyword || undefined,
          desiredCount: guide ? 4 : 1,
          minimumCount: guide ? 3 : 1,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      const count = Number(data?.imageCount ?? data?.images?.length ?? 0);
      setMessage(guide
        ? `Rehber görselleri işlendi${count ? ` · ${count} güvenli görsel` : ''}. Kapak + en az 2 destek görseli yayın için zorunlu.`
        : 'Görsel hazırlandı.');
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Görseller hazırlanamadı.');
    } finally {
      setWorkingId('');
    }
  };

  const replacePublishedCover = async (item: ContentItem) => {
    setWorkingId(item.id);
    setMessage('Yeni kapak hazırlanıyor…');
    try {
      const { data, error } = await supabase.functions.invoke('content-cover-image', {
        body: { contentId: item.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setMessage('Yayındaki içeriğin kapağı değiştirildi.');
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Kapak değiştirilemedi.');
    } finally {
      setWorkingId('');
    }
  };

  const publishCandidate = async (candidate: Candidate) => {
    if (workingId) return;
    setWorkingId(candidate.id);
    setMessage('');
    try {
      if (candidate.copyright_status === 'blocked') {
        throw new Error('Telif durumu engelli olan içerik yayınlanamaz.');
      }

      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error('Admin oturumu bulunamadı.');

      const edit = edits[candidate.id] ?? { score: 5, note: '' };
      const now = new Date().toISOString();
      let contentId = candidate.target_content_id;
      const article = isArticleCandidate(candidate);
      const guide = isGuideCandidate(candidate);
      if (candidate.candidate_type === 'news') {
        const firstSource = candidate.source_refs?.[0];
        const sourceLabel =
          typeof firstSource?.source_name === 'string'
            ? firstSource.source_name.trim()
            : '';
        const sourceLink =
          typeof firstSource?.url === 'string'
            ? firstSource.url.trim()
            : '';
        if (!sourceLabel || !/^https?:\/\//i.test(sourceLink)) {
          throw new Error('Haber yayınlanamaz: kaynak adı ve orijinal kaynak bağlantısı zorunlu.');
        }
      }
      if (article) {
        const sourceDateRaw = candidate.source_refs?.[0]?.published_at ?? candidate.event_date;
        const sourceYear = sourceDateRaw ? new Date(String(sourceDateRaw)).getUTCFullYear() : NaN;
        if (!Number.isFinite(sourceYear) || sourceYear < 2010) {
          throw new Error('Makale yayınlanamaz: kaynak yayın yılı 2010 veya sonrası olmalı.');
        }
      }
      if (guide) {
        const imageProgress = guideImageProgress(candidate);
        if (!imageProgress.ready) {
          throw new Error(`Bilgi Rehberi yayınlanamaz: 1 kapak + en az 2 açık lisanslı gerçek fotoğraf gerekli. Şu an ${imageProgress.count}/3 görsel hazır.`);
        }
      }
      const contentType = article || guide ? 'knowledge' : candidate.candidate_type === 'news' ? 'news' : 'knowledge';
      const subtype = article ? 'article' : guide ? 'guide' : candidate.content_subtype || 'general';

      let updateTarget: ContentItem | null = null;
      if (candidate.candidate_type === 'knowledge_update') {
        if (!candidate.target_content_id) throw new Error('Önce güncellenecek kartı seç.');
        const { data: current, error: targetError } = await supabase
          .from('content_items').select('*').eq('id', candidate.target_content_id).single();
        if (targetError) throw targetError;
        validateUpdateTarget(candidate, published.find((item) => item.id === candidate.target_content_id), current);
        updateTarget = current as ContentItem;
      }

      const commonPayload = {
        title: candidate.title_suggested,
        excerpt: candidate.short_summary,
        body: candidate.body_draft || candidate.short_summary || '',
        structured_body: { ...(candidate.structured_body ?? {}), channel: article ? 'article' : guide ? 'guide' : candidate.structured_body?.channel ?? (candidate.candidate_type === 'news' ? 'news' : undefined) },
        category: candidate.suggested_category,
        tags: candidate.suggested_tags ?? [],
        crop_tags: candidate.suggested_crops ?? [],
        source_refs: candidate.source_refs ?? [],
        content_subtype: subtype,
        doi_number: candidate.doi_number,
        author_text: candidate.author_text,
        institution_text: candidate.institution_text,
        reading_time_minutes: candidate.reading_time_minutes,
        image_search_keyword: candidate.image_search_keyword,
        coverage_scope: candidate.coverage_scope || 'turkey',
        country_code: candidate.country_code,
        country_name: candidate.country_name,
        location_text: candidate.location_text,
        event_date: candidate.event_date,
        payload_r2_key: candidate.payload_r2_key,
        payload_public_url: candidate.payload_public_url,
        payload_status: candidate.payload_status,
        image_status: candidate.image_status,
        status: 'published',
        published_at: now,
        updated_by: auth.user.id,
        updated_at: now,
      };

      if (updateTarget) {
        const { error } = await supabase
          .from('content_items')
          .update({
            ...commonPayload,
            published_at: updateTarget.published_at,
            source_refs: [...(updateTarget.source_refs ?? []), ...(candidate.source_refs ?? [])]
              .filter((ref, index, all) => all.findIndex((other) => JSON.stringify(other) === JSON.stringify(ref)) === index),
            last_scientific_update_at: now,
          })
          .eq('id', updateTarget.id)
          .eq('updated_at', updateTarget.updated_at)
          .eq('status', 'published')
          .select('id')
          .single();
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('content_items')
          .insert({
            ...commonPayload,
            content_type: contentType,
            slug: slugify(candidate.title_suggested, candidate.id),
            created_from_candidate_id: candidate.id,
            last_scientific_update_at: article || candidate.candidate_type !== 'news' ? now : null,
            created_by: auth.user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        contentId = data.id;
      }

      const { error: candidateError } = await supabase
        .from('content_candidates')
        .update({
          workflow_status: 'approved',
          candidate_type: candidate.candidate_type,
          content_subtype: subtype,
          structured_body: {
            ...(candidate.structured_body ?? {}),
            channel: article ? 'article' : guide ? 'guide' : candidate.structured_body?.channel ?? (candidate.candidate_type === 'news' ? 'news' : undefined),
          },
          target_content_id: contentId,
          reviewed_at: now,
          reviewed_by: auth.user.id,
          admin_score: edit.score,
          admin_note: edit.note || null,
        })
        .eq('id', candidate.id);
      if (candidateError) throw candidateError;

      await supabase.from('content_feedback').insert({
        candidate_id: candidate.id,
        content_id: contentId,
        score: edit.score,
        feedback_note: edit.note || null,
        created_by: auth.user.id,
      });

      const candidateImages = images.filter((image) => image.candidate_id === candidate.id);
      if (candidateImages.length && contentId) {
        const safeImageIds = candidateImages
          .filter((image) => image.license_type && SAFE_IMAGE_LICENSES.has(image.license_type.toLowerCase()))
          .map((image) => image.id);
        if (safeImageIds.length) {
          await supabase
            .from('content_images')
            .update({ content_id: contentId, status: 'approved' })
            .in('id', safeImageIds);
        }
      }

      if (contentId) {
        try {
          await supabase.functions.invoke('content-reprocess', {
            body: { contentId, rewrite: false, forceImage: false },
          });
        } catch {
          // Yayın başarıyla oluştuysa R2 public URL yenileme hatası yayını geri almaz.
        }
      }

      await loadAll();
      setMessage(updateTarget ? 'Mevcut bilgi kartı güncellendi; yeni kopya oluşturulmadı.' : article ? 'Ar-Ge makalesi onaylandı ve yayınlandı.' : guide ? 'Bilgi Rehberi içeriği admin onayıyla yayınlandı.' : 'İçerik onaylandı ve yayınlandı.');
    } catch (error: any) {
      setMessage(error?.message || 'Yayınlama tamamlanamadı.');
    } finally {
      setWorkingId('');
    }
  };

  const removePublished = async (item: ContentItem) => {
    setWorkingId(item.id);
    setMessage('');
    try {
      const { error } = await supabase
        .from('content_items')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      setMessage('İçerik yayından kaldırıldı.');
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'İçerik yayından kaldırılamadı.');
    } finally {
      setWorkingId('');
    }
  };

  const toggleSource = async (source: ContentSource) => {
    setWorkingId(source.id);
    setMessage('');
    try {
      const { error } = await supabase
        .from('content_sources')
        .update({ active: !source.active, updated_at: new Date().toISOString() })
        .eq('id', source.id);
      if (error) throw error;
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Kaynak durumu değiştirilemedi.');
    } finally {
      setWorkingId('');
    }
  };

  const invokeContentScan = async (functionName: string, body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke(functionName, { body });
    if (error) throw error;
    if (data?.error) throw new Error(String(data.error));
    return data;
  };

  const sourceScanConfig = (source: ContentSource) => {
    const channel = String(source.metadata?.channel || (source.source_type === 'api' ? 'article' : 'news'));
    const articleSource = channel === 'article';
    const guideSource = channel === 'guide';
    const functionName = guideSource
      ? 'knowledge-content-scan'
      : articleSource
        ? 'research-content-scan'
        : 'content-engine-scan';
    const body = articleSource
      ? { sourceId: source.id, limit: 6 }
      : guideSource
        ? { sourceId: source.id, limit: 6, guideCategory: source.metadata?.guide_category || null }
        : { sourceId: source.id, maxSources: 1, maxItemsPerSource: 5 };
    return { channel, articleSource, guideSource, functionName, body };
  };

  const scanSource = async (source: ContentSource) => {
    const config = sourceScanConfig(source);
    setWorkingId(source.id);
    setMessage(`${source.name} taranıyor…`);

    try {
      const data = await invokeContentScan(config.functionName, config.body);
      const created = Number(data?.candidatesCreated ?? 0);
      const upgraded = Number(data?.candidatesUpgraded ?? 0);
      const rejected = Number(data?.lowQualityRejected ?? 0);
      const engine = String(data?.engine || config.functionName).trim();

      if (config.guideSource) {
        const d = guideScanDiagnostics(data);
        const sample = d.samples[0];
        const sampleText = sample
          ? ` · İlk red: ${String(sample.title || sample.url || 'İsimsiz')} → ${String(sample.reason || sample.stage || 'sebep yok')}`
          : '';
        setMessage(
          `${source.name} tarandı · ${engine}. ${created} yeni, ${upgraded} güncellendi. ${diagnosticSummary(d)}${sampleText}`,
        );
      } else {
        setMessage(`${source.name} tarandı · ${engine}. ${created} yeni aday kuyruğa eklendi.`);
      }
      await loadAll();
    } catch (error: any) {
      console.error('[TarlaPusula content scan]', config.functionName, source.name, error);
      setMessage(error?.message || 'Kaynak taranamadı.');
    } finally {
      setWorkingId('');
    }
  };

  const deleteSource = async (source: ContentSource) => {
    const confirmed = window.confirm(`“${source.name}” kaynağını silmek istiyor musun?\n\nBu işlem yalnız kaynak kaydını siler; daha önce yayınlanmış içeriklere dokunmaz.`);
    if (!confirmed) return;

    setWorkingId(`delete:${source.id}`);
    setMessage(`${source.name} siliniyor…`);
    try {
      const { error } = await supabase.from('content_sources').delete().eq('id', source.id);
      if (error) throw error;
      setMessage(`${source.name} kaynak listesinden silindi.`);
      await loadAll();
    } catch (error: any) {
      setMessage(error?.message || 'Kaynak silinemedi.');
    } finally {
      setWorkingId('');
    }
  };

  const guideScanDiagnostics = (data: any) => {
    const report = Array.isArray(data?.report) ? data.report : [];
    const qualified = report.reduce((sum: number, row: any) => sum + Number(row?.qualified ?? 0), 0);
    const created = Number(data?.candidatesCreated ?? report.reduce((sum: number, row: any) => sum + Number(row?.created ?? 0), 0));
    const reprocessed = Number(data?.reprocessed ?? report.reduce((sum: number, row: any) => sum + Number(row?.reprocessed ?? 0), 0));
    const held = Number(data?.held ?? report.reduce((sum: number, row: any) => sum + Number(row?.held ?? 0), 0));
    const duplicates = Number(data?.duplicates ?? report.reduce((sum: number, row: any) => sum + Number(row?.duplicates ?? 0), 0));
    const activeCrops = Array.isArray(data?.activeCrops) ? data.activeCrops : [];
    const samples = report.flatMap((row: any) => Array.isArray(row?.errors) ? row.errors.map((error: string) => ({ title: row?.source, reason: error, stage: 'source' })) : []).slice(0, 8);

    return { qualified, created, reprocessed, held, duplicates, activeCrops, samples };
  };

  const diagnosticSummary = (d: ReturnType<typeof guideScanDiagnostics>) =>
    `Uygun sayfa ${d.qualified} · Yeni ${d.created} · Türkçe/işleme hazır ${d.reprocessed} · İşleme bekliyor ${d.held} · Duplicate ${d.duplicates} · Aktif ürün ${d.activeCrops.length}`;

  const scanSourceGroup = async (channel: SourceChannel) => {
    const groupSources = sources.filter((source) => {
      const sourceChannel = String(source.metadata?.channel || (source.source_type === 'api' ? 'article' : 'news'));
      return source.active && sourceChannel === channel;
    });
    if (!groupSources.length) {
      setMessage('Bu grupta taranacak aktif kaynak yok.');
      return;
    }

    const groupKey = `__group:${channel}`;
    const groupName = channel === 'news' ? 'Haber' : channel === 'article' ? 'Makale' : 'Bilgi Rehberi';
    setWorkingId(groupKey);
    let createdTotal = 0;
    let upgradedTotal = 0;
    let rejectedTotal = 0;
    let guideQualifiedTotal = 0;
    let guideReprocessedTotal = 0;
    let guideHeldTotal = 0;
    let duplicateTotal = 0;
    let activeCropCount = 0;
    const rejectionSamples: any[] = [];
    const failures: string[] = [];

    try {
      for (let index = 0; index < groupSources.length; index += 1) {
        const source = groupSources[index];
        const config = sourceScanConfig(source);
        setMessage(`${groupName}: ${index + 1}/${groupSources.length} · ${source.name} taranıyor…`);
        try {
          const data = await invokeContentScan(config.functionName, config.body);
          createdTotal += Number(data?.candidatesCreated ?? 0);
          upgradedTotal += Number(data?.candidatesUpgraded ?? 0);
          rejectedTotal += Number(data?.lowQualityRejected ?? 0);
          if (channel === 'guide') {
            const d = guideScanDiagnostics(data);
            guideQualifiedTotal += d.qualified;
            guideReprocessedTotal += d.reprocessed;
            guideHeldTotal += d.held;
            duplicateTotal += d.duplicates;
            activeCropCount = Math.max(activeCropCount, d.activeCrops.length);
            for (const sample of d.samples) {
              if (rejectionSamples.length >= 8) break;
              rejectionSamples.push(sample);
            }
          }
        } catch (error: any) {
          failures.push(`${source.name}: ${String(error?.message || 'bilinmeyen hata')}`);
        }
      }
      await loadAll();
      if (channel === 'guide') {
        const first = rejectionSamples[0];
        const firstText = first
          ? ` İlk red: ${String(first.title || first.url || 'İsimsiz')} → ${String(first.reason || first.stage || 'sebep yok')}.`
          : '';
        setMessage(
          `${groupName} taraması bitti. ${createdTotal} yeni, ${upgradedTotal} güncellendi. ` +
          `Uygun sayfa ${guideQualifiedTotal} · Türkçe/işleme hazır ${guideReprocessedTotal} · ` +
          `İşleme bekliyor ${guideHeldTotal} · Duplicate ${duplicateTotal} · Aktif ürün ${activeCropCount}.` +
          firstText +
          (failures.length ? ` ${failures.length} kaynak hata verdi: ${failures.slice(0, 2).join(' | ')}` : ` ${groupSources.length} kaynak başarıyla tarandı.`),
        );
      } else {
        setMessage(
          `${groupName} taraması bitti. ${createdTotal} yeni, ${upgradedTotal} güncellendi, ${rejectedTotal} elendi.` +
          (failures.length ? ` ${failures.length} kaynak hata verdi: ${failures.slice(0, 2).join(' | ')}` : ` ${groupSources.length} kaynak başarıyla tarandı.`),
        );
      }
    } finally {
      setWorkingId('');
    }
  };

  const scanAllResearch = async () => {
    const activeSources = sources.filter((source) => source.active);
    if (!activeSources.length) {
      setMessage('Taranacak aktif kaynak yok.');
      return;
    }

    setWorkingId('__research__');
    setMessage(`${activeSources.length} aktif kaynak sırayla taranıyor…`);

    let createdTotal = 0;
    let upgradedTotal = 0;
    let rejectedTotal = 0;
    const failures: string[] = [];

    try {
      for (let index = 0; index < activeSources.length; index += 1) {
        const source = activeSources[index];
        const config = sourceScanConfig(source);
        setMessage(`${index + 1}/${activeSources.length} · ${source.name} taranıyor…`);

        try {
          const data = await invokeContentScan(config.functionName, config.body);
          createdTotal += Number(data?.candidatesCreated ?? 0);
          upgradedTotal += Number(data?.candidatesUpgraded ?? 0);
          rejectedTotal += Number(data?.lowQualityRejected ?? 0);
        } catch (error: any) {
          const detail = String(error?.message || 'bilinmeyen hata');
          failures.push(`${source.name}: ${detail}`);
          console.error('[TarlaPusula full content scan]', source.name, error);
        }
      }

      await loadAll();
      setMessage(
        failures.length
          ? `Tam tarama bitti. ${createdTotal} yeni, ${upgradedTotal} güncellendi, ${rejectedTotal} düşük kalite elendi. ${failures.length} kaynak hata verdi: ${failures.slice(0, 3).join(' | ')}`
          : `Tam tarama bitti. ${createdTotal} yeni, ${upgradedTotal} güncellendi, ${rejectedTotal} düşük kalite elendi. ${activeSources.length} kaynak başarıyla tarandı.`,
      );
    } finally {
      setWorkingId('');
    }
  };

  return (
    <section className="tp-content-admin">
      <header className="tp-content-admin__head">
        <div>
          <span>ADMIN · OTOMATİK İÇERİK MOTORU</span>
          <h2>İçerik Merkezi</h2>
          <p>Motor bulur, Türkçeleştirir ve taslak hazırlar. Yayına yalnız admin çıkarır.</p>
        </div>
        <div className="tp-content-admin__head-actions">
          <button type="button" onClick={() => setActiveTab('manual')}>
            <Plus size={15} /> Yeni içerik
          </button>
          <button type="button" onClick={() => void loadAll()} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'spin' : ''} /> Yenile
          </button>
        </div>
      </header>

      <div className="tp-content-admin__stats">
        <article><strong>{candidates.length}</strong><span>Onay bekleyen</span></article>
        <article><strong>{candidates.filter((item) => isArticleCandidate(item)).length}</strong><span>Ar-Ge adayı</span></article>
        <article><strong>{published.filter((item) => item.status === 'published').length}</strong><span>Yayında</span></article>
        <article><strong>{sources.filter((item) => item.active).length}</strong><span>Aktif kaynak</span></article>
      </div>

      <nav className="tp-content-admin__tabs">
        <button className={activeTab === 'queue' ? 'active' : ''} type="button" onClick={() => setActiveTab('queue')}>Onay Bekleyenler</button>
        <button className={activeTab === 'published' ? 'active' : ''} type="button" onClick={() => setActiveTab('published')}>Yayınlananlar</button>
        <button className={activeTab === 'manual' ? 'active' : ''} type="button" onClick={() => setActiveTab('manual')}>Yeni Haber / Makale</button>
        <button className={activeTab === 'pdf' ? 'active' : ''} type="button" onClick={() => setActiveTab('pdf')}><Upload size={14} /> PDF'den İçerik</button>
        <button className={activeTab === 'sources' ? 'active' : ''} type="button" onClick={() => setActiveTab('sources')}>Kaynaklar</button>
        <button className={activeTab === 'coverage' ? 'active' : ''} type="button" onClick={() => setActiveTab('coverage')}>İçerik Boşlukları</button>
      </nav>

      {message ? <div className="tp-content-admin__message">{message}</div> : null}

      {coverageFilter && activeTab === coverageFilter.list ? (
        <div className="tp-content-coverage-filter">
          <span>İçerik boşlukları: {coverageFilter.label}</span>
          <button type="button" onClick={() => setCoverageFilter(null)}>Filtreyi kaldır</button>
          <button type="button" onClick={() => setActiveTab('coverage')}>Boşluk analizine dön</button>
        </div>
      ) : null}

      {activeTab === 'pdf' ? (
        <KnowledgeAdminPanel />
      ) : null}

      {activeTab === 'coverage' ? (
        <ContentCoveragePanel
          publications={published}
          candidates={candidates}
          ready={coverageReady}
          loading={loading}
          onOpen={(list, ids, label) => {
            setCoverageFilter({ list, ids, label });
            setQueueFilter('all');
            setSearchText('');
            setActiveTab(list);
          }}
          onDraft={(topic, crop) => {
            const hasDraft = Boolean(manualImage) || Object.entries(manualDraft).some(([key, value]) =>
              !['kind', 'coverageScope', 'eventDate'].includes(key) && value.trim(),
            );
            if (hasDraft) {
              setMessage('Yeni içerik bölümünde mevcut bir taslak var. Önce onu tamamla; üzerine yazılmadı.');
              setActiveTab('manual');
              return;
            }
            setManualDraft({ ...emptyManualDraft(), kind: 'guide', title: `${crop ? `${crop} · ` : ''}${topic.label}`, category: topic.label, crops: crop, tags: topic.label });
            setCoverageFilter(null);
            setMessage('Rehber taslağı açıldı. Metni ve kaynağını tamamlayıp inceleyerek yayınlayabilirsin.');
            setActiveTab('manual');
          }}
        />
      ) : null}

      {activeTab === 'queue' ? (
        <>
          <div className="tp-content-admin__toolbar">
            <div className="tp-content-admin__filters">
              <button type="button" className={queueFilter === 'all' ? 'active' : ''} onClick={() => setQueueFilter('all')}>Tümü</button>
              <button type="button" className={queueFilter === 'news' ? 'active' : ''} onClick={() => setQueueFilter('news')}><Newspaper size={14} /> Haber</button>
              <button type="button" className={queueFilter === 'article' ? 'active' : ''} onClick={() => setQueueFilter('article')}><BookOpen size={14} /> Makale</button>
              <button type="button" className={queueFilter === 'guide' ? 'active' : ''} onClick={() => setQueueFilter('guide')}><BookOpen size={14} /> Bilgi Rehberi</button>
            </div>
            <label className="tp-content-admin__search">
              <Search size={15} />
              <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Başlık veya kaynak ara" />
            </label>
          </div>

          {!queue.length ? <div className="tp-content-admin__empty">Bu filtrede onay bekleyen içerik yok.</div> : null}
          <div className="tp-content-admin__queue">
            {queue.map((candidate) => {
              const cover = imageForCandidate(candidate.id);
              const busy = Boolean(workingId);
              const article = isArticleCandidate(candidate);
              const guide = isGuideCandidate(candidate);
              const guideImages = guide ? guideImageProgress(candidate) : null;
              const hasSelection = Object.prototype.hasOwnProperty.call(updateTargets, candidate.id);
              const publicationCandidate: Candidate = hasSelection ? {
                ...candidate,
                candidate_type: updateTargets[candidate.id] ? 'knowledge_update' : 'knowledge_new',
                target_content_id: updateTargets[candidate.id],
              } : candidate;
              const missingUpdateTarget = publicationCandidate.candidate_type === 'knowledge_update' &&
                (!publicationCandidate.target_content_id || !published.some((item) => item.id === publicationCandidate.target_content_id));
              return (
                <article key={candidate.id} className={`tp-content-admin-card ${article ? 'article' : guide ? 'guide' : ''}`}>
                  <div className="tp-content-admin-card__media">
                    {cover?.public_url || cover?.original_url ? (
                      <img src={cover.public_url || cover.original_url || ''} alt="" />
                    ) : (
                      <div><ImageIcon size={24} /><span>Kapak yok</span></div>
                    )}
                    <small>{cover?.license_type ? `Lisans: ${cover.license_type}` : 'Görsel incelemesi gerekli'}</small>
                  </div>

                  <div className="tp-content-admin-card__body">
                    <div className="tp-content-admin-card__eyebrow">
                      <span>{article || guide ? <BookOpen size={13} /> : <Newspaper size={13} />}{typeLabel(candidate)}</span>
                      <span>{candidate.suggested_category || 'Genel'}</span>
                      <span>Güven {candidate.trust_score ?? '—'}</span>
                      <span>İlgi {candidate.relevance_score ?? '—'}</span>
                    </div>
                    <div className="tp-content-admin-card__scope">
                      <span>{candidate.coverage_scope === 'world' ? 'Dünyada Tarım' : 'Ülkemizde Tarım'}</span>
                      {candidate.location_text ? <span>{candidate.location_text}</span> : null}
                      {candidate.event_date ? <span>{fmtDate(candidate.event_date)}</span> : null}
                      <span>R2 {candidate.payload_status || 'missing'}</span>
                      <span>{guide ? `Görseller ${guideImages?.count ?? 0}/3${guideImages?.ready ? ' · hazır' : ' · eksik'}` : `Görsel ${candidate.image_status || (cover ? 'ready' : 'missing')}`}</span>
                    </div>
                    <h3>{candidate.title_suggested}</h3>
                    <p>{candidate.short_summary || candidate.body_draft || 'Özet yok.'}</p>

                    {guide ? (
                      <div className="tp-content-admin-card__scope">
                        {candidate.structured_body?.topic ? <span>Konu: {candidate.structured_body.topic}</span> : null}
                        {(candidate.suggested_crops ?? candidate.structured_body?.crop_matches ?? []).slice(0, 5).map((crop) => <span key={crop}>Ürün: {crop}</span>)}
                        {candidate.structured_body?.user_crop_match_count != null ? <span>Kullanıcı eşleşmesi: {candidate.structured_body.user_crop_match_count}</span> : null}
                        {candidate.structured_body?.crop_priority != null ? <span>Ürün önceliği: {candidate.structured_body.crop_priority}</span> : null}
                        {candidate.structured_body?.producer_practicality_score != null ? <span>Saha skoru: {candidate.structured_body.producer_practicality_score}</span> : null}
                      </div>
                    ) : null}

                    {guide && guideImages?.safe.length ? (
                      <div className="tp-content-admin-card__gallery" aria-label="Rehber görselleri">
                        {guideImages.safe.slice(0, 4).map((image) => (
                          <img key={image.id} src={image.public_url || image.original_url || ''} alt="" title={image.license_type || ''} />
                        ))}
                      </div>
                    ) : null}

                    {article && candidate.structured_body?.findings?.length ? (
                      <ul className="tp-content-admin-card__findings">
                        {candidate.structured_body.findings.slice(0, 3).map((finding, index) => <li key={index}>{finding}</li>)}
                      </ul>
                    ) : null}

                    <div className="tp-content-admin-card__source">
                      <strong>{sourceName(candidate)}</strong>
                      {candidate.doi_number ? <span>DOI: {candidate.doi_number}</span> : null}
                      {sourceUrl(candidate) ? <a href={sourceUrl(candidate)} target="_blank" rel="noreferrer">Kaynak <ExternalLink size={12} /></a> : null}
                    </div>

                    <KnowledgeUpdateSuggestions
                      candidate={publicationCandidate}
                      suggestions={updateSuggestions.get(candidate.id) ?? []}
                      targets={published}
                      busy={busy}
                      onSelect={(id) => setUpdateTargets((current) => ({ ...current, [candidate.id]: id }))}
                    />

                    <div className="tp-content-admin-card__review">
                      <label>
                        Admin puanı
                        <select
                          value={edits[candidate.id]?.score ?? 5}
                          onChange={(event) => setCandidateEdit(candidate.id, { score: Number(event.target.value) })}
                        >
                          {[5, 4, 3, 2, 1].map((score) => <option key={score} value={score}>{score}/5</option>)}
                        </select>
                      </label>
                      <label className="note">
                        Not
                        <input
                          value={edits[candidate.id]?.note ?? ''}
                          onChange={(event) => setCandidateEdit(candidate.id, { note: event.target.value })}
                          placeholder="İsteğe bağlı admin notu"
                        />
                      </label>
                    </div>

                    <div className="tp-content-admin-card__actions">
                      <button type="button" className="secondary" onClick={() => openEditor(candidate)} disabled={busy}><Pencil size={14} /> Düzenle</button>
                      <button type="button" className="secondary" onClick={() => void reprocessCandidate(candidate)} disabled={busy}><RefreshCw size={14} /> Metni Genişlet</button>
                      <button type="button" className="secondary" onClick={() => void prepareCandidateImages(candidate)} disabled={busy}><ImageIcon size={14} /> {guide ? 'Görselleri Hazırla' : 'Otomatik Görsel'}</button>
                      <label className={`tp-content-upload-button secondary ${busy ? 'disabled' : ''}`}>
                        <Upload size={14} /> Fotoğraf Yükle
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          disabled={busy}
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            event.currentTarget.value = '';
                            if (file) void uploadCoverFile({ file, candidateId: candidate.id, busyId: candidate.id, title: candidate.title_suggested });
                          }}
                        />
                      </label>
                      <button type="button" className="secondary" onClick={() => void reviewCandidate(candidate, 'held')} disabled={busy}>Beklet</button>
                      <button type="button" className="danger" onClick={() => void reviewCandidate(candidate, 'rejected')} disabled={busy}><X size={14} /> Reddet</button>
                      <button type="button" className="primary" onClick={() => void publishCandidate(publicationCandidate)} disabled={busy || missingUpdateTarget || candidate.copyright_status === 'blocked' || Boolean(guide && !guideImages?.ready)}><Check size={14} /> {publicationCandidate.candidate_type === 'knowledge_update' ? 'Onayla ve Güncelle' : 'Onayla ve Yayınla'}</button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : null}

      {activeTab === 'published' ? (
        <div className="tp-content-admin__published">
          {published.filter((item) => coverageFilter?.list !== 'published' || coverageFilter.ids.includes(item.id)).map((item) => {
            const cover = imageForContent(item.id);
            const article = item.content_subtype === 'article';
            return (
              <article key={item.id}>
                <div className="tp-content-admin-published__thumb">
                  {cover?.public_url || cover?.original_url ? <img src={cover.public_url || cover.original_url || ''} alt="" /> : <ImageIcon size={20} />}
                </div>
                <div className="tp-content-admin-published__copy">
                  <span>{article ? 'AR-GE' : item.content_type === 'news' ? 'HABER' : 'BİLGİ'} · {item.status}</span>
                  <strong>{item.title}</strong>
                  <small>{fmtDate(item.published_at)} · {item.views_count || 0} okuma{article ? ` · ${ratingNumber(item.average_rating).toFixed(1)}/5 (${item.rating_count || 0})` : ''}</small>
                </div>
                <div className="tp-content-admin-published__actions">
                  <button type="button" onClick={() => void replacePublishedCover(item)} disabled={workingId === item.id}><ImageIcon size={14} /> Otomatik Kapak</button>
                  <label className={`tp-content-upload-button ${workingId === item.id ? 'disabled' : ''}`}>
                    <Upload size={14} /> Fotoğraf Yükle
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      disabled={workingId === item.id}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        event.currentTarget.value = '';
                        if (file) void uploadCoverFile({ file, contentId: item.id, busyId: item.id, title: item.title });
                      }}
                    />
                  </label>
                  {item.status === 'published' ? (
                    <button className="danger" type="button" onClick={() => void removePublished(item)} disabled={workingId === item.id}><Trash2 size={14} /> Kaldır</button>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}

      {activeTab === 'manual' ? (
        <div className="tp-content-admin-manual">
          <div className="tp-content-admin-form-card">
            <div className="tp-content-admin-form-card__head">
              <div>
                <span>ADMİN DOĞRUDAN YAYIN</span>
                <h3>Manuel haber / makale / bilgi rehberi oluştur</h3>
                <p>Metni sen gir. Fotoğraf yüklersen R2’ye kaydedilir; yüklemezsen açık lisanslı kapak otomatik hazırlanır.</p>
              </div>
            </div>

            <div className="tp-content-admin-form-grid">
              <label>İçerik türü
                <select value={manualDraft.kind} onChange={(event) => { const kind = event.target.value; setManualDraft({ ...manualDraft, kind: kind === 'article' ? 'article' : kind === 'guide' ? 'guide' : 'news' }); }}>
                  <option value="news">Haber</option>
                  <option value="article">Makale</option>
                  <option value="guide">Bilgi Rehberi</option>
                </select>
              </label>
              <label>Yayın alanı
                <select value={manualDraft.coverageScope} onChange={(event) => setManualDraft({ ...manualDraft, coverageScope: event.target.value === 'world' ? 'world' : 'turkey' })}>
                  <option value="turkey">Ülkemizde Tarım</option>
                  <option value="world">Dünyada Tarım</option>
                </select>
              </label>
              <label className="wide">Başlık
                <input value={manualDraft.title} onChange={(event) => setManualDraft({ ...manualDraft, title: event.target.value })} placeholder="Üreticinin anlayacağı net bir başlık" />
              </label>
              <label className="wide">Kısa özet
                <textarea rows={3} value={manualDraft.summary} onChange={(event) => setManualDraft({ ...manualDraft, summary: event.target.value })} placeholder="Kartta görünecek kısa özet" />
              </label>
              <label>Kategori
                <input value={manualDraft.category} onChange={(event) => setManualDraft({ ...manualDraft, category: event.target.value })} placeholder="Sulama, Bitki Sağlığı, Destek…" />
              </label>
              <label>Tarih
                <input type="date" value={manualDraft.eventDate} onChange={(event) => setManualDraft({ ...manualDraft, eventDate: event.target.value })} />
              </label>
              <label className="wide">Yer
                <input value={manualDraft.locationText} onChange={(event) => setManualDraft({ ...manualDraft, locationText: event.target.value })} placeholder="Örn. Konya / Türkiye / Dünya" />
              </label>

              {manualDraft.kind === 'article' ? (
                <>
                  <label>Yazar
                    <input value={manualDraft.author} onChange={(event) => setManualDraft({ ...manualDraft, author: event.target.value })} />
                  </label>
                  <label>Kurum / Dergi
                    <input value={manualDraft.institution} onChange={(event) => setManualDraft({ ...manualDraft, institution: event.target.value })} />
                  </label>
                  <label>DOI
                    <input value={manualDraft.doi} onChange={(event) => setManualDraft({ ...manualDraft, doi: event.target.value })} />
                  </label>
                  <label>Üreticiye pratik sonuç
                    <input value={manualDraft.takeaway} onChange={(event) => setManualDraft({ ...manualDraft, takeaway: event.target.value })} />
                  </label>
                </>
              ) : null}

              <label className="wide">İçerik
                <textarea rows={12} value={manualDraft.body} onChange={(event) => setManualDraft({ ...manualDraft, body: event.target.value })} placeholder="Haber veya makalenin Türkçe metni" />
              </label>
              <label>Etiketler
                <input value={manualDraft.tags} onChange={(event) => setManualDraft({ ...manualDraft, tags: event.target.value })} placeholder="virgülle ayır" />
              </label>
              <label>Ürünler
                <input value={manualDraft.crops} onChange={(event) => setManualDraft({ ...manualDraft, crops: event.target.value })} placeholder="buğday, mısır…" />
              </label>
              <label>Kaynak adı
                <input value={manualDraft.sourceName} onChange={(event) => setManualDraft({ ...manualDraft, sourceName: event.target.value })} placeholder="İsteğe bağlı" />
              </label>
              <label>Kaynak bağlantısı
                <input value={manualDraft.sourceUrl} onChange={(event) => setManualDraft({ ...manualDraft, sourceUrl: event.target.value })} placeholder="https://…" />
              </label>
              <label className="wide">Otomatik görsel arama kelimesi
                <input value={manualDraft.imageKeyword} onChange={(event) => setManualDraft({ ...manualDraft, imageKeyword: event.target.value })} placeholder="Görsel yüklemezsen kullanılır. Örn. wheat field" />
              </label>
            </div>

            <div className="tp-content-admin-manual__image">
              <label className="tp-content-manual-file">
                <Upload size={16} />
                <span>{manualImage ? manualImage.name : 'JPG / PNG / WebP fotoğraf seç'}</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setManualImageFile(event.target.files?.[0] || null)} />
              </label>
              {manualImagePreview ? <img src={manualImagePreview} alt="Yüklenecek kapak önizlemesi" /> : <div><ImageIcon size={28} /><span>Fotoğraf seçmezsen sistem otomatik kapak arar.</span></div>}
              {manualImage ? (
                <label className="tp-content-admin-rights">
                  <input type="checkbox" checked={manualRightsConfirmed} onChange={(event) => setManualRightsConfirmed(event.target.checked)} />
                  <span>Bu görseli TarlaPusula’da yayınlama / kullanma hakkına sahibim.</span>
                </label>
              ) : null}
            </div>

            <div className="tp-content-admin-form-actions">
              <button type="button" className="secondary" onClick={() => { setManualDraft(emptyManualDraft()); setManualImageFile(null); setManualRightsConfirmed(false); }}>Temizle</button>
              <button type="button" className="primary" onClick={() => void publishManualContent()} disabled={workingId === '__manual__'}>
                <Check size={15} /> {manualDraft.kind === 'article' ? 'Makaleyi Yayınla' : manualDraft.kind === 'guide' ? 'Rehberi Yayınla' : 'Haberi Yayınla'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'sources' ? (
        <div className="tp-content-admin__sources-wrap">
          <div className="tp-source-channel-tabs" role="tablist" aria-label="Kaynak türleri">
            {([
              ['news', 'Haber Kaynakları'],
              ['article', 'Makale Kaynakları'],
              ['guide', 'Bilgi Rehberi Kaynakları'],
            ] as Array<[SourceChannel, string]>).map(([channel, label]) => (
              <button
                key={channel}
                type="button"
                className={sourceChannelTab === channel ? 'active' : ''}
                onClick={() => {
                  setSourceChannelTab(channel);
                  setSourceDraft((current) => ({ ...current, channel }));
                }}
              >
                {label}
                <span>{sources.filter((source) => String(source.metadata?.channel || (source.source_type === 'api' ? 'article' : 'news')) === channel).length}</span>
              </button>
            ))}
          </div>

          <div className="tp-source-channel-toolbar">
            <div>
              <strong>{sourceChannelTab === 'news' ? 'Haber Kaynakları' : sourceChannelTab === 'article' ? 'Makale Kaynakları' : 'Bilgi Rehberi Kaynakları'}</strong>
              <small>
                {sourceChannelTab === 'news'
                  ? 'Güncel tarım haberleri ve piyasa gelişmeleri kendi haber motoruyla taranır.'
                  : sourceChannelTab === 'article'
                    ? 'Bilimsel yayınlar akademik araştırma motoruyla taranır.'
                    : 'Üreticiye dönük teknik rehberler knowledge-v3 kalite filtresiyle taranır.'}
              </small>
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => void scanSourceGroup(sourceChannelTab)}
              disabled={workingId === `__group:${sourceChannelTab}`}
            >
              <RefreshCw size={14} className={workingId === `__group:${sourceChannelTab}` ? 'spin' : ''} />
              {sourceChannelTab === 'news' ? 'Haber Kaynaklarını Tara' : sourceChannelTab === 'article' ? 'Makale Kaynaklarını Tara' : 'Rehber Kaynaklarını Tara'}
            </button>
          </div>

          <div className="tp-content-admin__sources tp-source-channel-list">
            {sources
              .filter((source) => String(source.metadata?.channel || (source.source_type === 'api' ? 'article' : 'news')) === sourceChannelTab)
              .map((source) => (
                <article key={source.id}>
                  <div>
                    <span>{source.language.toUpperCase()} · {source.source_type.toUpperCase()} · Güven {source.trust_score}</span>
                    <strong>{source.name}</strong>
                    <small>{source.base_url}</small>
                    <small>Son tarama: {fmtDate(source.last_scanned_at)} · {source.scan_frequency_hours} saatte bir</small>
                  </div>
                  <div className="tp-content-admin-source__actions">
                    <button type="button" onClick={() => void scanSource(source)} disabled={workingId === source.id || !source.active}>
                      <RefreshCw size={14} className={workingId === source.id ? 'spin' : ''} /> Tara
                    </button>
                    <button type="button" className={source.active ? 'active-source' : ''} onClick={() => void toggleSource(source)} disabled={workingId === source.id}>
                      {source.active ? 'Aktif' : 'Kapalı'}
                    </button>
                    <button type="button" className="danger-source" onClick={() => void deleteSource(source)} disabled={workingId === `delete:${source.id}`}>
                      <Trash2 size={14} /> Sil
                    </button>
                  </div>
                </article>
              ))}
          </div>

          <details className="tp-content-admin-form-card tp-content-admin-source-form tp-source-add-details">
            <summary><Plus size={15} /> Yeni {sourceChannelTab === 'news' ? 'haber' : sourceChannelTab === 'article' ? 'makale' : 'bilgi rehberi'} kaynağı ekle</summary>
            <div className="tp-source-add-body">
              <div className="tp-content-admin-form-grid">
                <label>Kaynak adı<input value={sourceDraft.name} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, name: event.target.value })} /></label>
                <label>Tür
                  <select value={sourceDraft.sourceKind} onChange={(event) => {
                    const sourceKind = event.target.value as SourceDraft['sourceKind'];
                    setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, sourceKind, baseUrl: sourceKind === 'api' ? apiProviderUrl(sourceDraft.apiProvider) : sourceDraft.baseUrl });
                  }}>
                    <option value="html">HTML / Web</option><option value="rss">RSS</option><option value="official">Resmi kurum</option><option value="api">Akademik API</option>
                  </select>
                </label>
                {sourceChannelTab === 'guide' ? <label>Bilgi kategorisi<select value={sourceDraft.guideCategory} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: 'guide', guideCategory: event.target.value as SourceDraft['guideCategory'] })}><option value="growing">Yetiştiricilik</option><option value="disease">Hastalık</option><option value="pest">Zararlı</option><option value="weed">Yabancı Ot</option><option value="nutrition">Besin Eksikliği</option><option value="irrigation">Sulama</option><option value="fertilization">Gübreleme</option><option value="soil">Toprak</option><option value="harvest_storage">Hasat / Depolama</option></select></label> : null}
                <label className="wide">Kaynak / API adresi<input value={sourceDraft.baseUrl} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, baseUrl: event.target.value })} placeholder="https://…" /></label>
                <label>Dil<input value={sourceDraft.language} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, language: event.target.value })} placeholder="tr / en" /></label>
                <label>Ülke<input value={sourceDraft.country} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, country: event.target.value })} placeholder="TR / US / boş" /></label>
                <label>Güven puanı<input type="number" min="1" max="100" value={sourceDraft.trustScore} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, trustScore: Number(event.target.value) })} /></label>
                <label>Tarama sıklığı (saat)<input type="number" min="1" max="720" value={sourceDraft.scanFrequencyHours} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, scanFrequencyHours: Number(event.target.value) })} /></label>
                {sourceDraft.sourceKind === 'api' ? <><label>API sağlayıcı<select value={sourceDraft.apiProvider} onChange={(event) => { const apiProvider = event.target.value as SourceDraft['apiProvider']; setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, apiProvider, baseUrl: apiProviderUrl(apiProvider) }); }}><option value="openalex">OpenAlex</option><option value="semantic_scholar">Semantic Scholar</option><option value="arxiv">arXiv</option><option value="core">CORE</option></select></label><label className="wide">Araştırma sorgusu<input value={sourceDraft.query} onChange={(event) => setSourceDraft({ ...sourceDraft, channel: sourceChannelTab, query: event.target.value })} placeholder="wheat irrigation disease field trial…" /></label></> : null}
              </div>
              <div className="tp-content-admin-form-actions"><button type="button" className="primary" onClick={() => { setSourceDraft((current) => ({ ...current, channel: sourceChannelTab })); void addSource(); }} disabled={workingId === '__source_add__'}><Plus size={15} /> Kaynağı Ekle</button></div>
            </div>
          </details>
        </div>
      ) : null}

      {editorCandidate && draft ? (
        <div className="tp-content-editor-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) { setEditorCandidate(null); setDraft(null); } }}>
          <section className="tp-content-editor" role="dialog" aria-modal="true" aria-label="İçerik taslağını düzenle">
            <header>
              <div>
                <span>{typeLabel(editorCandidate)}</span>
                <h3>Taslağı düzenle</h3>
              </div>
              <button type="button" onClick={() => { setEditorCandidate(null); setDraft(null); }}><X size={19} /></button>
            </header>

            <div className="tp-content-editor__body">
              <label>Başlık<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
              <label>Kısa özet<textarea rows={3} value={draft.summary} onChange={(event) => setDraft({ ...draft, summary: event.target.value })} /></label>
              <label>Kategori<input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} /></label>
              <div className="tp-content-editor__grid">
                <label>Yayın alanı<select value={draft.coverageScope} onChange={(event) => setDraft({ ...draft, coverageScope: event.target.value === 'world' ? 'world' : 'turkey' })}><option value="turkey">Ülkemizde Tarım</option><option value="world">Dünyada Tarım</option></select></label>
                <label>Olay / araştırma yeri<input value={draft.locationText} onChange={(event) => setDraft({ ...draft, locationText: event.target.value })} placeholder="Örn. İstanbul, Türkiye / Kuzey Dakota, ABD" /></label>
                <label>Olay / yayın tarihi<input type="date" value={draft.eventDate} onChange={(event) => setDraft({ ...draft, eventDate: event.target.value })} /></label>
                <label>R2 durumu<input value={`${editorCandidate.payload_status || 'missing'} · görsel ${editorCandidate.image_status || 'missing'}`} readOnly /></label>
              </div>

              {isArticleCandidate(editorCandidate) ? (
                <>
                  <div className="tp-content-editor__grid">
                    <label>DOI<input value={draft.doi} onChange={(event) => setDraft({ ...draft, doi: event.target.value })} /></label>
                    <label>Görsel arama kelimesi<input value={draft.imageKeyword} onChange={(event) => setDraft({ ...draft, imageKeyword: event.target.value })} /></label>
                    <label>Yazar(lar)<input value={draft.author} onChange={(event) => setDraft({ ...draft, author: event.target.value })} /></label>
                    <label>Kurum / Dergi<input value={draft.institution} onChange={(event) => setDraft({ ...draft, institution: event.target.value })} /></label>
                  </div>
                  <label>Araştırılan sorun<textarea rows={3} value={draft.problem} onChange={(event) => setDraft({ ...draft, problem: event.target.value })} /></label>
                  <label>Bulgu 1<input value={draft.finding1} onChange={(event) => setDraft({ ...draft, finding1: event.target.value })} /></label>
                  <label>Bulgu 2<input value={draft.finding2} onChange={(event) => setDraft({ ...draft, finding2: event.target.value })} /></label>
                  <label>Bulgu 3<input value={draft.finding3} onChange={(event) => setDraft({ ...draft, finding3: event.target.value })} /></label>
                  <label>Üretici için pratik sonuç<textarea rows={3} value={draft.takeaway} onChange={(event) => setDraft({ ...draft, takeaway: event.target.value })} /></label>
                  <details className="tp-content-editor__advanced">
                    <summary>Grafik / tablo JSON <ChevronDown size={15} /></summary>
                    <label>Grafik JSON<textarea rows={8} value={draft.chartJson} onChange={(event) => setDraft({ ...draft, chartJson: event.target.value })} placeholder='{"title":"Verim","type":"bar","labels":["A","B"],"values":[100,120]}' /></label>
                    <label>Tablo JSON<textarea rows={8} value={draft.tableJson} onChange={(event) => setDraft({ ...draft, tableJson: event.target.value })} placeholder='{"title":"Sonuçlar","columns":["Yöntem","Verim"],"rows":[["A",100],["B",120]]}' /></label>
                  </details>
                </>
              ) : (
                <label>İçerik<textarea rows={12} value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.target.value })} /></label>
              )}
            </div>

            <footer>
              <button type="button" className="secondary" onClick={() => { setEditorCandidate(null); setDraft(null); }}>İptal</button>
              <button type="button" className="primary" onClick={() => void saveEditor()} disabled={workingId === editorCandidate.id}>Kaydet</button>
            </footer>
          </section>
        </div>
      ) : null}
    </section>
  );
}
