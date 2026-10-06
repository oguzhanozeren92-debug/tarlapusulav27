# TarlaPusula · Mobil reklam kurulumu

TarlaPusula reklam modeli yalnız **Ücretsiz** planda çalışır.

- Free: seyrek interstitial + kullanıcının isteğiyle rewarded reklam
- Plus: reklamsız
- Premium: reklamsız
- Banner reklam: kullanılmaz
- App-open reklam: kullanılmaz

## Kod tarafı

Capacitor 8 için `@capacitor-community/admob@8.2.0` kullanılır.

TarlaPusula'nın mevcut yerleşimleri:

- `points_hub`
- `ai_extra_analysis`
- `satellite_history`
- `agenda_deep_read`

Interstitial politikası:

- yalnız Free
- en fazla 3 / gün
- iki interstitial arasında en az 25 dakika
- normal interstitial puan kazandırmaz

Rewarded:

- yalnız kullanıcı kendi başlatır
- WATCH_AD gamification kuralındaki puanı verir
- `ai_extra_analysis` ayrıca 1 AI reward credit verebilir
- gerçek reklamda puan yalnız Google AdMob SSV imzası doğrulanınca verilir

## Geliştirme / test

Native dosyalarda Google'ın örnek App ID'leri bulunur:

- Android sample App ID: `ca-app-pub-3940256099942544~3347511713`
- iOS sample App ID: `ca-app-pub-3940256099942544~1458002511`

Vite DEV build veya `VITE_ADMOB_TEST_MODE=true` iken Google demo ad unit'leri kullanılır.

Bu modda gerçek AdMob geliri oluşmaz. Google demo rewarded reklamlar SSV callback göndermediği için test puanı yalnız admin hesabında client test doğrulamasıyla verilir.

## Gerçek AdMob hesabı bağlanınca

### Android

`android/app/src/main/res/values/strings.xml` içindeki:

`admob_app_id`

değerini TarlaPusula Android AdMob App ID ile değiştir.

### iOS

`ios/App/App/Info.plist` içindeki:

`GADApplicationIdentifier`

değerini TarlaPusula iOS AdMob App ID ile değiştir.

SKAdNetwork listesi ve `NSUserTrackingUsageDescription` projede hazırdır.

## Production ad unit env değerleri

Build ortamına:

```
VITE_ADMOB_TEST_MODE=false
VITE_ADMOB_ANDROID_REWARDED_ID=ca-app-pub-.../...
VITE_ADMOB_ANDROID_INTERSTITIAL_ID=ca-app-pub-.../...
VITE_ADMOB_IOS_REWARDED_ID=ca-app-pub-.../...
VITE_ADMOB_IOS_INTERSTITIAL_ID=ca-app-pub-.../...
```

eklenir.

## UMP / gizlilik

AdMob Privacy & messaging bölümünde GDPR/UMP mesajı yayınlanmalıdır.

Uygulama reklam istemeden önce:

1. UMP consent bilgisini ister.
2. Form gerekiyorsa gösterir.
3. `canRequestAds=true` olmadan AdMob SDK'yı başlatmaz.

Native bridge ayrıca `tp:ad-privacy-options` event'i üzerinden UMP privacy options formunu açabilir. Ayarlar ekranındaki gizlilik butonu buna bağlanabilir.

## Rewarded SSV

AdMob rewarded ad unit ayarındaki Server-side verification callback URL:

`https://xwyfidtktauxivsosmex.supabase.co/functions/v1/rewarded-ad-claim`

Supabase Edge Function secret:

`ADMOB_REWARDED_AD_UNIT_IDS`

Virgülle ayrılmış gerçek rewarded ad unit ID'lerini içerir. Örnek:

```
ADMOB_REWARDED_AD_UNIT_IDS=ca-app-pub-AAA/ANDROID_REWARDED,ca-app-pub-BBB/IOS_REWARDED
```

Bu secret boşsa **gerçek SSV ödülü reddedilir**. Böylece başka bir AdMob hesabından üretilmiş geçerli Google imzalı callback TarlaPusula puanı açamaz.

## SSV güvenlik akışı

1. Uygulama rewarded reklamı hazırlarken Supabase user UUID'sini `user_id` olarak gönderir.
2. Her reklam için tek kullanımlık nonce üretilir; placement + nonce `custom_data` içinde gönderilir.
3. Google callback'i `rewarded-ad-claim` Edge Function'a GET olarak gelir.
4. Query string değiştirilmeden AdMob ECDSA P-256 / SHA-256 imzası doğrulanır.
5. AdMob public key'leri en fazla 23 saat cache'lenir.
6. Ad unit whitelist kontrol edilir.
7. Google `transaction_id` ile duplicate ödül engellenir.
8. Mevcut `tp_award_verified_ad_reward` RPC'si puanı server-side verir.
9. Native uygulama nonce ile sonucu kısa süre poll eder ve puan kutlamasını açar.

## Yayına çıkmadan önce

- örnek App ID'lerini gerçek AdMob App ID'leriyle değiştir
- 4 production ad unit ID'yi build env'e gir
- `VITE_ADMOB_TEST_MODE=false`
- `ADMOB_REWARDED_AD_UNIT_IDS` Supabase secret'ını gir
- AdMob'da UMP mesajını yayınla
- rewarded ad unit'lerde SSV callback URL'yi tanımla
- kendi canlı reklamına test amaçlı tıklama; test cihazı veya Google demo reklamı kullan
