# TarlaPusula: Pusula birleşik asistan tasarımı (9 Kasım 2026)

## Vizyon
Pusula sayfa başına ayrı konuşan sabit ipuçlarından ibaret olmayacak.
Alan adına, kayıtlı ürüne, güncel uydu/radar/toprak/iklim delillerine,
takvim ve depo durumuna, yayınlanmış haber/makalelere dayanacak.
Her mesaj açık bir "ne görüldü / neden önemli / ne yapabilirim" yapısı taşıyacak.

## Uygulanan ilk adım
- `useHomePusula`: iki veya daha fazla gerçek katmanın çıktısı varsa birleşik sentezi öne al.
  Tek açık katmandan gelen "önemli alan" diğer katmanlar doğrulamış gibi sunulamaz.
- `HomeScreen`: merkezi HomeDecisionEngine'in önceliği korunur; ikincil yorum
  yalnız besin güvenlik filtresinden geçmiş `fieldSynthesis` verisini kullanır.
- `PusulaGuide`: Tarla, tarih, gözlem, yapılabilecek adım, değerlendirilen veri
  kaynakları bölümlere ayrıldı; uzun metinler okunur aralıklara bölündü.
- `calendarAction`: yalnız veriyle desteklenmiş kontrol/uyarıdan; tarih kullanıcıya
  sorulur, `addQuickCalendarReminder` ancak açık dokunuşla çağrılır.
- `WeatherHubScreen`: tarih/kaynak bilgisi ve don şüphesinde saha kontrolü önerisi.

## Sıradaki entegrasyonlar — henüz üretimde doğrulanmadı

### 1. Kesin olmayan riskler için kontrollü uyarı akışı
- Don tahmini: doğru tarla koordinatları, 48 saatlik min. sıcaklık, veri zamanı,
  tercih edilen birim ve risk eşiği kaydedilmeli.
- Ürün gelişim dönemi bilinmiyorsa zarar kesinmiş gibi anlatma; "don riski"
  yerine "sıcaklık düşüşü olabilir" ve yerinde kontrol.
- `app_notifications` + yerleşik web/native push kuyruğunu kullan.
  En az `user_id,field_id,risk_type,forecast_window` içeren dedupe_key.
- Kritik bildirimler tekrara boğmayacak, gerçek güncelleme ve kullanıcının push
  tercihleriyle uyumlu olacak; push hatası durumunda uygulama içi kayıt korunacak.
- Geçmiş/başka tarla riskini kullanma; aynı risk normalleştiğinde işaretle.

### 2. Ürünle eşleşen makale ve haber duyuruları
- Sadece `published` durumundaki, lisans/kaynak/kalite kontrolü geçmiş kayıtlar.
- Başlık anahtar sözcüğüne tek başına güvenme: `crop taxonomy + topic + region`
  eşleştirmesi; ilgili değilse bildirim çıkarma.
- Tek yeni içerik için kullanıcı/tarla başına tek bildirim, 7 günlük tekrar dedupe.
- Pusula metni: "Kayıtlı ürünün ... ile ilgili yeni ... yayımlandı" ve
  "İncele" bağlantısı; kaynağa gitmek mümkün olsun.
- Kullanıcının haber bildirim tercihi ile sessiz saatleri kontrol et.

### 3. Çapraz modül davranışı
- `field_id` ortak bağlam: Hava, Harita, Toprak, Depo, Takvim, Gündem,
  Bilgi Rehberi; favori tarla ile ekranın gerçek seçili tarlası karışmayacak.
- Her kaynakta `collectedAt`, `validUntil`, `confidence`, `source`.
- Tek olay birden fazla yerde kendi açıklamasıyla tekrarlanmaz; Pusula
  olay özetini hazırlar, ilgili modüle derin bağlantı verir.
- Günlük özet yerine olay tabanlı tetikleyiciler: don riski, görev yaklaşması,
  veri değişimi, yayımlanmış içerik. Uygun olmayan şeyler sessiz kalır.
- Yeni motor klinik/tarımsal tanı uydurmamalı; uydu işareti saha kontrolü gerektirir.

## Kabul ölçütleri
1. NDVI tek başına anomali gösterirse, diğer katmanların bunu doğruladığı iddia edilmez.
2. Her mesaj doğru tarla ve tarih başlığıyla okunur paragraflarda görüntülenir.
3. Kanıtlı bir saha kontrolü tek onaylı Takvim girişine dönüşür (idempotent).
4. Don riski bildirimi hem Pusula hem uygulama içi gelen kutusunda görünür;
   web/iOS push ayrıca gerçek cihazda doğrulanmadan "hazır" sayılmaz.
5. Yeni haber/makale yalnız ürünle gerçekten eşleşirse görünür; içerik
   yayımlanmadıysa veya eskiyse bildirim üretilmez.
