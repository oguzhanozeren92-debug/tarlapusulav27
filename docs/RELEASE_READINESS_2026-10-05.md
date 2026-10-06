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

## Para kazanma ve abonelik

- [x] RevenueCat native SDK ve satın alma köprüsü mevcut.
- [x] Plan ekranı App Store / Google Play satın alma akışına bağlandı.
- [x] Uygulama yaşam döngüsünde abonelik entitlement yenilemesi mevcut.
- [x] Abonelik yönetimi / geri yükleme native akışta mevcut.
- [x] Google AdMob rewarded + interstitial native köprüsü mevcut.
- [x] Android üretim reklam birimleri bağlı.
- [x] iOS üretim reklam birimleri bağlı.
- [x] Debug/native test derlemelerinde Google test reklamları zorlanıyor; üretim reklam kimliklerinin test sırasında yanlışlıkla kullanılması engelleniyor.
- [x] UMP reklam gizlilik seçenekleri Ücretsiz native kullanıcı için mevcut.
- [x] Rewarded reklam ödül doğrulaması için sunucu tarafı SSV akışı mevcut.

## Gizlilik ve güvenlik

- [x] Herkese açık Gizlilik Politikası mevcut: `/privacy-policy.html`.
- [x] iOS Privacy Manifest mevcut.
- [x] Supabase RLS ve güvenlik denetimleri düzenli çalıştırılabiliyor.
- [!] Supabase Auth leaked-password protection Free planda açılamıyor; Supabase Pro+ özelliği olduğu için mevcut planda yayın bloklayıcısı olarak değerlendirilmiyor.
- [ ] KVKK Aydınlatma Metni, veri sorumlusunun gerçek kimlik/iletişim bilgileriyle yayımlanmalı.
- [ ] Kullanım Koşulları / hizmet şartları, işletmeci kimliği ve uyuşmazlık/iletişim bilgileri kesinleştikten sonra yayımlanmalı.
- [ ] SECURITY DEFINER uyarıları fonksiyon bazında denetlenmeli; topluca yetki kaldırılmamalı çünkü bazı RPC'ler istemci akışının bilinçli parçası.

## Mağaza yayını için kalan gerçek bloklayıcılar

- [ ] Apple Developer / App Store Connect üzerinde gerçek uygulama kaydı, Bundle ID, sertifika/provisioning ve imzalı archive/TestFlight akışı tamamlanmalı.
- [ ] Google Play Console üzerinde gerçek uygulama kaydı, signing/upload key ve imzalı AAB üretimi tamamlanmalı.
- [ ] RevenueCat ürünleri App Store Connect ve Google Play ürün kimlikleriyle production ortamında eşleştirilmeli ve gerçek sandbox/test satın alımı doğrulanmalı.
- [ ] App Store / Play Console veri güvenliği-gizlilik formları, uygulamanın gerçek veri akışlarıyla doldurulmalı.
- [ ] KVKK Aydınlatma Metni ve Kullanım Koşulları uygulama içinden erişilebilir hale getirilmeli.
- [ ] En az bir gerçek Android ve bir gerçek iOS cihazda oturumlu uçtan uca smoke turu yapılmalı.
- [ ] Push notification gerçek cihaz tokenı ile arka plan/kapalı uygulama senaryosunda doğrulanmalı.
- [ ] Rewarded ve interstitial reklamlar gerçek cihazda TEST reklamlarıyla akış bazında doğrulanmalı.
- [ ] Satın alma / geri yükleme / plan entitlement değişimi gerçek sandbox hesaplarıyla doğrulanmalı.

## Operasyonel notlar

- Vercel'in son otomatik deployment denemelerinden biri build-rate-limit nedeniyle reddedildi. Bu durum kod derleme hatası değildir; GitHub build ve Android native build aynı kaynakta başarılıdır. Web production güncelliği ayrıca kontrol edilmelidir.
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
