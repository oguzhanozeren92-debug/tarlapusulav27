import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { supabase } from '../supabaseClient';
import {
  isNativePushPlatform,
  refreshNativePushRegistration,
} from './nativePush';

export default function NativePushBridge() {
  useEffect(() => {
    if (!isNativePushPlatform()) return;

    let alive = true;
    let appStateHandle: { remove: () => Promise<void> } | null = null;

    const refresh = async () => {
      if (!alive) return;
      await refreshNativePushRegistration();
    };

    void refresh();

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
    };
  }, []);

  return null;
}
