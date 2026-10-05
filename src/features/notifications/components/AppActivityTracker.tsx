import { useEffect } from 'react';
import { supabase } from '../../../supabaseClient';

const HEARTBEAT_MS = 5 * 60 * 1000;
const STORAGE_KEY = 'tp_last_activity_heartbeat_v1';

function shouldHeartbeat(force = false) {
  if (force) return true;
  try {
    const previous = Number(window.localStorage.getItem(STORAGE_KEY) || 0);
    return !Number.isFinite(previous) || Date.now() - previous >= HEARTBEAT_MS;
  } catch {
    return true;
  }
}

function rememberHeartbeat() {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
  } catch {
    // localStorage kapalı olsa da sunucu heartbeat'i çalışabilir.
  }
}

async function heartbeat(force = false) {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
  if (!shouldHeartbeat(force)) return;

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return;

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('profiles')
    .update({ last_active_at: now, updated_at: now })
    .eq('id', data.user.id);

  if (updateError) {
    console.warn('[activity] Son aktif zamanı yazılamadı:', updateError.message);
    return;
  }
  rememberHeartbeat();
}

export default function AppActivityTracker() {
  useEffect(() => {
    let timer: number | null = null;

    const onVisible = () => {
      if (document.visibilityState === 'visible') void heartbeat(true);
    };
    const onFocus = () => void heartbeat(false);

    void heartbeat(true);
    timer = window.setInterval(() => void heartbeat(false), HEARTBEAT_MS);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);

    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      void heartbeat(true);
    });

    return () => {
      if (timer !== null) window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      listener.subscription.unsubscribe();
    };
  }, []);

  return null;
}
