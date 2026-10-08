# TarlaPusula Release Closure — 2026-10-08

Bu belge, uygulama kodu ile canlı Supabase/Vercel servislerinin son yayın kapanış kontrolünü özetler.

## Kapatılan işler

- Harita katmanları için son başarılı katmanı koruyan recovery/fallback sistemi aktif.
- Tarlaya girilebilirlik, sulama dağılımı, su kıtlığı, mikroiklim, afet toparlanma ve çoklu stres aynı karar omurgasına bağlı.
- PusulaPDF tek A4 premium dashboard düzenine geçirildi; saha/uydu fotoğrafları, QR alanları ve sosyal medya alt bandı aynı sayfada.
- İçerik görsel motoru v5 fallback ile güçlendirildi. 2026-10-08 canlı kontrolde yayınlanmış içeriklerde görselsiz kayıt sayısı 0'a indirildi.
- Yeni yayınlarda kapak görselini zorunlu kılan veritabanı trigger'ı aktif.
- TOBB ürün fiyatı ve TZOB gübre fiyatı için güvenli scheduler eklendi. EPDK yakıt scheduler'ı mevcut.
- Sosyal giriş ekranı Supabase provider durumunu canlı okuyor; devre dışı provider bozuk buton olarak gösterilmiyor.
- Native OAuth dönüş adresi `https://tarlapusulav27.vercel.app/` olarak Vercel ve release workflow'larında sabitlendi.
- Release readiness probe eklendi; dış servis secret/provider eksikleri tek kayıtta raporlanabiliyor.

## Canlı servis durumu — son probe

- Google OAuth: açık.
- Facebook OAuth: provider tarafında kapalı.
- Apple OAuth: provider tarafında kapalı.
- Web Push VAPID: yapılandırılmış.
- Android FCM server credentials: eksik.
- iOS APNs server credentials: eksik.
- RevenueCat backend secret API key: eksik.
- RevenueCat webhook auth secret: eksik.

Bu dört eksik grup uygulama kodundan üretilemez; ilgili sağlayıcı hesaplarından gerçek credential gerekir. Kod, deep-link ve backend uçları hazırdır.

## Canlı veri doğrulaması

2026-10-08 kapanış turunda:

- Ürün fiyatları tekrar senkronlandı ve günlük scheduler devreye alındı.
- Gübre fiyatı scheduler devreye alındı.
- Yakıt fiyatı günlük scheduler çalışıyor.
- Yayınlanmış içeriklerde kapak görseli zorunluluğu doğrulandı.
- PusulaPDF job kuyruğundaki önceki 23 işin 23'ü `ready` durumundaydı.

## Yayın için dış hesapta tamamlanması gerekenler

1. Supabase Auth > Facebook: Meta App ID + App Secret + callback tanımla ve provider'ı aç.
2. Supabase Auth > Apple: Services ID + Apple secret tanımla ve provider'ı aç.
3. Supabase Edge Function secrets: `REVENUECAT_SECRET_API_KEY` ve `REVENUECAT_WEBHOOK_AUTH` tanımla; RevenueCat webhook'unu `send-due-reminders` endpointine bağla.
4. Supabase Edge Function secrets: Android için FCM service account; iOS için APNs Key ID, Team ID, private key ve bundle ID tanımla.
5. App Store Connect / Google Play ürünlerini RevenueCat offering/entitlement kimlikleri `plus` ve `premium` ile eşleştir.
6. Gerçek cihazda satın alma, restore, push, Google/Facebook/Apple giriş ve rewarded ad smoke testini çalıştır.

Bu maddeler credential/store hesabı gerektirdiği için repository veya Supabase kodu tarafından otomatik oluşturulamaz.
