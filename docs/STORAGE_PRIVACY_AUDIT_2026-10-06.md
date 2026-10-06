# TarlaPusula Storage Privacy Audit — 2026-10-06

## Sonuç

Supabase Storage bucket görünürlüğü ve object RLS politikaları release öncesi kontrol edildi.

### Kullanıcı verisi içeren private bucket'lar

Aşağıdaki bucket'lar `public = false` ve kullanıcı/admin sahiplik kurallarıyla korunuyor:

- `field-activity-photos`
- `field-map-layers`
- `field-observation-photos`
- `issue-report-attachments`
- `knowledge-documents`
- `pesticide-labels`
- `soil-analysis`

Kullanıcıya ait tarla fotoğrafı, saha gözlemi, harita katmanı, hata ekran görüntüsü ve toprak analizi dosyaları public bucket'ta tutulmuyor.

### Public asset bucket'lar

Aşağıdaki bucket'lar kasıtlı olarak public:

- `app-images`
- `market-icons`
- `pusula`
- `ui-icons`

Örnek içerikler incelendi: Pusula assetleri, menü ikonları, hava durumu görselleri, depo/piyasa ikonları ve UI arka planları. `pusula` bucket'ında kullanıcı tarla/fotoğraf verisi görülmedi.

`app-images` yayınlanabilir CMS/app görselleri içindir; kullanıcıya özel özel dosya deposu olarak kullanılmamalıdır.

## Storage policy kontrolü

- Field activity photos: path ilk klasörü = `auth.uid()`
- Field map layers: kullanıcı klasörü sahipliği; sıkı politikalarda field ownership kontrolü de var
- Field observation photos: path ilk klasörü = `auth.uid()`
- Issue report attachments: kullanıcı kendi klasörüne insert; admin read
- Pesticide labels: kullanıcı kendi klasörü
- Soil analysis: kullanıcı kendi klasörü
- Knowledge documents: admin-only

## Release kararı

Storage visibility açısından mevcut kullanıcı dosyalarında public exposure blocker'ı bulunmadı.

## Kalıcı kural

Yeni bucket eklenirken:
1. Kullanıcı verisiyse default private.
2. Path ownership veya field ownership RLS zorunlu.
3. Public bucket yalnız uygulama/CMS assetleri için kullanılmalı.
4. Privacy/Data Safety beyanı yeni veri tipine göre yeniden değerlendirilmelidir.
