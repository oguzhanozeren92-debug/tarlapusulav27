# Protected UI Zones

Bu dosya refactor sırasında görsel sonucu değiştirilmeyecek kabul edilmiş alanları tanımlar.

## 1. Home Map / NDVI / Pusula — LOCKED

Kullanıcı açıkça istemediği sürece aşağıdakiler değiştirilemez:

- Harita kartının mevcut geometri ve yüksekliği.
- Haritanın sağ kenara uzanma davranışı.
- NDVI legend'in mevcut konumu ve harita içindeki ilişkisi.
- Veri tarihi etiketinin yerleşimi.
- Pusula bilgi footer'ının normal flow içinde harita kartına bağlı yerleşimi.
- Pusula footer içindeki sağ aksiyonların dikey sırası ve okunabilirliği:
  - Yenile
  - Neden?
  - Göreli farkı göster
- Pusula logosunun mevcut yerleşim ilişkisi.
- Uydu/NDVI gerçek veri renklerinin tema tokenları tarafından ezilmemesi.

## Refactor izni

Bu alanların iç kodu hook/component/service olarak bölünebilir. Ancak DOM/CSS refactor sonrası ekran görüntüsü ve kullanıcı etkileşimi eşdeğer kalmalıdır.

## Kural

Protected zone değişikliği ayrı bir kullanıcı isteği ve ayrı bir UI değişiklik paketi olmadan başka refactor paketine karıştırılmaz.
