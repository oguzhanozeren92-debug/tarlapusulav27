# TarlaPusula Mobile

TarlaPusula'nın mobil kabuğu Capacitor ile paketlenir.

- Uygulama kimliği: `com.tarlapusula.app`
- Uygulama adı: `TarlaPusula`
- Web çıktısı: `dist`
- Android: `android/`
- iOS: `ios/`

## Yerel komutlar

```bash
npm run mobile:sync
npm run mobile:android
npm run mobile:ios
npm run android:open
npm run ios:open
```

## Dağıtım sırası

1. GitHub `main` üzerinde web build + testler yeşil olmalı.
2. Android Debug APK GitHub Actions tarafından üretilir.
3. Android mağaza yayını için AAB + Play Console signing ayarlanır.
4. iOS gerçek cihaz/TestFlight için Apple Developer Team ve signing ayarlanır.
5. Push bildirim, ödüllü reklam ve mağaza içi satın alma native kimlikleri son yayın aşamasında eklenir.
