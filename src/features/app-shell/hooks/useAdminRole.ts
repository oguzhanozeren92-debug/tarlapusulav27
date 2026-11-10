import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { supabase } from '../../../supabaseClient';

export function useAdminRole() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Administrative editing is managed in the browser, never in App Store builds.
    if (Capacitor.isNativePlatform()) return;

    let active = true;

    const checkAdminRole = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!active) return;
        if (!user) {
          setIsAdmin(false);
          return;
        }

        const { data, error } = await supabase
          .from('admin_users')
          .select('user_id')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!active) return;
        if (error) {
          console.error('Admin üyeliği kontrol edilemedi:', error);
          setIsAdmin(false);
          return;
        }

        setIsAdmin(Boolean(data?.user_id));
      } catch (error) {
        console.error('Admin üyeliği kontrol edilemedi:', error);
        if (active) setIsAdmin(false);
      }
    };

    void checkAdminRole();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void checkAdminRole();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  return isAdmin;
}
