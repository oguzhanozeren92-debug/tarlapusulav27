# TarlaPusula — Sosyal Giriş Production Kontrolü

## Kanonik adresler
- Supabase proje: `xwyfidtktauxivsosmex`
- Provider callback: `https://xwyfidtktauxivsosmex.supabase.co/auth/v1/callback`
- Native OAuth web bridge: `https://tarlapusulav27.vercel.app/`
- Native dönüş: `com.tarlapusula.app://auth-callback`

## Kod tarafı
- Google / Facebook / Apple butonları artık Supabase `auth/v1/settings` sonucundan otomatik açılır/kapanır.
- Sağlayıcı Supabase'de kapalıysa kullanıcıya bozuk buton gösterilmez.
- Provider discovery çağrısı kesilirse Google/Facebook güvenli fallback ile kalır; Apple yalnız `VITE_APPLE_SIGN_IN_ENABLED=true` ise fallback'te görünür.
- Android intent-filter ve iOS URL Scheme aynı callback'e bağlıdır.
- iOS Sign in with Apple entitlement mevcuttur.

## Dashboard tarafında tamamlanması gerekenler
1. Supabase > Authentication > Providers > Google: Client ID + secret + Enabled.
2. Google Cloud: Authorized redirect URI = Supabase provider callback.
3. Supabase > Authentication > Providers > Facebook: App ID + secret + Enabled.
4. Meta: Valid OAuth Redirect URI = Supabase provider callback; production için App Live.
5. Supabase > Authentication > Providers > Apple: Services ID + client secret + Enabled.
6. Apple Developer: Services ID web return URL = Supabase provider callback.
7. Apple OAuth client secret takvimi: en geç 6 ayda bir yenile.

## Gerçek cihaz kabulü
- Android: Google, Facebook ve etkinse Apple -> tarayıcı -> uygulama -> oturum -> onboarding/home.
- iOS: Google, Facebook ve Apple -> tarayıcı -> uygulama -> oturum -> onboarding/home.
- İptal edilen OAuth akışında kullanıcı uygulamaya hata mesajıyla dönebilmeli.
- Uygulama soğukken OAuth callback ile açıldığında da oturum kurulmalı.
