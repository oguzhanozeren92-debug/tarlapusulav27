# TarlaPusula — App Store Privacy & Google Play Data Safety Taslağı

Son güncelleme: 2026-10-06

> Bu dosya App Store Connect ve Google Play Console formlarını hızlı ve tutarlı doldurmak için hazırlanmıştır.
> Son gönderimden hemen önce signed release build, SDK sürümleri, AdMob consent/ATT ayarları ve Xcode privacy report ile bir kez daha karşılaştırılmalıdır.

## Sabit URL'ler

- Privacy Policy: https://tarlapusulav27.vercel.app/privacy-policy.html
- Privacy Choices / Account Deletion: https://tarlapusulav27.vercel.app/account-deletion
- Terms of Use: https://tarlapusulav27.vercel.app/terms-of-use.html
- Support URL hedefi: https://tarlapusulav27.vercel.app/support.html
  - Not: support sayfası repoda hazır; 2026-10-06 tarihinde Vercel Hobby günlük deployment limiti nedeniyle production deploy bekliyor.

## Kaynaklar / resmi rehberler

- Apple App Privacy:
  https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- Apple App Privacy reference:
  https://developer.apple.com/help/app-store-connect/reference/app-information/app-privacy
- Google Play Data Safety:
  https://support.google.com/googleplay/android-developer/answer/10787469
- Google Mobile Ads Android data disclosure:
  https://developers.google.com/admob/android/privacy/play-data-disclosure
- Google Mobile Ads iOS data disclosure:
  https://developers.google.com/admob/ios/privacy/data-disclosure
- RevenueCat Apple App Privacy:
  https://www.revenuecat.com/docs/platform-resources/apple-platform-resources/apple-app-privacy
- RevenueCat Google Play Data Safety:
  https://www.revenuecat.com/docs/platform-resources/google-platform-resources/google-plays-data-safety

---

# 1. Apple App Privacy

## Genel cevap

**Do you or your third-party partners collect data from this app?**
- YES

Apple cevapları uygulama + entegre üçüncü taraf SDK'ları kapsamalıdır.

## Privacy Policy

- Privacy Policy URL:
  https://tarlapusulav27.vercel.app/privacy-policy.html
- User Privacy Choices URL:
  https://tarlapusulav27.vercel.app/account-deletion

## Önerilen veri tipleri

### Contact Info → Name

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Purposes:
  - App Functionality
  - Account Management

Kaynak: kullanıcı hesabı / profil.

### Contact Info → Email Address

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Purposes:
  - App Functionality
  - Account Management
  - Developer's Advertising or Marketing: NO
  - Third-Party Advertising: NO

Kaynak: Supabase Auth / hesap yönetimi.

### Identifiers → User ID

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Purposes:
  - App Functionality
  - Account Management
  - Analytics

Not: RevenueCat appUserID olarak Supabase kullanıcı UUID'si kullanılır.

### Purchases → Purchase History

- Collected: YES
- Linked to user: YES
- Used for tracking: NO (mevcut TarlaPusula mimarisinde)
- Purposes:
  - App Functionality
  - Analytics

RevenueCat gerekliliği. Entitlement doğrulaması, satın alma geçmişi ve RevenueCat dashboard analitiği için kullanılır.

### Location → Precise Location

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Collection: optional / only when user grants location permission or uses location-based field flow.
- Purposes:
  - App Functionality
  - Personalization

Kullanım: tarla konumu, konumdan tarla bulma, hava/uydu/tarla bağlamı.

### Location → Coarse Location

- Collected: YES
- Linked to user: conservative answer = YES where device/app identifiers can associate ad telemetry.
- Purposes:
  - Third-Party Advertising
  - Analytics
  - Fraud Prevention
- Tracking:
  - **YES if personalized advertising / IDFA-based measurement is enabled after consent.**
  - Final App Store submission must match AdMob UMP + ATT production configuration.

Google Mobile Ads IP address üzerinden approximate location çıkarabilir.

### User Content → Photos or Videos

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Optional: YES
- Purposes:
  - App Functionality

Kullanım: bitki/tarla fotoğraf analizi, saha gözlemi, hata bildirimi ekran görüntüsü.

### User Content → Customer Support

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Optional: YES
- Purposes:
  - App Functionality

Kullanım: hata bildirimi / destek mesajları.

### User Content → Other User Content

- Collected: YES
- Linked to user: YES
- Used for tracking: NO
- Optional: YES
- Purposes:
  - App Functionality
  - Personalization

Örnek: tarla kayıtları, notlar, ürün/çeşit, sulama/işlem bilgileri, saha girdileri.

### Identifiers → Device ID

- Collected: YES
- Linked to identity: conservative answer = YES where ad/SDK identifier is tied to device/app instance.
- Purposes:
  - Third-Party Advertising
  - Analytics
  - Fraud Prevention
- Tracking:
  - **YES when AdMob uses advertising identifier / cross-app ad measurement after consent.**
  - Final answer production UMP/ATT davranışıyla eşleştirilmeli.

### Usage Data → Product Interaction

- Collected: YES
- Linked to user: SDK/configuration dependent; conservative answer = YES
- Purposes:
  - Third-Party Advertising
  - Analytics
  - Fraud Prevention
- Tracking:
  - YES when used as part of third-party personalized ad / attribution flow.

Google Mobile Ads SDK app launches, taps and ad/video interactions gibi product interaction bilgileri işleyebilir.

### Usage Data → Advertising Data

- Collected: YES
- Purposes:
  - Third-Party Advertising
  - Analytics
- Tracking:
  - YES when personalized advertising / attribution is active.

### Diagnostics → Crash Data

- Collected: YES (AdMob SDK potential behavior)
- Purposes:
  - Analytics
  - App Functionality / SDK reliability
- Tracking: NO

### Diagnostics → Performance Data

- Collected: YES (AdMob SDK potential behavior)
- Purposes:
  - Analytics
  - Third-Party Advertising where ad performance measurement applies
- Tracking: normally NO by itself; re-check with production SDK privacy report.

## Apple'da beyan ETMEYECEĞİMİZ veri

Mevcut mimariye göre:
- Payment card / bank details: NO — mağaza ödeme bilgisi App Store / Google Play tarafından işlenir, TarlaPusula kart bilgisi almaz.
- Health data: NO.
- Contacts / address book: NO.
- Browsing history: NO.
- Search history as a standalone personal data category: current app behavior için gerekli görünmüyor.

---

# 2. Google Play Data Safety

## Data collection and security

**Does your app collect or share any of the required user data types?**
- YES

**Is all of the user data collected by your app encrypted in transit?**
- YES

**Do you provide a way for users to request that their data is deleted?**
- YES
- URL:
  https://tarlapusulav27.vercel.app/account-deletion

**Does the app contain ads?**
- YES
- Not: Ads Free plan davranışının parçasıdır; Plus/Premium'da gösterilmemesi genel "contains ads" cevabını NO yapmaz.

## Google Data Safety veri tipleri

### Personal info → Name

- Collected: YES
- Shared: NO (yalnız service-provider işleme hariç)
- Required: account/profile flow
- Purposes:
  - App functionality
  - Account management

### Personal info → Email address

- Collected: YES
- Shared: NO
- Required: account/login
- Purposes:
  - App functionality
  - Account management

### Personal info → User IDs

- Collected: YES
- Shared: NO
- Required: YES
- Purposes:
  - App functionality
  - Account management
  - Analytics (RevenueCat entitlement/customer history)

### Location → Precise location

- Collected: YES
- Shared: NO solely because Supabase/field services are service providers
- Optional: YES / permission-based
- Purposes:
  - App functionality
  - Personalization

### Location → Approximate location

- Collected: YES
- Shared: YES (Google Mobile Ads SDK)
- Required: ad SDK behavior in ad-enabled Free plan, subject to consent/configuration
- Purposes:
  - Advertising or marketing
  - Analytics
  - Fraud prevention, security and compliance

### Financial info → Purchase history

- Collected: YES
- Shared: NO unless a future RevenueCat integration sends it to a non-service-provider third party
- Processed ephemerally: NO
- Required: YES for subscription functionality per RevenueCat guidance
- Purposes:
  - App functionality
  - Analytics

### Photos and videos → Photos

- Collected: YES
- Shared: NO solely because AI/storage vendors are service providers
- Optional: YES
- Purposes:
  - App functionality

### Files and docs → Files and docs

- Collected: YES
- Shared: NO
- Optional: YES
- Purposes:
  - App functionality

Örnek: toprak analiz raporu / kullanıcı yüklediği doküman.

### App activity → App interactions

- Collected: YES
- Shared: YES (Google Mobile Ads SDK)
- Purposes:
  - Advertising or marketing
  - Analytics
  - Fraud prevention, security and compliance

### App info and performance → Crash logs

- Collected: YES
- Shared: YES where Google Mobile Ads SDK transmits SDK/app diagnostic telemetry
- Purposes:
  - Analytics
  - Advertising or marketing where ad reliability/measurement applies

### App info and performance → Diagnostics

- Collected: YES
- Shared: YES (Google Mobile Ads SDK)
- Purposes:
  - Analytics
  - Advertising or marketing
  - Fraud prevention, security and compliance

### Device or other IDs

- Collected: YES
- Shared: YES (Google Mobile Ads SDK)
- Purposes:
  - Advertising or marketing
  - Analytics
  - Fraud prevention, security and compliance

### Other user-generated content

- Collected: YES
- Shared: NO
- Optional: YES for many subflows
- Purposes:
  - App functionality
  - Personalization

Örnek: tarla notları, üretim kayıtları, destek mesajları, saha verileri.

## "Shared" konusunda önemli not

Google Play'in service-provider istisnası nedeniyle Supabase, Cloudflare R2, Gemini/AI sağlayıcısı veya RevenueCat'e yalnız TarlaPusula adına hizmet sunmaları için aktarılan veri her durumda "Shared" sayılmaz.

Ancak **Google Mobile Ads SDK resmi dokümantasyonu bazı verileri otomatik olarak collect + share ettiğini açıkça belirttiği için**:
- approximate location / IP-derived location
- app interactions
- diagnostics
- device/account identifiers

için Shared = YES taslağı kullanılmıştır.

---

# 3. Final submission gate

Formlar Publish/Submit edilmeden hemen önce:

1. Signed iOS archive ile Xcode privacy report kontrol et.
2. App Store provisioning + Sign in with Apple üretim provider'ını doğrula.
3. AdMob UMP production consent message ve ATT/IDFA davranışını doğrula.
4. RevenueCat production offering/product eşleşmesini doğrula.
5. Android merged manifest ve Google Play SDK Index/Data Safety önerilerini karşılaştır.
6. Gerçek cihaz smoke testinde kamera/konum/reklam/abonelik/push akışlarını geçir.
7. Privacy Policy ile Console cevaplarının aynı kaldığını doğrula.
