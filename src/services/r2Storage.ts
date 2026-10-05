import { supabase } from '../supabaseClient';

export const R2_MARKER = 'r2:' as const;

export type R2Namespace =
  | 'field-activity-photos'
  | 'field-observation-photos'
  | 'user-documents'
  | 'reports';

type SignedItem = {
  path: string;
  url: string;
  contentType?: string | null;
};

type SignResponse = {
  items?: SignedItem[];
  error?: string;
};

function cleanPath(path: string) {
  return String(path ?? '')
    .replace(/^r2:/, '')
    .replace(/^\/+/, '')
    .trim();
}

export function isR2Path(path?: string | null) {
  return typeof path === 'string' && path.startsWith(R2_MARKER);
}

export function markR2Path(path: string) {
  return `${R2_MARKER}${cleanPath(path)}`;
}

export function unmarkR2Path(path: string) {
  return cleanPath(path);
}

async function sign(
  action: 'upload' | 'download' | 'delete',
  namespace: R2Namespace,
  paths: string[],
  contentTypes?: Array<string | null | undefined>,
) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  const normalized = paths.map(cleanPath).filter(Boolean);
  if (!normalized.length) return [] as SignedItem[];

  const { data, error } = await supabase.functions.invoke<SignResponse>('r2-storage', {
    body: {
      action,
      namespace,
      paths: normalized,
      contentTypes:
        action === 'upload'
          ? normalized.map((_, index) => contentTypes?.[index] || 'application/octet-stream')
          : undefined,
    },
  });

  if (error) throw error;
  if (data?.error) throw new Error(data.error);

  return Array.isArray(data?.items) ? data.items : [];
}


export async function testR2Connection() {
  if (!supabase) {
    return { ok: false, error: 'Supabase bağlantısı hazır değil.' };
  }

  try {
    const { data, error } = await supabase.functions.invoke<{
      ok?: boolean;
      stage?: string;
      error?: string;
      message?: string;
      code?: string | null;
      httpStatus?: number | null;
      bucket?: string;
      endpointHost?: string;
    }>('r2-storage', {
      body: { action: 'healthcheck' },
    });

    if (error) {
      return { ok: false, error: error.message || 'Healthcheck çağrısı başarısız.' };
    }

    if (data?.ok) {
      return { ok: true, stage: data.stage || 'complete' };
    }

    const detailParts = [
      data?.code ? `kod: ${data.code}` : '',
      data?.httpStatus ? `HTTP ${data.httpStatus}` : '',
      data?.message || data?.error || '',
    ].filter(Boolean);

    return {
      ok: false,
      stage: data?.stage,
      error:
        detailParts.join(' · ') ||
        'R2 healthcheck başarısız.',
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'R2 healthcheck başarısız.',
    };
  }
}

async function uploadToSupabaseFallback(
  namespace: R2Namespace,
  cleanPathValue: string,
  file: Blob,
  contentType: string,
) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  // AI ve saha fotoğrafı bucket'ları Supabase'te de private + kullanıcı bazlı RLS ile var.
  // R2 erişimi veya tarayıcı CORS'u aksarsa analiz akışını tamamen durdurmuyoruz.
  const supportedFallbackBuckets = new Set<R2Namespace>([
    'field-activity-photos',
    'field-observation-photos',
  ]);

  if (!supportedFallbackBuckets.has(namespace)) {
    throw new Error('Bu dosya türü için yedek depolama kullanılamıyor.');
  }

  const { error } = await supabase.storage
    .from(namespace)
    .upload(cleanPathValue, file, {
      contentType,
      upsert: false,
      cacheControl: '3600',
    });

  if (error) {
    throw new Error(
      `Yedek fotoğraf yükleme başarısız: ${error.message || 'Supabase Storage hatası.'}`,
    );
  }

  // İşaretsiz path = legacy/private Supabase Storage.
  // analyze-field-image bunu zaten destekliyor.
  return cleanPathValue;
}

export async function uploadPrivateFile(
  namespace: R2Namespace,
  path: string,
  file: Blob,
  contentType?: string,
) {
  const clean = cleanPath(path);
  const type = contentType || file.type || 'application/octet-stream';

  try {
    // Önce R2. Eski DEV healthcheck artık yüklemeyi bloklamıyor;
    // imzalı gerçek yükleme isteği doğrudan deneniyor.
    const [signed] = await sign('upload', namespace, [clean], [type]);

    if (!signed?.url) {
      throw new Error('R2 yükleme bağlantısı hazırlanamadı.');
    }

    const response = await fetch(signed.url, {
      method: 'PUT',
      mode: 'cors',
      credentials: 'omit',
      headers: {
        'Content-Type': type,
      },
      body: file,
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      throw new Error(
        `Cloudflare R2 yükleme başarısız (HTTP ${response.status})${
          details ? `: ${details.slice(0, 160)}` : ''
        }`,
      );
    }

    return markR2Path(clean);
  } catch (r2Error) {
    console.warn(
      'R2 yüklemesi tamamlanamadı; private Supabase Storage yedeği deneniyor:',
      r2Error,
    );

    try {
      return await uploadToSupabaseFallback(namespace, clean, file, type);
    } catch (fallbackError) {
      const r2Message =
        r2Error instanceof Error ? r2Error.message : 'R2 yükleme hatası';
      const fallbackMessage =
        fallbackError instanceof Error
          ? fallbackError.message
          : 'Yedek depolama hatası';

      throw new Error(
        `Fotoğraf yüklenemedi. R2: ${r2Message} · Yedek: ${fallbackMessage}`,
      );
    }
  }
}

export async function getPrivateFileUrl(
  namespace: R2Namespace,
  storedPath: string,
  legacySupabaseBucket?: string,
) {
  if (!storedPath) return null;

  if (isR2Path(storedPath)) {
    const [signed] = await sign('download', namespace, [unmarkR2Path(storedPath)]);
    return signed?.url ?? null;
  }

  if (!legacySupabaseBucket || !supabase) return null;

  const { data, error } = await supabase.storage
    .from(legacySupabaseBucket)
    .createSignedUrl(storedPath, 60 * 60);

  if (error) {
    console.warn('Eski Supabase dosya URL’i hazırlanamadı:', error);
    return null;
  }

  return data?.signedUrl ?? null;
}

export async function getPrivateFileUrls(
  namespace: R2Namespace,
  storedPaths: string[],
  legacySupabaseBucket?: string,
) {
  const result = new Map<string, string>();
  const r2Paths = storedPaths.filter(isR2Path);
  const legacyPaths = storedPaths.filter((path) => path && !isR2Path(path));

  if (r2Paths.length) {
    const signed = await sign(
      'download',
      namespace,
      r2Paths.map(unmarkR2Path),
    );

    signed.forEach((item) => {
      if (item?.path && item?.url) {
        result.set(markR2Path(item.path), item.url);
      }
    });
  }

  if (legacyPaths.length && legacySupabaseBucket && supabase) {
    try {
      const { data, error } = await supabase.storage
        .from(legacySupabaseBucket)
        .createSignedUrls(legacyPaths, 60 * 60);

      if (!error) {
        legacyPaths.forEach((path, index) => {
          const url = data?.[index]?.signedUrl;
          if (url) result.set(path, url);
        });
      }
    } catch (error) {
      console.warn('Eski Supabase dosya URL’leri hazırlanamadı:', error);
    }
  }

  return result;
}

export async function deletePrivateFile(
  namespace: R2Namespace,
  storedPath: string,
  legacySupabaseBucket?: string,
) {
  if (!storedPath) return;

  if (isR2Path(storedPath)) {
    const [signed] = await sign('delete', namespace, [unmarkR2Path(storedPath)]);
    if (!signed?.url) return;

    const response = await fetch(signed.url, { method: 'DELETE' });
    if (!response.ok && response.status !== 404) {
      throw new Error(`R2 dosya silme başarısız (${response.status}).`);
    }
    return;
  }

  if (!legacySupabaseBucket || !supabase) return;

  const { error } = await supabase.storage
    .from(legacySupabaseBucket)
    .remove([storedPath]);

  if (error) throw error;
}
