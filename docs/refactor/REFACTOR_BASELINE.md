# TarlaPusula Refactor Baseline — 0.1

Kaynak gerçek: `vitejs-vite-efdc27zu (2).zip`

## Phase 0.1 amacı

Davranışsal ve görsel refactordan önce güvenlik bariyeri oluşturmak.

Bu pakette:

1. Node test runner TypeScript importlarını çalıştırabilir hale getirildi.
2. Test runner gerçek bir eski kontrat sapmasını görünür hale getirdi ve Risk Radar evidence sınırı mevcut teste göre 3'e sabitlendi.
3. Karar motoru / besin / uydu arasında service dosyalarına bağlı tip döngüsü bağımsız type contract dosyalarına ayrıldı.
4. Çift `useFieldActivities` implementasyonu tek kanonik implementation'a indirildi; eski import yolu re-export ile korundu.
5. Repo borç ölçümü için bağımlılıksız audit scripti eklendi.
6. Import cycle kontrolü için bağımlılıksız fail-fast script eklendi.
7. Gelecek tasarım sistemi için token klasörü oluşturuldu; henüz uygulamaya import edilmedi.
8. Home Map / NDVI / Pusula kabul edilmiş görünümü Protected UI Zone olarak belgelendi.

## Bu fazda özellikle yapılmayanlar

- Global tema override eklenmedi.
- `main.tsx` tema import sırası değiştirilmedi.
- Weather/Home görünümü değiştirilmedi.
- Büyük componentler henüz parçalanmadı.
- Supabase iş mantığı topluca taşınmadı.

## Verification

Tam bağımlılıkların kurulu olduğu geliştirme ortamında:

```bash
npm run verify
```

Sadece bağımlılıksız kontroller:

```bash
npm run audit:repo
npm run audit:cycles
npm test
```

Phase 0.2'ye geçiş kriteri: test + import cycle kontrolü yeşil, ardından dependency kurulu ortamda typecheck/lint/build yeşil.
