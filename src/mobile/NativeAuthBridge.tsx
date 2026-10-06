import { useEffect } from 'react';
import { installNativeAuthDeepLinkListener } from './nativeAuth';

export default function NativeAuthBridge() {
  useEffect(() => {
    let disposed = false;
    let cleanup: (() => void) | null = null;

    void installNativeAuthDeepLinkListener().then((remove) => {
      if (disposed) {
        remove();
        return;
      }
      cleanup = remove;
    });

    return () => {
      disposed = true;
      cleanup?.();
    };
  }, []);

  return null;
}
