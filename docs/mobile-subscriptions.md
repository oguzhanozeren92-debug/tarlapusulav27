# TarlaPusula mobil abonelik kurulumu

TarlaPusula uygulama kodu Free / Plus / Premium planlarını RevenueCat üzerinden App Store ve Google Play aboneliklerine bağlar.

## Sabit uygulama kimlikleri

- iOS Bundle ID: `com.tarlapusula.app`
- Android Application ID: `com.tarlapusula.app`
- RevenueCat App User ID: Supabase `auth.users.id` UUID
- RevenueCat entitlement kimlikleri: `plus`, `premium`
- RevenueCat offering kimlikleri: `plus`, `premium`

Her offering içinde RevenueCat standard **Monthly** ve **Annual** package tiplerini kullan. Uygulama mağaza product ID'lerini hard-code etmez; ürünleri RevenueCat dashboard'unda bu paketlere bağlar.

## Plan kapsamı

### Free
- 1 aktif tarla
- temel uydu / Pusula
- Kuru Tarım
- reklamlı ücretsiz kullanım

### Plus
- 10 aktif tarla
- gelişmiş uydu ve uydu geçmişi
- gelişmiş Pusula AI
- sulama optimizasyonu
- gelişmiş bildirimler / raporlar / widget
- Kuru Tarım
- reklamsız

### Premium
- sınırsız tarla
- Plus'taki her şey
- PusulaPDF
- bahçe / ağaç zekâsı
- BİSİP / soğuklama
- depo / mikotoksin riski
- münavebe / ekim nöbeti
- reklamsız

## App Store Connect

Tek bir auto-renewable subscription group oluştur. Aynı grupta dört abonelik bulunmalı:

1. Plus aylık
2. Plus yıllık
3. Premium aylık
4. Premium yıllık

Yıllık fiyatı ilgili aylık fiyatın 12 aylık toplamına göre yaklaşık %20 avantajlı ayarla. Gerçek mağaza fiyatı ve yerel para birimi uygulamada StoreKit'ten okunur.

Premium'u daha yüksek hizmet seviyesi, Plus'ı bir alt seviye olarak konumlandır. iOS projesinde In-App Purchase capability kod tabanında aktiftir.

## Google Play Console

Plus ve Premium için aylık/yıllık satın alınabilir abonelikleri/base planları oluştur. Bunları RevenueCat Product Catalog'a ekleyip ilgili offering'in Monthly / Annual paketlerine bağla.

Android Activity `singleTop` olarak ayarlı ve RevenueCat Capacitor SDK projeye dahildir.

## RevenueCat

1. Apple ve Google uygulamalarını aynı RevenueCat projesine ekle.
2. `plus` ve `premium` entitlement oluştur.
3. Plus ürünlerini `plus`, Premium ürünlerini `premium` entitlement'a bağla.
4. `plus` ve `premium` offering oluştur.
5. Her offering'e Monthly ve Annual package bağla.
6. Public SDK key'lerini build ortamına ekle:
   - `VITE_REVENUECAT_IOS_PUBLIC_KEY=appl_...`
   - `VITE_REVENUECAT_ANDROID_PUBLIC_KEY=goog_...`

## Supabase server doğrulaması

Edge Function: `send-due-reminders`

Webhook URL:

`https://xwyfidtktauxivsosmex.supabase.co/functions/v1/send-due-reminders`

Supabase Edge Function secrets:

- `REVENUECAT_SECRET_API_KEY=sk_...`
- `REVENUECAT_WEBHOOK_AUTH=<RevenueCat webhook Authorization header ile birebir aynı değer>`

Örnek webhook Authorization değeri:

`Bearer <uzun-rastgele-deger>`

RevenueCat dashboard'da webhook Authorization alanına ve Supabase'deki `REVENUECAT_WEBHOOK_AUTH` secret'ına aynı tam değeri yaz.

Webhook sandbox + production olaylarını kabul edebilir. Backend her olayda RevenueCat müşteri durumunu yeniden sorgular; webhook gövdesindeki "plan" benzeri bir istemci değerine güvenmez.

## Veri akışı

1. Kullanıcı uygulamada Plus/Premium seçer.
2. RevenueCat gerçek App Store / Google Play ödeme ekranını açar.
3. Başarılı işlem sonrası CustomerInfo'daki entitlement UI'ı anında açar.
4. Uygulama authenticated `revenuecat_sync` çağrısı yapar.
5. Supabase Edge Function RevenueCat REST API'den aboneliği tekrar doğrular.
6. `profiles.subscription_plan` server-side `free | plus | premium` olarak güncellenir.
7. RevenueCat webhook yenileme, iptal, iade ve sona erme değişikliklerini tekrar senkronlar.
8. `subscription_webhook_events` olayları idempotency/audit için service-role-only tutulur.

## Restore

Plan ekranındaki **Satın alımları geri yükle** düğmesi RevenueCat `restorePurchases()` kullanır. Restore sonrası plan yine server-side RevenueCat sorgusuyla senkronlanır.

## Güvenlik

- RevenueCat secret key hiçbir zaman Vite/client env içine konmaz.
- Mobil uygulamaya yalnız RevenueCat public SDK key girer.
- Webhook Authorization header doğrulanmadan plan güncellenmez.
- `subscription_webhook_events` anon/authenticated rollerine kapalıdır.
- Store sonucunun istemcide görünmesi backend yetkisinin kaynağı değildir; backend RevenueCat'i tekrar sorgular.
