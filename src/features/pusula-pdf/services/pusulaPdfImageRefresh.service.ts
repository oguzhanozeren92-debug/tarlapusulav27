import { supabase } from '../../../supabaseClient';
import type { PusulaPdfSnapshot } from '../types';

// The worker stores report images in Storage but writes short-lived signed
// URLs (8 days) into report_data. A report reopened later would render with
// dead links: no NDVI maps, no radar, no photos. Before rendering, every
// Supabase signed URL (or bare archive path) is re-signed for the current user.
// Storage RLS still decides access; on any failure the original value is kept.

const SIGN_RE = /\/storage\/v1\/object\/sign\/([^/?#]+)\/([^?#]+)/;
const FIELD_MAP_BUCKET = 'field-map-layers';
const RENDER_URL_SECONDS = 60 * 60;
const MIN_REMAINING_MS = 10 * 60 * 1000;

type Ref = { bucket: string; path: string };

function parseSigned(url: unknown): Ref | null {
  if (typeof url !== 'string' || !url.startsWith('http')) return null;
  const match = SIGN_RE.exec(url);
  if (!match) return null;
  try {
    return { bucket: decodeURIComponent(match[1]), path: decodeURIComponent(match[2]) };
  } catch {
    return null;
  }
}

function tokenExpiresAt(url: string): number | null {
  try {
    const token = new URL(url).searchParams.get('token');
    const payload = token?.split('.')[1];
    if (!payload) return null;
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return typeof json?.exp === 'number' ? json.exp * 1000 : null;
  } catch {
    return null;
  }
}

function needsRefresh(url: string) {
  const exp = tokenExpiresAt(url);
  return exp === null || exp - Date.now() < MIN_REMAINING_MS;
}

/** Collects what to re-sign: an existing signed URL, or a stored archive path. */
function refFor(url: unknown, fallbackPath?: unknown): Ref | null {
  const parsed = parseSigned(url);
  if (parsed) return needsRefresh(url as string) ? parsed : null;
  if (!url && typeof fallbackPath === 'string' && fallbackPath.trim()) {
    return { bucket: FIELD_MAP_BUCKET, path: fallbackPath.trim() };
  }
  return null;
}

const key = (ref: Ref) => `${ref.bucket}\u0000${ref.path}`;

export async function refreshPusulaPdfImageUrls(snapshot: PusulaPdfSnapshot): Promise<PusulaPdfSnapshot> {
  const copy: PusulaPdfSnapshot = structuredClone(snapshot);
  const jobs: Array<{ ref: Ref; apply: (url: string) => void }> = [];

  for (const point of copy.satellite?.points ?? []) {
    const p = point as typeof point & { ndviImagePath?: string | null; trueColorImagePath?: string | null };
    const ndvi = refFor(p.ndviImage, p.ndviImagePath);
    if (ndvi) jobs.push({ ref: ndvi, apply: (url) => { p.ndviImage = url; } });
    const tc = refFor(p.trueColorImage, p.trueColorImagePath);
    if (tc) jobs.push({ ref: tc, apply: (url) => { p.trueColorImage = url; } });
  }
  for (const image of copy.radar?.images ?? []) {
    const img = image as typeof image & { imagePath?: string | null };
    const ref = refFor(img.imageUrl, img.imagePath);
    if (ref) jobs.push({ ref, apply: (url) => { img.imageUrl = url; } });
  }
  for (const photo of copy.fieldPhotos ?? []) {
    const ref = refFor(photo.signedUrl);
    if (ref) jobs.push({ ref, apply: (url) => { photo.signedUrl = url; } });
  }
  if (!jobs.length) return copy;

  const byBucket = new Map<string, Set<string>>();
  for (const { ref } of jobs) {
    if (!byBucket.has(ref.bucket)) byBucket.set(ref.bucket, new Set());
    byBucket.get(ref.bucket)!.add(ref.path);
  }

  const fresh = new Map<string, string>();
  await Promise.all([...byBucket.entries()].map(async ([bucket, paths]) => {
    try {
      const { data, error } = await supabase.storage.from(bucket).createSignedUrls([...paths], RENDER_URL_SECONDS);
      if (error || !data) return;
      for (const row of data) {
        if (row.signedUrl && row.path && !row.error) fresh.set(key({ bucket, path: row.path }), row.signedUrl);
      }
    } catch (error) {
      console.warn('[PUSULAPDF] görsel linkleri yenilenemedi:', bucket, error);
    }
  }));

  for (const job of jobs) {
    const url = fresh.get(key(job.ref));
    if (url) job.apply(url);
  }
  return copy;
}
