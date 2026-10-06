# TarlaPusula — Store Submission Checklist

Son güncelleme: 2026-10-06

## A. Şu anda tamamlananlar

- [x] Package / Bundle ID: `com.tarlapusula.app`
- [x] Android targetSdk 36
- [x] Android Release AAB compile SUCCESS
- [x] Android Debug APK compile SUCCESS
- [x] iOS simulator / unsigned device IPA CI SUCCESS
- [x] iOS AppIcon 1024x1024, alpha yok
- [x] iOS PrivacyInfo.xcprivacy bundle Resource içinde
- [x] iOS camera/location/photo permission descriptions
- [x] Android notification permission explicit
- [x] Android backup kapalı
- [x] Android cleartext traffic kapalı
- [x] Native RevenueCat plugin verified
- [x] Native AdMob plugin verified
- [x] Push native bridge
- [x] APNs App Store release environment = production
- [x] Sign in with Apple code + entitlement + Xcode capability
- [x] RevenueCat purchase / restore / manage subscription flow
- [x] Subscription renewal disclosure + Privacy + Terms links
- [x] In-app account deletion
- [x] Web self-service account deletion
- [x] Privacy Policy
- [x] Terms of Use
- [x] Support page source
- [x] SECURITY DEFINER audit
- [x] PusulaPDF server-side Premium + ownership enforcement
- [x] Gamification self-award server-side verification
- [x] Store Privacy / Data Safety draft
- [x] Turkish store listing copy draft
- [x] KVKK Aydınlatma Metni release taslağı (`docs/KVKK_AYDINLATMA_METNI_2026-10-06.md`)

## B. Apple membership ACTIVE olur olmaz

1. Certificates, Identifiers & Profiles → Identifiers
2. App ID / Explicit Bundle ID: `com.tarlapusula.app`
3. Capabilities:
   - Push Notifications
   - Sign in with Apple
   - In-App Purchase
4. Sign in with Apple provider configuration
5. App Store Connect app record oluştur
6. Apple Distribution certificate üret
7. App Store provisioning profile üret
8. GitHub Secrets:
   - `IOS_DISTRIBUTION_P12_B64`
   - `IOS_DISTRIBUTION_P12_PASSWORD`
   - `IOS_APP_STORE_PROFILE_B64`
   - `APPLE_TEAM_ID`
   - `VITE_REVENUECAT_IOS_PUBLIC_KEY`
9. Signed App Store IPA workflow çalıştır
10. TestFlight upload
11. Sandbox subscription test
12. App Privacy formunu `STORE_PRIVACY_DECLARATIONS_2026-10-06.md` ile doldur
13. Store listing metinlerini `STORE_LISTING_TR_2026-10-06.md` ile doldur
14. Reviewer test hesabı ekle
15. Gerçek iPhone smoke test geçir

## C. Android cihaz doğrulaması yapılınca

> Yeni kişisel Google Play hesabı için production öncesi 12 tester / 14 gün closed test zorunludur.
> Ayrıntılı plan: `docs/GOOGLE_PLAY_CLOSED_TEST_PLAN_2026-10-06.md`

1. Play Console developer-device verification tamamla
2. Firebase Android app `com.tarlapusula.app` doğrula / oluştur
3. Production `google-services.json` al
4. Upload keystore oluştur ve güvenli yedekle
5. GitHub Secrets:
   - `ANDROID_UPLOAD_KEYSTORE_B64`
   - `ANDROID_UPLOAD_STORE_PASSWORD`
   - `ANDROID_UPLOAD_KEY_ALIAS`
   - `ANDROID_UPLOAD_KEY_PASSWORD`
   - `GOOGLE_SERVICES_JSON_B64`
   - `VITE_REVENUECAT_ANDROID_PUBLIC_KEY`
6. Signed Play AAB workflow çalıştır
7. Internal testing track
8. Closed test oluştur; hedef 15–18 davetli, minimum 12 testerı 14 gün kesintisiz opt-in tut
9. Gerçek Android smoke test + tester feedback
10. 14 gün sonunda Apply for production
11. Data Safety formunu store privacy dokümanıyla doldur
12. Ads declaration = YES
13. Account deletion URL gir
14. Store listing metinlerini ekle
15. Sandbox subscription / restore test

## D. RevenueCat mağazalar açılınca

Önerilen ürünler:
- Plus monthly
- Plus annual
- Premium monthly
- Premium annual

Önerilen product IDs:
- `com.tarlapusula.app.plus.monthly`
- `com.tarlapusula.app.plus.annual`
- `com.tarlapusula.app.premium.monthly`
- `com.tarlapusula.app.premium.annual`

RevenueCat:
- entitlement: `plus`
- entitlement: `premium`
- offering: `plus`
- offering: `premium`
- monthly package
- annual package

Her platform için gerçek store product → RevenueCat package eşlemesi doğrulanmalı.

## E. Hukuki/operasyonel son insan girdileri

Kod/repo tarafında hukuki metnin gövdesi hazırdır. Halka açık ticari yayın öncesinde yalnız gerçek bilgilerle aşağıdaki alanlar kesinleştirilecek:

- [x] Veri sorumlusu / işletmeci: **Oğuzhan Özeren**
- [x] Kalıcı KVKK / gizlilik / destek e-postası: **tarlapusula@gmail.com**
- [x] Fiziksel iletişim adresi yayımlanmayacak; mevcut sürümde e-posta + uygulama içi destek kanalı kullanılacak
- [x] `docs/KVKK_AYDINLATMA_METNI_2026-10-06.md` gerçek kimlik/iletişim bilgileriyle finalleştirildi
- [x] `public/kvkk-aydinlatma.html` eklendi; Privacy/Support/Terms içinden çapraz linklendi
- [x] Privacy + Terms içinde işletmeci ve kalıcı iletişim bilgisi finalleştirildi
- [ ] Dedicated reviewer/test account oluştur

**Güvenlik kuralı:** reviewer hesabının parolası, Apple/Google şifreleri, 2FA kodları veya sertifika özel anahtar parolaları repoya yazılmayacak.

## F. AdMob app-ads.txt

- [x] `public/app-ads.txt` oluşturuldu.
- [x] Publisher ID: `pub-9321324588059191`
- [x] `https://tarlapusulav27.vercel.app/app-ads.txt` production HTTP 200 doğrulandı.
- [ ] App Store / Google Play developer website alanında TarlaPusula web domainini kullan.
- [ ] Uygulama mağazada listelendikten sonra AdMob → app-ads.txt durumunu Verified olarak kontrol et.

## G. Vercel

- [x] privacy-policy.html production 200
- [x] terms-of-use.html production 200
- [x] account-deletion production 200
- [x] support.html production 200 doğrulandı.
- [x] kvkk-aydinlatma.html production 200 doğrulandı.

## H. Release gate

Public release **GO** ancak aşağıdakilerin tamamı geçince:

- Signed store artifacts
- Store product / RevenueCat production mapping
- iOS + Android real-device smoke
- Push background/killed-state
- AdMob TEST ad flow on device
- Subscription purchase + restore
- Sign in with Apple production login
- Privacy/Data Safety forms
- Legal identity/contact final ✓
- KVKK public page + legal cross-links ✓
- Support URL 200 ✓
