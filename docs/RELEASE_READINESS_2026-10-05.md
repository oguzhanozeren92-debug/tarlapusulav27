# TarlaPusula Release Readiness

Son kontrol: 2026-10-05

## Otomatik kontroller

- [x] GitHub `main` kaynak gerçek olarak kullanılıyor.
- [x] Production Vercel projesi güncel repo / `main` dalına bağlı.
- [x] Production build çalışıyor.
- [x] GitHub test paketi: 120 / 120.
- [x] TypeScript typecheck CI adımı geçiyor.
- [x] Sistem Sağlığı ekranı güncel `admin-control-center / system_health` akışına bağlı.
- [x] Admin health/overview sorgularındaki eski kolon adları düzeltildi.
- [x] Sentinel-2 Statistics çözünürlük hatası düzeltildi.
- [x] Seçili uydu tarihinin aynı gün aralığına bağlanması testi düzeltildi.
- [x] Kritik jsPDF güvenlik açığı için jsPDF 4.2.1'e yükseltildi.
- [x] Anon erişime açık kritik SECURITY DEFINER RPC'leri daraltıldı.
- [x] Eski ZIP / StackBlitz / working-overlay ana dal overwrite workflow'ları kaldırıldı.
- [x] Vercel production runtime'da son kontrolde runtime error yok.

## Ticari yayın öncesi bloklayıcılar

- [ ] Gerçek Premium satın alma bağlantısı yok. `PlanUpgradeModal` şu an mağaza ödeme köprüsü gelene kadar yalnız plan seçimi/mesaj gösteriyor.
- [ ] Gerçek reklam sağlayıcı köprüsü yok. Production'da `window.TarlaPusulaAds` sağlanmazsa rewarded/interstitial reklam gösterilmiyor.
- [ ] Supabase Auth leaked-password protection açılmalı.
- [ ] Gizlilik Politikası / KVKK Aydınlatma Metni / Kullanım Koşulları hazırlanıp uygulamaya ve yayın sayfalarına bağlanmalı.
- [ ] iOS / Android mağaza yayını hedefleniyorsa native paketleme + mağaza abonelik/reklam SDK köprüsü tamamlanmalı.
- [ ] Gerçek cihazda oturumlu uçtan uca smoke test yapılmalı.

## Gerçek cihaz smoke turu

1. Kayıt / giriş / oturum kalıcılığı
2. Onboarding -> yeni tarla ekleme
3. Ada-parsel ve Çizimle Ekle akışları
4. Ana harita -> uydu -> tam ekran -> geçmiş tarih
5. Hava -> sulama kararı
6. Pusula AI fotoğraf analizi
7. Ücretsiz plan limitleri ve puan ekranı
8. Premium özellik kilitleri
9. Piyasa Fiyatları / Gündem / Bilgi Rehberi
10. Görevler / Bildirimler
11. Hata bildirimi
12. Admin -> içerik kuyruğu -> Sistem Sağlığı
13. Uygulamayı kapat/aç -> seçili tarla ve oturum korunuyor mu

## Karar

Teknik web beta / kapalı kullanıcı testi için **GO**.

Reklam + Premium ödeme ile halka açık ticari yayın için yukarıdaki bloklayıcılar tamamlanmadan **NO-GO**.
