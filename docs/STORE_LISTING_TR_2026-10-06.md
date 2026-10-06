# TarlaPusula — Mağaza Listeleme Metinleri (TR)

Son güncelleme: 2026-10-06

Bu metinler ilk App Store / Google Play yayını için release-freeze kapsamındaki gerçek özellikleri anlatır. Henüz production doğrulaması yapılmamış bir özellik mağaza metnine eklenmemelidir.

## Temel metadata

- App name: **TarlaPusula**
- Bundle / package: **com.tarlapusula.app**
- Primary language: **Türkçe**
- Önerilen Apple primary category: **Productivity**
- Alternatif secondary category: **Utilities**
- Google Play önerilen category: **Productivity**
- Content model: tarımsal karar desteği; kesin teşhis veya garanti edilmiş tarımsal sonuç iddiası yok.

Apple app name ve subtitle üst sınırı 30 karakterdir.
Google Play app name 30, short description 80, full description 4000 karakterdir.

## Apple subtitle

**Tarlanı izle, doğru karar ver**

29 karakter.

## Apple promotional text

**Tarlanı uydu, hava ve Pusula AI ile tek yerden takip et. Değişimleri gör, kayıtlarını tut, riskleri zamanında fark et.**

Promotional text 170 karakter sınırının altındadır.

## Apple keywords

`tarım,çiftçi,uydu,ndvi,sulama,hava,bitki,hasat,gübreleme,ürün,parsel`

- 100-byte sınırının altında.
- Rakip marka/app adı içermez.
- App name'deki TarlaPusula kelimesini tekrar etmez.

## Google Play kısa açıklama

**Tarlanı uydu, hava ve Pusula AI ile takip et; doğru zamanda doğru karar ver.**

76 karakter.

## Ortak tam açıklama

**Tarlanı tek ekrandan takip et.**

TarlaPusula; tarla kayıtlarını, uydu göstergelerini, hava verilerini ve saha gözlemlerini bir araya getiren tarımsal karar destek uygulamasıdır.

**Uydu ile tarlanı izle**
Bitki gelişimindeki değişimleri uydu katmanları ve tarla geçmişiyle takip et. Uygun veriler bulunduğunda NDVI ve diğer tarımsal göstergelerle tarlanın farklı dönemlerini karşılaştır.

**Hava ve tarla bağlamını birlikte gör**
Hava tahminlerini, tarla konumunu ve üretim kayıtlarını aynı bağlamda değerlendir. Kritik değişimler için bildirimlerden yararlan.

**Pusula AI ile saha fotoğraflarını değerlendir**
Bitki veya sorunlu alan fotoğrafını Pusula AI'a gönder. Sonuçlar; ürün, tarla, sezon ve mevcut verilerle birlikte değerlendirilerek anlaşılır bir karar desteğine dönüştürülür.

**Kayıtlarını tek yerde tut**
Sulama, gübreleme, ilaçlama, saha kontrolü, toprak analizi ve diğer tarla işlemlerini kaydet. Tarla geçmişini daha düzenli takip et.

**Pusula ile önemli olana odaklan**
Tarla verilerindeki eksikleri, değişimleri ve takip edilmesi gereken noktaları daha kolay gör. Görevler ve bildirimler ilgili tarla ekranına yönlendirir.

**Tarım gündemi ve bilgi içerikleri**
Tarım gündemini ve üreticiye yönelik bilgi içeriklerini uygulama içinden takip et.

**Planlar**
TarlaPusula Ücretsiz, Plus ve Premium plan seçenekleri sunabilir. Güncel özellik kapsamı ve abonelik fiyatları satın alma ekranında App Store veya Google Play tarafından gösterilir. Ücretli abonelikler mağaza hesabından yönetilir ve uygun olduğunda satın alımlar geri yüklenebilir.

TarlaPusula bir tarımsal karar destek aracıdır. Uydu, hava, yapay zekâ ve diğer analizler kesin teşhis, laboratuvar sonucu, resmî reçete veya yetkili uzman görüşünün yerine geçmez. Kritik saha uygulamalarında resmî mevzuat, ürün etiketi, saha gözlemi ve gerektiğinde yetkili uzman doğrulaması kullanılmalıdır.

## Support / legal URLs

- Privacy Policy:
  https://tarlapusulav27.vercel.app/privacy-policy.html
- User Privacy Choices / Account Deletion:
  https://tarlapusulav27.vercel.app/account-deletion
- Terms:
  https://tarlapusulav27.vercel.app/terms-of-use.html
- KVKK Aydınlatma:
  https://tarlapusulav27.vercel.app/kvkk-aydinlatma.html
- Support:
  https://tarlapusulav27.vercel.app/support.html
  - production deploy pending Vercel daily-limit reset

## App Review / Play Review notes taslağı

Reviewer notuna ürün özelliklerini abartmadan şu bağlam verilebilir:

- TarlaPusula requires an account for personalized field records.
- Camera permission is used only when the user chooses to capture a field/plant photo for analysis or evidence.
- Location permission is used for field location and location-dependent weather/satellite context.
- Notifications are optional and used for field-related reminders and alerts.
- Free users may see AdMob ads; Plus/Premium users do not see ads.
- Subscriptions are handled by App Store / Google Play via RevenueCat entitlement validation.
- Account deletion is available in Settings → Hesabımı Sil and at the public account deletion URL.

**Review account credentials must be added only when a dedicated review/test account exists. Do not put a personal password in this repository.**

## Subscription display-name taslağı

Mağaza tarafı açıldığında önerilen ürün yapısı:

- TarlaPusula Plus — Aylık
- TarlaPusula Plus — Yıllık
- TarlaPusula Premium — Aylık
- TarlaPusula Premium — Yıllık

Önerilen kalıcı product ID'ler (henüz mağazada oluşturulmadı):

- `com.tarlapusula.app.plus.monthly`
- `com.tarlapusula.app.plus.annual`
- `com.tarlapusula.app.premium.monthly`
- `com.tarlapusula.app.premium.annual`

RevenueCat tarafındaki offering kimlikleri mevcut kodla:
- `plus`
- `premium`

Paketler:
- monthly
- annual

Yıllık plan için ürün kararı: aylığa göre yaklaşık %20 avantaj.
Gerçek fiyat rakamları mağaza ürünleri oluşturulmadan bu dosyaya sabit yazılmamalıdır.
