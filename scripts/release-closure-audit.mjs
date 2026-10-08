import fs from 'node:fs';

const checks = [
  ['One-page PusulaPDF renderer', 'src/features/pusula-pdf/services/pusulaPdfRenderer.service.ts', 'const W = 1240'],
  ['No PDF addPage regression', 'src/features/pusula-pdf/services/pusulaPdfRenderer.service.ts', '__NO_ADD_PAGE__'],
  ['RevenueCat purchase bridge', 'src/mobile/nativePurchases.ts', 'Purchases.purchasePackage'],
  ['RevenueCat restore bridge', 'src/mobile/nativePurchases.ts', 'Purchases.restorePurchases'],
  ['Rewarded ad SSV bridge', 'src/mobile/nativeAds.ts', 'admob_ssv'],
  ['Native push token bridge', 'src/mobile/nativePush.ts', 'native_push_tokens'],
  ['Social auth live provider discovery', 'src/features/auth/services/authProviderAvailability.service.ts', '/auth/v1/settings'],
  ['Map layer recovery', 'src/lib/mapLayerRecovery.ts', 'recover'],
  ['Market scheduler source', 'supabase/functions/market-sync-dispatch/index.ts', 'tobb_batch'],
  ['Release readiness source', 'supabase/functions/release-readiness-probe/index.ts', 'release_readiness_probe'],
  ['Published content image guard', 'supabase/migrations/20261008063000_content_published_requires_cover_image_v1.sql', 'trg_content_items_require_cover_image'],
];

let failed = false;
for (const [label, file, needle] of checks) {
  if (!fs.existsSync(file)) {
    console.log(`FAIL  ${label} (${file} missing)`);
    failed = true;
    continue;
  }
  const content = fs.readFileSync(file, 'utf8');
  const ok = needle === '__NO_ADD_PAGE__' ? !content.includes('.addPage(') : content.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

const workflowChecks = [
  ['Android debug OAuth bridge', '.github/workflows/android-debug-apk.yml', 'VITE_PUBLIC_APP_URL'],
  ['iOS live Apple login flag', '.github/workflows/ios-live-test-ipa.yml', "VITE_APPLE_SIGN_IN_ENABLED: 'true'"],
  ['iOS release Apple login flag', '.github/workflows/ios-app-store-ipa.yml', "VITE_APPLE_SIGN_IN_ENABLED: 'true'"],
];
for (const [label, file, needle] of workflowChecks) {
  const content = fs.readFileSync(file, 'utf8');
  const ok = content.includes(needle);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) failed = true;
}

if (failed) process.exit(1);
console.log('RELEASE CLOSURE AUDIT: PASS');
