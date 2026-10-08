import fs from 'node:fs';

const checks = [
  ['Android OAuth scheme', 'android/app/src/main/AndroidManifest.xml', 'android:host="auth-callback"'],
  ['iOS OAuth scheme', 'ios/App/App/Info.plist', 'com.tarlapusula.app'],
  ['Apple entitlement', 'ios/App/App/App.entitlements', 'com.apple.developer.applesignin'],
  ['Native callback', 'src/mobile/nativeAuth.ts', "com.tarlapusula.app://auth-callback"],
  ['Supabase provider discovery', 'src/features/auth/services/authProviderAvailability.service.ts', '/auth/v1/settings'],
  ['Login provider discovery usage', 'src/pages/Auth/AuthScreens.tsx', 'fetchSocialAuthAvailability'],
  ['Public OAuth bridge env', '.env.example', 'VITE_PUBLIC_APP_URL=https://tarlapusulav27.vercel.app/'],
];

let failed = false;
for (const [label, file, needle] of checks) {
  const content = fs.readFileSync(file, 'utf8');
  const ok = content.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log('AUTH RELEASE AUDIT: PASS');
