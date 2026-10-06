# TarlaPusula — Google Play Closed Test Plan

Son güncelleme: 2026-10-06

## Neden gerekli?

TarlaPusula'nın Google Play hesabı yeni kişisel geliştirici hesabıdır.

Google Play'in güncel kuralına göre 13 Kasım 2023 sonrasında oluşturulan kişisel hesaplarda production erişimi için:

- closed test zorunlu,
- minimum **12 tester**,
- testerlar en az **14 gün kesintisiz opt-in** kalmalı,
- süre tamamlandıktan sonra ayrıca **Apply for production** başvurusu yapılmalı.

Resmi kaynak:
https://support.google.com/googleplay/android-developer/answer/14151465

## Tester hedefi

Minimum 12 olmasına rağmen operasyonel hedef:

- **15–18 tester davet et**
- en az 12 kişinin 14 gün boyunca opt-in kalmasını garanti etmeye çalış
- testerların gerçekten uygulamayı açması ve temel akışları denemesi tercih edilir

Bir tester testten çıkarsa o kişi için kesintisiz süre bozulabilir. Bu nedenle tam 12 kişiyle başlanmamalı.

## Android cihaz doğrulaması açılır açılmaz yapılacak sıra

1. Play Console device verification tamamla.
2. Uygulama kaydını / app setup adımlarını tamamla.
3. Signed production-like AAB üret.
4. Önce Internal testing'e yükle ve temel installation smoke yap.
5. Closed testing track oluştur.
6. Tester listesi / Google Group ekle.
7. Opt-in URL'sini testerlara gönder.
8. En az 12 tester opt-in olduktan sonra 14 günlük pencereyi takip et.
9. Test boyunca kritik düzeltmeler gerekiyorsa yeni AAB yüklenebilir; testerlar closed track'te kalmalı.
10. 14 gün tamamlanınca Dashboard → Apply for production.

## Testerlara verilecek kısa görev listesi

Her testerın hepsini yapması şart değil; mümkün olduğunca farklı akışların kullanılması hedeflenir.

### Gün 1 — Kurulum ve hesap
- uygulamayı Google Play closed-test bağlantısından kur
- açılış / giriş / kayıt ekranını kontrol et
- onboarding'i tamamla
- uygulamayı kapat-aç; oturum korunuyor mu bak

### Tarla akışı
- tarla ekleme ekranını aç
- konum / harita akışını dene
- mevcut tarlayı görüntüle
- ana harita ve uydu kartlarını aç

### Hava / karar desteği
- hava ekranını aç
- bir tarla için Pusula kartlarını incele
- görev / bildirim ekranını aç

### Kamera / fotoğraf
- kamera izni akışını dene
- test için uygun bir tarla/bitki fotoğrafı seç
- fotoğraf analiz ekranının açıldığını doğrula

### Bildirim
- bildirim iznini aç
- uygulama kapatılıp tekrar açıldığında bildirim ayarının korunmasını kontrol et

### Free plan / reklam
- Free kullanıcı olarak uygun reklam giriş noktasını aç
- test ortamında rewarded/interstitial akışında çökme veya takılma var mı kontrol et

### Abonelik
Closed testte sandbox/test satın alma hazır olduğunda:
- Plus/Premium ekranını aç
- satın alma ekranının mağazaya yönlendiğini doğrula
- satın alımları geri yükleme akışını dene

### Hesap ve destek
- Ayarlar ekranını aç
- Gizlilik Politikası bağlantısını kontrol et
- hata bildir ekranını aç
- Hesabımı Sil ekranının açıldığını kontrol et
- gerçek hesabı silme sadece özellikle ayrılmış test hesabında denenmeli

## Tester geri bildirim şablonu

Tester aşağıdaki 5 şeyi yazarsa production access başvurusunda da işimize yarar:

1. Telefon markası/modeli
2. Android sürümü
3. Denediği ana ekranlar
4. Karşılaştığı hata / takıldığı nokta
5. Genel kullanım yorumu / anlaşılmayan bölüm

Örnek:

> Pixel 8 / Android 16. Kayıt, tarla ekranı, harita, hava ve fotoğraf analizini denedim. Harita açıldı, kamera izni çalıştı. Görevler ekranında ilk açılış biraz yavaş geldi. Genel akış anlaşılır.

## Test süresince release disiplini

Closed test başladığında:

- yeni büyük özellik eklenmez,
- yalnız P0/P1 hata düzeltmeleri,
- crash / beyaz ekran / login / satın alma / push / izin / harita blockerları öncelikli,
- her Android yüklemede `versionCode` artırılır,
- testerların opt-in grubunu değiştirme,
- closed test track'i kapatma veya tester listesini gereksiz sıfırlama.

## Production access başvurusunda anlatılacaklar

Google başvuruda test sürecini ve production readiness'i sorabilir.

TarlaPusula için gerçek cevap çerçevesi:

- Tarımsal karar destek uygulaması olduğu için temel kullanıcı akışları fiziksel cihazlarda test edildi.
- Login/onboarding, field management, map/satellite, weather, camera/photo analysis, notifications, ad privacy, subscription/restore ve account deletion akışları kontrol edildi.
- Tester geri bildirimlerine göre bulunan release-blocking hatalar düzeltildi.
- Privacy Policy, account deletion URL, Data Safety declaration ve store metadata hazırlandı.
- Backend authorization ve Supabase SECURITY DEFINER fonksiyonları release öncesi ayrıca denetlendi.

Bu metin gerçek test bittikten sonra tester feedback ile güncellenecek; yapılmamış test yapılmış gibi yazılmayacak.

## Takip tablosu

| Tester | Opt-in tarihi | 14 gün tamamlanma | Cihaz | Ana akış test edildi | Feedback geldi | Testten çıktı mı |
|---|---|---|---|---|---|---|
| 01 | — | — | — | — | — | — |
| 02 | — | — | — | — | — | — |
| 03 | — | — | — | — | — | — |
| 04 | — | — | — | — | — | — |
| 05 | — | — | — | — | — | — |
| 06 | — | — | — | — | — | — |
| 07 | — | — | — | — | — | — |
| 08 | — | — | — | — | — | — |
| 09 | — | — | — | — | — | — |
| 10 | — | — | — | — | — | — |
| 11 | — | — | — | — | — | — |
| 12 | — | — | — | — | — | — |
| 13 | — | — | — | — | — | — |
| 14 | — | — | — | — | — | — |
| 15 | — | — | — | — | — | — |

## Release timeline etkisi

Android device verification ve Play app setup tamamlanmadan closed-test sayacı başlatılamaz.

Bu nedenle Android tarafındaki gerçek minimum takvim:

**Play doğrulama → closed test başlat → 14 gün → production access başvurusu → Google değerlendirmesi → production release**

Google production-access başvuru incelemesinin genellikle 7 gün veya daha kısa sürebildiğini, ancak daha uzun sürebileceğini belirtiyor.
