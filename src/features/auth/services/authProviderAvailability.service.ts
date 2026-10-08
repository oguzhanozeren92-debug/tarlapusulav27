import {
  supabaseProjectUrl,
  supabasePublishableKey,
} from '../../../supabaseClient';

import {
  normalizeSocialAuthAvailability,
  type SocialAuthAvailability,
} from './authProviderAvailability.core';

export {
  normalizeSocialAuthAvailability,
  socialAuthProviderLabel,
  type SocialAuthAvailability,
  type SocialAuthProvider,
} from './authProviderAvailability.core';

const CACHE_TTL_MS = 5 * 60 * 1000;

const fallbackAvailability: SocialAuthAvailability = {
  google: true,
  facebook: true,
  apple:
    String(import.meta.env.VITE_APPLE_SIGN_IN_ENABLED || '')
      .trim()
      .toLowerCase() === 'true',
};

let cached:
  | { value: SocialAuthAvailability; expiresAt: number }
  | null = null;

export async function fetchSocialAuthAvailability(
  options: { force?: boolean; signal?: AbortSignal } = {},
): Promise<SocialAuthAvailability> {
  const now = Date.now();
  if (!options.force && cached && cached.expiresAt > now) {
    return cached.value;
  }

  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 6_000);
  const abortFromCaller = () => controller.abort();
  options.signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(
      `${supabaseProjectUrl}/auth/v1/settings`,
      {
        method: 'GET',
        signal: controller.signal,
        headers: {
          apikey: supabasePublishableKey,
          Accept: 'application/json',
        },
      },
    );

    if (!response.ok) {
      throw new Error(`Auth provider settings HTTP ${response.status}`);
    }

    const payload = (await response.json()) as {
      external?: Record<string, unknown>;
    };
    const value = normalizeSocialAuthAvailability(payload?.external);

    cached = {
      value,
      expiresAt: now + CACHE_TTL_MS,
    };

    return value;
  } catch (error) {
    if (options.signal?.aborted) throw error;

    console.warn(
      'Sosyal giriş sağlayıcı durumu okunamadı; güvenli fallback kullanılacak:',
      error,
    );

    return fallbackAvailability;
  } finally {
    window.clearTimeout(timer);
    options.signal?.removeEventListener('abort', abortFromCaller);
  }
}
