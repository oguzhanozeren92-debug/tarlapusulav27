import { useEffect } from 'react';
import { installNativeAuthDeepLinkListener } from './nativeAuth';

export default function NativeAuthBridge() {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void installNativeAuthDeepLinkListener()
      .then((remove) => {
        if (disposed) {
          remove();
          return;
        }
        cleanup = remove;
      })
      .catch((error) => {
        console.error('[Auth] Native geri dönüş dinleyicisi başlatılamadı:', error);
        window.dispatchEvent(
          new CustomEvent('tp:native-auth-error', {
            detail: { message: 'Apple ile giriş bağlantısı başlatılamadı. Uygulamayı yeniden açıp deneyin.' },
          }),
        );
      });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return null;
}
