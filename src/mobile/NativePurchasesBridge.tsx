import { useEffect } from 'react';
import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../supabaseClient';
import {
  nativeStorePurchasesConfigured,
  refreshNativeStorePlan,
  resetNativePurchasesUser,
} from './nativePurchases';

export default function NativePurchasesBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let alive = true;
    let appHandle: { remove: () => Promise<void> } | null = null;

    const refresh = async () => {
      if (!alive || !nativeStorePurchasesConfigured()) return;

      try {
        await refreshNativeStorePlan();
      } catch (error) {
        console.info('[RevenueCat] Sessiz abonelik yenileme tamamlanamadı:', error);
      }
    };

    void refresh();

    void App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void refresh();
    }).then((handle) => {
      if (!alive) {
        void handle.remove();
        return;
      }
      appHandle = handle;
    });

    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        void resetNativePurchasesUser();
        return;
      }

      void refresh();
    });

    return () => {
      alive = false;
      data.subscription.unsubscribe();
      if (appHandle) void appHandle.remove();
    };
  }, []);

  return null;
}
