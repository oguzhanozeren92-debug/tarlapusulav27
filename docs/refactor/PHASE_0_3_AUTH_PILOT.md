# Phase 0.3 — Auth Pilot / First Live UI Migration

Bu faz, 0.2'de kurulan tasarım sistemi çekirdeğinin ilk gerçek ekran kullanımını yapar.

## Değişenler

- Auth ekranının eski mavi/yeşil skin'i kaldırıldı.
- Açık/kırık beyaz zemin + siyah detay sistemi uygulandı.
- Giriş / kayıt / doğrulama CTA'ları ortak `Button` primitive kullanıyor.
- Panel ve özellik satırları ortak `Card` primitive kullanıyor.
- TarlaPusula Pusula logosu ilk kez reusable `PusulaMark` componentine alındı.
- Tek font/tipografi tokenları kullanılıyor.
- Renkler UI tokenlarından geliyor; hata rengi yalnız semantik kırmızı olarak kalıyor.

## Değişmeyenler

- Supabase auth mantığı
- login/register handler'ları
- screen sözleşmesi
- remember-session davranışı
- CMS runtime CSS injection
- Home / Harita / NDVI / Pusula locked UI

## Kontrol

- `npm test`: 120 / 120 geçti.
- `npm run audit:cycles`: 0 cycle.
- Değişen TS/TSX dosyaları TypeScript transpile syntax kontrolünden geçti.
- Bu çalışma ortamında `npm run typecheck`, eksik `vite/client` ve `node` type paketleri nedeniyle çalıştırılamadı. StackBlitz'de bağımlılıklar tam olduğunda `npm run verify` kullanılmalı.

## Neden Auth?

Auth düşük domain riski taşıyor ve tüm yeni UI kurallarını küçük bir alanda doğrulamak için uygun pilot ekran. Bu ekran kabul edilmeden Home/Weather gibi büyük ekranlara geçilmeyecek.
