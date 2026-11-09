import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const css = readFileSync(new URL('../../../pages/Auth/Auth.css', import.meta.url), 'utf8');
const authController = readFileSync(new URL('../hooks/useAuthOnboardingController.ts', import.meta.url), 'utf8');
const nativeShell = readFileSync(new URL('../../../mobile/NativeShellBridge.tsx', import.meta.url), 'utf8');

test('iOS auth inputs use 16px text to prevent focus auto-zoom', () => {
  assert.match(css, /@supports \(-webkit-touch-callout: none\)/);
  assert.match(css, /\.tp-authv2 \.tp-authv2-input:not\(\.tp-authv2-code-input\) input:not\(\[type='checkbox'\]\)\s*\{\s*font-size:\s*16px\s*!important;/);
  assert.doesNotMatch(css, /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/i);
});

test('login and registration blur focused inputs before navigation', () => {
  assert.match(authController, /function blurFocusedAuthField\(\)/);
  assert.match(authController, /blurFocusedAuthField\(\);\s*setAuthLoading\(true\);\s*setAuthMessage\(''\);\s*try \{\s*const \{ data, error \} = await supabase\.auth\.signInWithPassword/);
  assert.match(authController, /blurFocusedAuthField\(\);\s*setAuthLoading\(true\);\s*setAuthMessage\(''\);\s*try \{\s*const \{ data, error \} = await supabase\.auth\.signUp/);
});

test('native shell refreshes viewport after iOS keyboard finishes closing', () => {
  assert.match(nativeShell, /Keyboard\.addListener\('keyboardDidHide'/);
  assert.match(nativeShell, /setKeyboardState\(false\);\s*scheduleViewportRefresh\(\);/);
});
