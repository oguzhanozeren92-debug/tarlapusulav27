# TarlaPusula Release Readiness

Son kontrol: 2026-10-06

## Kaynak gerçek ve otomatik kontroller

- [x] GitHub `main` kanonik kaynak gerçek.
- [x] Web build GitHub Actions üzerinde derleniyor.
- [x] Android Capacitor senkronizasyonu + Debug APK derlemesi güncel kaynakta başarılı.
- [x] iOS Simulator derlemesi yakın tarihli aynı native yığında başarılı.
- [x] iOS cihaz hedefi için unsigned IPA üretimi yakın tarihli aynı native yığında başarılı.
- [x] Native CI işlerine concurrency/cancel-in-progress eklendi; hızlı commitlerde eski mobil derlemeler artık kuyruğu doldurmayacak.
- [x] Native kamera, konum, haptic, klavye/status bar/splash ve Android geri tuşu köprüleri mevcut.
- [x] Native push altyapısı mevcut: cihaz token kaydı, APNs/FCM taşıması, Android kanal/ikon ve bildirime tıklayınca uygulama içi yönlendirme.
- [x] PusulaPDF native dosya paylaşımı mevcut.
- [x] OAuth/deep-link native giriş dönüş köprüsü mevcut.
- [x] Sign in with Apple uygulama kodu, entitlement ve Xcode capability hazır; gerçek Apple Developer provider yapılandırması üyelik aktivasyonunu bekliyor.
- [x] iOS App Store release build APNs ortamı production olarak zorlanıyor.
- [x] iOS legacy armv7 cihaz kısıtı kaldırıldı; export compliance beyanı Info.plist içinde tanımlı.
- [x] İlk App Store sürümü gereksiz iPad/landscape inceleme yüzeyini azaltmak için iPhone + portrait hedefiyle sınırlandı.
- [x] Signed iOS workflow provisioning profile ve final IPA içinde Sign in with Apple entitlement'ını doğruluyor.

## Para kazanma ve abonelik

- [x] RevenueCat native SDK ve satın alma köprüsü mevcut.
- [x] Plan ekranı App Store / Google Play satın alma akışına bağlandı.
- [x] Uygulama yaşam döngüsünde abonelik entitlement yenilemesi mevcut.
- [x] Abonelik yönetimi / geri yükleme native akışta mevcut.
- [x] Abonelik ekranında otomatik yenileme açıklaması, Gizlilik Politikası ve Kullanım Koşulları bağlantıları mevcut.
- [x] Signed iOS/Android release workflow'ları RevenueCat public key eksikse fail ediyor.
- [x] Google AdMob rewarded + interstitial native köprüsü mevcut.
- [x] Android üretim reklam birimleri bağlı.
- [x] iOS üretim reklam birimleri bağlı.
- [x] Debug/native test derlemelerinde Google test reklamları zorlanıyor; üretim reklam kimliklerinin test sırasında yanlışlıkla kullanılması engelleniyor.
- [x] UMP reklam gizlilik seçenekleri Ücretsiz native kullanıcı için mevcut.
- [x] Rewarded reklam ödül doğrulaması için sunucu tarafı SSV akışı mevcut.
- [x] Signed Android release workflow'u Firebase `google-services.json` secret'ı eksikse veya package id `com.tarlapusula.app` ile eşleşmiyorsa fail ediyor.
- [x] iOS/Android CI, RevenueCat ve AdMob native pluginlerinin platforma gerçekten bağlandığını doğrulayan release guard içeriyor.

## Gizlilik ve güvenlik

- [x] Herkese açık Gizlilik Politikası mevcut: `/privacy-policy.html`.
- [x] Gizlilik Politikası Supabase, Cloudflare R2, Gemini/Cloudflare AI, AdMob/UMP, RevenueCat ve Vercel veri akışlarını açıklar.
- [x] Uygulama içi kalıcı hesap silme akışı mevcut: Ayarlar -> Hesabımı Sil.
- [x] Google Play için uygulama dışında erişilebilen self-service hesap silme sayfası mevcut: `/account-deletion`.
- [x] Hesap silme backend'i JWT doğrulamalı Edge Function üzerinden çalışır; kullanıcıya bağlı veriler ve kullanıcı dosyaları temizleme kapsamındadır.
- [x] Herkese açık Kullanım Koşulları mevcut: `/terms-of-use.html`.
- [x] Herkese açık mağaza Support URL adayı mevcut: `/support.html`.
- [x] iOS Privacy Manifest mevcut.
- [x] Supabase RLS ve güvenlik denetimleri düzenli çalıştırılabiliyor.
- [x] Storage privacy audit tamamlandı: kullanıcı fotoğraf/rapor bucket'ları private ve sahiplik kontrollü; public bucket'lar uygulama/CMS assetleriyle sınırlı.
- [x] 13 RLS/no-policy tablosu denetlendi: anon/authenticated CRUD yetkisi yok; service-role-only/internal kullanım doğrulandı.
- [!] Supabase Auth leaked-password protection Free planda açılamıyor; Supabase Pro+ özelliği olduğu için mevcut planda yayın bloklayıcısı olarak değerlendirilmiyor.
- [ ] KVKK Aydınlatma Metni, veri sorumlusunun gerçek kimlik/iletişim bilgileriyle yayımlanmalı.
- [!] Kullanım Koşulları teknik olarak yayımlandı; ancak halka açık ticari yayın öncesinde işletmeci/veri sorumlusu gerçek kimliği ve kalıcı kurumsal iletişim bilgisiyle hukuki metinler son kez kesinleştirilmeli.
- [x] SECURITY DEFINER fonksiyonları tek tek denetlendi. Trigger RPC dış erişimi kapatıldı; PusulaPDF sahiplik/Premium kontrolü ve puan RPC server doğrulaması sertleştirildi. Kalan authenticated SECURITY DEFINER RPC'ler bilinçli, kullanıcı-sınırlı gateway olarak belgelendi.

## Mağaza metadata hazırlığı

- [x] Türkçe mağaza listeleme metinleri hazırlandı (`docs/STORE_LISTING_TR_2026-10-06.md`).
- [x] Store submission adım adım checklist hazırlandı (`docs/STORE_SUBMISSION_CHECKLIST_2026-10-06.md`).

## Mağaza yayını için kalan gerçek bloklayıcılar

- [ ] Apple Developer / App Store Connect üzerinde gerçek uygulama kaydı, Bundle ID, sertifika/provisioning ve imzalı archive/TestFlight akışı tamamlanmalı.
- [ ] Google Play Console üzerinde gerçek uygulama kaydı, signing/upload key ve imzalı AAB üretimi tamamlanmalı.
- [ ] RevenueCat ürünleri App Store Connect ve Google Play ürün kimlikleriyle production ortamında eşleştirilmeli ve gerçek sandbox/test satın alımı doğrulanmalı.
- [x] App Store Privacy + Google Play Data Safety cevap taslağı gerçek uygulama/SDK veri akışlarıyla hazırlandı (`docs/STORE_PRIVACY_DECLARATIONS_2026-10-06.md`). Console'da Publish/Submit Apple/Google hesap adımları açılınca yapılacak.
- [ ] KVKK Aydınlatma Metni gerçek veri sorumlusu kimlik/iletişim bilgileriyle tamamlanmalı ve uygulama içinden erişilebilir hale getirilmeli. Kullanım Koşulları abonelik ekranından erişilebilir durumda.
- [ ] En az bir gerçek Android ve bir gerçek iOS cihazda oturumlu uçtan uca smoke turu yapılmalı.
- [ ] Push notification gerçek cihaz tokenı ile arka plan/kapalı uygulama senaryosunda doğrulanmalı.
- [ ] Rewarded ve interstitial reklamlar gerçek cihazda TEST reklamlarıyla akış bazında doğrulanmalı.
- [ ] Satın alma / geri yükleme / plan entitlement değişimi gerçek sandbox hesaplarıyla doğrulanmalı.

## Operasyonel notlar

- Vercel production'da Gizlilik Politikası, Kullanım Koşulları ve hesap silme URL'leri 200 OK. Yeni `/support.html` kodda hazır ancak Hobby plan günlük 100 API deployment limiti dolduğu için latest `main` henüz production'a deploy edilemedi; limit sıfırlandıktan sonra yeniden deploy edilip Support URL doğrulanmalı.
- Supabase Free planda leaked-password protection için ücretli plana geçiş zorunluluğu vardır; yalnız bu özellik için şu aşamada plan yükseltme kararı alınmadı.
- Fiziksel Android cihaz olmaması geliştirmeyi durdurmuyor; GitHub Actions APK üretebiliyor. Ancak halka açık mağaza yayını öncesinde fiziksel cihaz doğrulaması yine zorunlu kabul ediliyor.

## Gerçek cihaz smoke turu

1. Kayıt / giriş / oturum kalıcılığı
2. Onboarding -> yeni tarla ekleme
3. Ada-parsel ve Çizimle Ekle akışları
4. Ana harita -> uydu -> tam ekran -> geçmiş tarih
5. Hava -> sulama kararı
6. Pusula AI fotoğraf analizi
7. Ücretsiz plan limitleri, Pusula puanı ve rewarded reklam
8. Plus/Premium satın alma, geri yükleme ve entitlement değişimi
9. Premium özellik kilitleri
10. Piyasa Fiyatları / Gündem / Bilgi Rehberi
11. Görevler / Bildirimler
12. Uygulama kapalıyken push -> bildirime dokun -> doğru hedef ekran
13. Hata bildirimi
14. PusulaPDF oluşturma ve native paylaşma
15. Uygulamayı kapat/aç -> seçili tarla ve oturum korunuyor mu
16. Android geri tuşu, klavye, kamera, konum izinleri
17. Reklam gizlilik tercihlerini tekrar açma

## Karar

Teknik web beta ve native CI açısından **GO**.

Halka açık App Store / Google Play ticari yayını için kod tarafındaki ana köprüler hazırdır; kalan kritik işler artık ağırlıklı olarak **mağaza imzalama/console kurulumu, hukuki kimlik metinleri ve gerçek cihaz sandbox smoke testleri**dir.
