# TarlaPusula — ESKİ ABONELİK KURULUMU (ARTIK KULLANILMIYOR)

20 Ekim 2026 kararı: TarlaPusula tamamen ücretsiz, seyrek reklam destekli yayınlanacak. Eski RevenueCat ürünleri App Store Connect'ten silinmez; **mevcut inceleme gönderiminden çıkarılır** ve uygulamanın yeni ücretsiz sürümünde hiçbir ücretli satın alma ekranı gösterilmez.

Kaynak uygulama kimliği `com.tarlapusula.app` değişmez. Eski `nativePurchases.ts` dosyası geçmiş uyumluluk için repoda tutulmuştur fakat artık uygulama kökünde başlatılmaz. Codemagic abonelik SDK anahtarı istemez. Bu doküman önceki abonelik kurulumunun yerine geçer.

Tüm kullanıcılar gelişmiş harita, Pusula AI, tarla çizimi ve PusulaPDF dahil özelliklere erişir; AI günlük 5 analiz ve PusulaPDF 24 saatte 1 yeni rapor olacak şekilde sunucuda sınırlandırılır.

Lansman öncesi: App Store Connect'te ilk ret gönderimindeki 4 aboneliği ve abonelik grubunu yeni inceleme paketinden çıkar, yeni unsigned/signed iOS build'i seç, iPad'de giriş ve ekran testini yap, App Store açıklamasını ücretsiz/reklam destekli sürüme güncelle.
