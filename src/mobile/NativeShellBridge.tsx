import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import {
  Keyboard,
  KeyboardResize,
} from '@capacitor/keyboard';
import { SplashScreen } from '@capacitor/splash-screen';
import {
  Animation,
  StatusBar,
  Style,
} from '@capacitor/status-bar';

type NativeBackDetail = {
  handled: boolean;
  canGoBack: boolean;
};

function setKeyboardState(open: boolean, height = 0) {
  const root = document.documentElement;

  root.classList.toggle('tp-native-keyboard-open', open);
  root.style.setProperty(
    '--tp-native-keyboard-height',
    open ? `${Math.max(0, height)}px` : '0px',
  );
}

async function configureNativeChrome() {
  try {
    await StatusBar.show({ animation: Animation.None });
    await StatusBar.setStyle({ style: Style.Light });

    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#ffffff' }).catch(
        () => undefined,
      );
    }
  } catch (error) {
    console.info('[native-shell] Status bar ayarı uygulanamadı:', error);
  }

  try {
    if (Capacitor.getPlatform() === 'ios') {
      await Keyboard.setResizeMode({
        mode: KeyboardResize.Body,
      });
    }
  } catch (error) {
    console.info('[native-shell] Klavye resize ayarı uygulanamadı:', error);
  }

  try {
    await SplashScreen.hide();
  } catch {
    // Otomatik gizlenmiş olabilir.
  }
}

export default function NativeShellBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let disposed = false;
    const removers: Array<() => void> = [];

    void configureNativeChrome();

    // WKWebView may report stale geometry during cold launch or resume.
    // Refresh layout after the native viewport settles; MapLibre listens to resize.
    let viewportTimer: ReturnType<typeof setTimeout> | undefined;
    const refreshViewport = () => {
      if (disposed) return;
      window.dispatchEvent(new Event('resize'));
    };
    const scheduleViewportRefresh = () => {
      if (disposed) return;
      if (viewportTimer) clearTimeout(viewportTimer);
      viewportTimer = setTimeout(refreshViewport, 180);
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleViewportRefresh();
    };
    window.addEventListener('orientationchange', scheduleViewportRefresh);
    window.addEventListener('pageshow', scheduleViewportRefresh);
    document.addEventListener('visibilitychange', onVisibility);
    window.visualViewport?.addEventListener('resize', scheduleViewportRefresh);
    const startupTimers = [250, 900, 2200].map((ms) => setTimeout(refreshViewport, ms));
    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) scheduleViewportRefresh();
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removers.push(() => void handle.remove());
    });

    void Keyboard.addListener('keyboardWillShow', (info) => {
      if (disposed) return;
      setKeyboardState(true, Number(info.keyboardHeight) || 0);
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removers.push(() => void handle.remove());
    });

    void Keyboard.addListener('keyboardWillHide', () => {
      if (disposed) return;
      setKeyboardState(false);
    }).then((handle) => {
      if (disposed) void handle.remove();
      else removers.push(() => void handle.remove());
    });

    if (Capacitor.getPlatform() === 'android') {
      void App.addListener('backButton', ({ canGoBack }) => {
        if (disposed) return;

        const detail: NativeBackDetail = {
          handled: false,
          canGoBack,
        };

        window.dispatchEvent(
          new CustomEvent<NativeBackDetail>('tp:native-back', {
            detail,
          }),
        );

        if (detail.handled) return;

        if (canGoBack && window.history.length > 1) {
          window.history.back();
          return;
        }

        void App.exitApp();
      }).then((handle) => {
        if (disposed) void handle.remove();
        else removers.push(() => void handle.remove());
      });
    }

    return () => {
      disposed = true;
      if (viewportTimer) clearTimeout(viewportTimer);
      for (const timer of startupTimers) clearTimeout(timer);
      window.removeEventListener('orientationchange', scheduleViewportRefresh);
      window.removeEventListener('pageshow', scheduleViewportRefresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.visualViewport?.removeEventListener('resize', scheduleViewportRefresh);
      setKeyboardState(false);
      for (const remove of removers) remove();
    };
  }, []);

  return null;
}
