# TarlaPusula mobil abonelik kurulumu

TarlaPusula uygulama kodu Free / Plus / Premium planlarını RevenueCat üzerinden App Store ve Google Play aboneliklerine bağlar.

## Sabit uygulama kimlikleri

- iOS Bundle ID: `com.tarlapusula.app`
- Android Application ID: `com.tarlapusula.app`
- RevenueCat App User ID: Supabase `auth.users.id` UUID
- RevenueCat entitlement kimlikleri: `tarlapusula_plus` ve `tarlapusula_premium` (uyumluluk için `plus` ve `premium` adları da kod tarafından tanınır).
- RevenueCat offering kimliği: `tarlapusula_plans` (varsayılan; uygulama mevcut diğer offering'lerde de eşleşen ürünleri arar).

**Önemli:** Uygulama, Monthly/Annual paket ismine tek başına güvenmez. Doğru aboneliği satın almak için RevenueCat paketinin gerçek App Store **Product ID**'sinin aşağıdaki dört kimlikten biriyle birebir uyuşmasını ister. Product ID gerekiyorsa yalnızca ilgili `VITE_REVENUECAT_*_PRODUCT_ID` build ayarıyla değiştirilebilir.

| Plan | Periyot | App Store Product ID |
| --- | --- | --- |
| Plus | Aylık | `com.tarlapusula.plus.monthly` |
| Plus | Yıllık | `com.tarlapusula.plus.annual` |
| Premium | Aylık | `com.tarlapusula.premium.monthly` |
| Premium | Yıllık | `com.tarlapusula.premium.annual` |

Bu adlar daha önceki TarlaPusula App Store kurulumunun beklenen kimlikleridir. App Store Connect ve RevenueCat panellerindeki gerçek kayıtlarla karşılaştırılmalıdır.

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
- gelişmiş bildirimler / raporlar
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

1. Apple ve Google uygulamalarını RevenueCat'e ekle; iOS Bundle ID `com.tarlapusula.app` olmalı.
2. `tarlapusula_plus` ve `tarlapusula_premium` entitlement oluştur (var olan `plus` / `premium` entitlement'larını silmeden önce müşteri uyumluluğunu kontrol et).
3. Plus ürünlerini Plus entitlement'ına, Premium ürünlerini Premium entitlement'ına bağla.
4. `tarlapusula_plans` offering altında dört product ID'yi içeren dört ayrı paket tanımla. Aynı offering içinde aynı paket türünden birden fazla abonelik varsa benzersiz paket kimliği kullan.
5. RevenueCat **Product Catalog**'da dört App Store ürünü de doğru durumla görünmeli; ürünlerin App Store Connect'te aktif / incelemeye hazır ve abonelik grubuna bağlı olduğunu kontrol et.
6. Public SDK key'lerini **Codemagic `revenuecat_keys` environment group** içine ekle; iOS build'i `appl_` ile başlayan anahtarı gerektirir:
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

## App Store 2.1 satın alma ret kontrolü

- [ ] Codemagic iOS build ortamında `VITE_REVENUECAT_IOS_PUBLIC_KEY` (`appl_` önekli) tanımlı, iOS build doğrulama adımı başarılı.
- [ ] RevenueCat iOS App Bundle ID `com.tarlapusula.app`; dört Product ID yukarıdaki kimliklerle birebir eş.
- [ ] Dört ürün RevenueCat'te doğru Plus/Premium entitlement'ına bağlanmış ve offering üzerinden sunuluyor.
- [ ] App Store Connect'te bütün aboneliklerin lokalizasyonu, fiyatları, satış uygunluğu ve abonelik grubu tamam.
- [ ] **Gerçek iPhone TestFlight** içinde Plus aylık, Plus yıllık, Premium aylık, Premium yıllık seçeneklerinde mağazadan gelen fiyat gösteriliyor.
- [ ] StoreKit sandbox satın alma sayfası açılıyor; sandbox hesapla işlem tamamlanıyor.
- [ ] İade/iptal/restore testlerinde istemci `CustomerInfo` ile sunucu `revenuecat_sync` sonucu tutarlı.
- [ ] App Review'a inceleme için çalışan hesap ve gerekiyorsa abonelik ürünlerine erişim talimatı ekleniyor.

**Uyarı:** Vercel build başarısı veya GitHub kodunun derlenmesi iOS sandbox satın alma testinin yerine geçmez. Build tamamlanıp TestFlight'ta dört ürün doğrulanmadan Apple ret maddesi çözülmüş sayılmamalıdır.
