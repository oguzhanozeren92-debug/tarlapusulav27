# Bitki su tüketimi verisi

**Kaynak:** T.C. Tarım ve Orman Bakanlığı TAGEM ve DSİ Genel Müdürlüğü, *Türkiye'de Sulanan Bitkilerin Bitki Su Tüketimleri*, Ankara 2017 (600 sayfa).

## Dosyalar
- `public/data/bitki-su-tuketimi.json` — uygulamanın kullandığı veri (1,2 MB, kart açılınca bir kez indirilir).
- `docs/veri/bitki_su_tuketimi_ETc.csv` — istasyon × ürün, 36 adet 10 günlük dönem ETc (mm) ve sezon toplamı.
- `docs/veri/istasyon_ETo_yagis.csv` — istasyon başına 36 dönem referans su tüketimi (ETo) ve uzun yıllar yağışı.

## İçerik
- 259 meteoroloji istasyonu: ad, il, enlem, boylam, rakım, iklim bölgesi (BLG_01–29).
- Her istasyon için 36 dönem ETo ve yağış (rehber Bölüm 10 ve 11).
- Her istasyonda yetiştirilen ürünler için 36 dönem ETc (Bölüm 12), 126 farklı ürün adı.
- Bir yıl 36 döneme ayrılır: her ayın 1-10, 11-20, 21-son günleri.

## Okuma ve tamamlama
- 239 istasyonun ETc tabloları PDF'ten doğrudan okundu (`kaynak: "rehber"`, 7.668 kayıt). Satır toplamları rehberdeki toplamla karşılaştırıldı; tutmayan satırlar atıldı.
- PDF'te 20 istasyonun ETc sayfaları üst üste basılmış (Arpaçay, Ereğli-Konya, Erzincan, Göztepe, Horasan, Ilgaz, İspir, Karabük, Kars, Kayseri, Kütahya, Malazgirt, Muş, Sarıkamış, Suşehri, Şebinkarahisar, Tercan, Tortum, Trabzon, Varto). Bunlar ve okunamayan birkaç satır, rehberin kendi verileriyle **ETc = Kc × ETo** yöntemiyle hesaplandı (`kaynak: "hesap"`, 515 kayıt):
  - Kc1/Kc3/Kc4: Bölüm 9 (istasyon × ürün, 12.130 satır),
  - ekim-dikim zamanı ve 4 gelişme dönemi uzunluğu: Bölüm 8 (iklim bölgesi × ürün),
  - FAO-56 tek katsayı eğrisi (başlangıç sabit, gelişmede doğrusal artış, orta dönem sabit, geç dönemde doğrusal azalış), günlük dağıtılıp 10 günlük dönemlere toplandı.
  - Doğrulama: aynı yöntem rehberde tablosu okunan 7.658 kayıtla karşılaştırıldı; sezon toplamında medyan fark %0,9.

## Uygulamadaki hesap (rehber Bölüm 5)
- Etkili yağış Pe = yağışın %80'i.
- Yüzey ve yağmurlama: net sulama dn = ETc − Pe (her 10 günlük dönemde, negatifse 0).
- Damla: T = ETc × Ps/85 (Ps: tarla bitkisi/sebze %80, bağ ve sık dikim meyve %75, geniş dikim meyve %70), dn = T − Pe.
- Toplam sulama suyu dt = dn / (Ea × Ec); basınçlı sistemlerde Ec = 0,98. Ea: taşınabilir yağmurlama 0,70, sabit 0,75, lineer/pivot 0,80, mikro yağmurlama 0,85, yüzey damla 0,90, toprak altı damla 0,95. Yüzey (salma/karık/tava) için rehber randıman vermez; uygulama net ihtiyacı gösterir.
- 1 mm = dekara 1 m³ = 1 ton su.

Değerler uzun yıllar ortalamasıdır ve bitkinin susuz kalmadığı standart koşulları anlatır.
