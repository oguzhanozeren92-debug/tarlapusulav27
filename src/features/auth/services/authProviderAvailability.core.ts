export type SocialAuthProvider = 'google' | 'facebook' | 'apple';

export type SocialAuthAvailability = Record<SocialAuthProvider, boolean>;

export const SOCIAL_AUTH_PROVIDERS: SocialAuthProvider[] = [
  'google',
  'facebook',
  'apple',
];

export function normalizeSocialAuthAvailability(
  external: unknown,
): SocialAuthAvailability {
  const source =
    external && typeof external === 'object'
      ? (external as Record<string, unknown>)
      : {};

  return Object.fromEntries(
    SOCIAL_AUTH_PROVIDERS.map((provider) => [
      provider,
      source[provider] === true,
    ]),
  ) as SocialAuthAvailability;
}

export function socialAuthProviderLabel(provider: SocialAuthProvider) {
  if (provider === 'google') return 'Google';
  if (provider === 'facebook') return 'Facebook';
  return 'Apple';
}
