import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizeSocialAuthAvailability } from './authProviderAvailability.core.ts';

test('normalizes enabled Supabase social providers', () => {
  assert.deepEqual(
    normalizeSocialAuthAvailability({
      google: true,
      facebook: true,
      apple: false,
      github: true,
    }),
    { google: true, facebook: true, apple: false },
  );
});

test('unknown or malformed provider settings are disabled', () => {
  assert.deepEqual(normalizeSocialAuthAvailability(null), {
    google: false,
    facebook: false,
    apple: false,
  });
  assert.deepEqual(
    normalizeSocialAuthAvailability({ google: 'true', apple: 1 }),
    { google: false, facebook: false, apple: false },
  );
});
