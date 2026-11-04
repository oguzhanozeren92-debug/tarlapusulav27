import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { supabase } from '../supabaseClient';
import { LocalNotifications } from '@capacitor/local-notifications';
import { nativeLocalSupported, syncNativeLocalReminders } from './nativeLocalReminders';
import {
  isNativePushPlatform,
  refreshNativePushRegistration,
} from './nativePush';

export default function NativePushBridge() {
  useEffect(() => {
    if (!isNativePushPlatform()) return;

    let alive = true;
    let appStateHandle: { remove: () => Promise<void> } | null = null;
    let localTapHandle: { remove: () => Promise<void> } | null = null;

    const refresh = async () => {
      if (!alive) return;
      await refreshNativePushRegistration();
      if (nativeLocalSupported()) await syncNativeLocalReminders();
    };

    void refresh();
    if (nativeLocalSupported()) {
      void LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        if (notification.extra?.target === 'calendar') {
          window.dispatchEvent(new Event('tp:open-calendar'));
        }
      }).then(handle => {
        if (alive) localTapHandle = handle;
        else void handle.remove();
      });
    }

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    }).then((handle) => {
      if (!alive) {
        void handle.remove();
        return;
      }
      appStateHandle = handle;
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void refresh();
    });

    return () => {
      alive = false;
      authListener.subscription.unsubscribe();
      if (appStateHandle) void appStateHandle.remove();
      if (localTapHandle) void localTapHandle.remove();
    };
  }, []);

  return null;
}
