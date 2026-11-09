# TarlaPusula: Makale ve Bilgi Rehberi motorları

## Üretim akışı (9 Kasım 2026)

- Akademik makale: `research-harvest` → `research-content-scan` → `content-reprocess` → admin incelemesi.
- Bilgi Rehberi: `content-harvest` → `knowledge-content-scan` → `content-reprocess` (gerektikçe) → admin incelemesi.
- Üretimde Supabase projesi: `xwyfidtktauxivsosmex`. Cron görevleri: `tarlapusula-research-harvest` (6 saatte), `tarlapusula-knowledge-harvest` (saatlik; kaynak tarama aralığına göre).
- İki router fonksiyonu (`research-harvest`, `content-harvest`) ayrıca GitHub'da saklanır. Bu fonksiyonların cron token doğrulaması kendi kodlarındadır; canlı ortamdaki `verify_jwt=false` ayarı korunmalıdır. Tarayıcı üzerinden kullanıma yetki açmayın.
- Alt tarayıcılar `research-content-scan` ve `knowledge-content-scan` için canlı ortamda `verify_jwt=true` kullanılır. İlgili router, alt servise yetkili Authorization başlığını iletir.

## Kaynak tarama ve güvenlik

- OpenAlex: 2010 ve sonrası yayın filtresi, konu dönüşümlü keşif. Güncel DOI/yayın tarihi ve alan ilgililiği kontrol edilir.
- Crossref: `select=DOI,title,abstract,published,URL` (Crossref /works isteğinde `language` select desteklenmez); `filter=type:journal-article,from-pub-date:2010-01-01`.
- Semantic Scholar hız sınırlaması (429) halinde OpenAlex yedekli tarama çalışır. API hata sayısını izleyin; boş taramayı otomatik başarı saymayın.
- Bilgi Rehberi: UC IPM kaynak seçimi 3 uygun ürüne döngüsel ilerler; ana kategori sayfaları rehber olarak aday yapılmaz. Önceden reddedilmiş/onaylanmış aynı kaynak bağlantıları tekrar indirilmez. Seed HTML önbelleği tek tarama boyunca kullanılır.
- İçerikler kaynak bağlantısını korur; izinsiz tam metin kopyalanmaz. Yerel Türkiye uygulamaları için yabancı kaynakların ilaç/doz önerileri doğrudan aktarılmaz, doğrulama gerekir.
- İçerik işlenmesi hata verirse makale `held` durumunda kalmalı; otomatik `rejected` ve otomatik `published` yapılmamalı. Editörün reddettiği içerik, manuel karar olmadan yeniden yayın kuyruğuna alınmamalıdır.

## Canlı kaynak kaydı

9 Kasım 2026 tarihinde UC IPM'nin tarımsal sayfa dizini `https://ipm.ucanr.edu/agriculture/` aktif `guide` kaynağı olarak eklendi; `language=en`, `country=US`, `source_type=html`, `scan_frequency_hours=48`. İleride farklı veritabanına kurulum yapılırsa kaynak kaydı ayrıca oluşturulmalıdır.

## Doğrulama

1. Supabase Edge Function HTTP yanıt kodları: `200`; `401`, `429` ve `546` ayrı izlenmelidir.
2. `content_sources.last_scanned_at` tazelenmeli ve `metadata.last_guide_qualified / last_guide_created` alanları kontrol edilmelidir.
3. `content_candidates` için `article/guide` türünde `pending`, `held`, `rejected` sayıları ile son üretim tarihi incelenmelidir; `held` hata değil, kalite/görsel/çeviri kapısı da olabilir.
4. `content_items.status='published'` gerçek yayın sayısını gösterir; yalnızca aday bulunması yayın olarak sunulmamalıdır.
5. Otomatik işlenen içeriğin kaynağı, Türkçe kalitesi, saha faydası, telif ve güvenlik kontrolü admin incelemesinde korunmalıdır.
