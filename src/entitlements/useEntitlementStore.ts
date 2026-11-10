import { useEffect, useSyncExternalStore } from 'react';
import { supabase } from '../supabaseClient';

export type TarlaPusulaPlan = 'free' | 'plus' | 'premium';
export type DeveloperPlanMode = 'real' | 'free' | 'plus' | 'premium' | 'new_user';

type EntitlementStatus = 'idle' | 'loading' | 'ready' | 'error';

export type EntitlementSnapshot = {
  status: EntitlementStatus;
  userEmail: string;
  realPlan: TarlaPusulaPlan;
  developerMode: DeveloperPlanMode;
  effectivePlan: TarlaPusulaPlan;
  canOverride: boolean;
  isPlus: boolean;
  isPremium: boolean;
  isPaid: boolean;
  isNewUserPreview: boolean;
  switching: boolean;
  backendSynced: boolean;
  error: string | null;
};

// All TarlaPusula features are free. Older features still use the historical
// "premium" access tier internally; it never indicates a paid subscription.
// No developer plan-switch UI, paywall, or store entitlements exist in this build.
export const TARLAPUSULA_ALL_FEATURES_FREE = true;

const listeners = new Set<() => void>();
let state: EntitlementSnapshot = {
  status: 'idle',
  userEmail: '',
  realPlan: 'free',
  developerMode: 'real',
  effectivePlan: 'premium',
  canOverride: false,
  isPlus: true,
  isPremium: true,
  isPaid: false,
  isNewUserPreview: false,
  switching: false,
  backendSynced: false,
  error: null,
};

let authListenerStarted = false;
let refreshPromise: Promise<EntitlementSnapshot> | null = null;

function updateEmail(userEmail: string, error: string | null = null) {
  state = { ...state, status: 'ready', userEmail, error };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return state;
}

export function getEntitlementSnapshot() {
  return state;
}

export async function refreshEntitlements(): Promise<EntitlementSnapshot> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw error;
      updateEmail(String(data.user?.email ?? '').trim().toLowerCase());
    } catch (error) {
      // Authentication may be temporarily unavailable; keep all app features free.
      updateEmail('', error instanceof Error ? error.message : String(error));
    }
    return state;
  })();

  try {
    return await refreshPromise;
  } finally {
    refreshPromise = null;
  }
}

// Legacy API signatures remain for existing callers. Changing paid or preview
// modes is no longer possible because there are no subscription tiers.
export async function setDeveloperPlanMode(_mode: DeveloperPlanMode) {
  return state;
}

export async function cycleDeveloperPlanMode() {
  return state;
}

function ensureAuthListener() {
  if (authListenerStarted) return;
  authListenerStarted = true;
  supabase.auth.onAuthStateChange(() => {
    void refreshEntitlements();
  });
}

export function useEntitlementStore() {
  useEffect(() => {
    ensureAuthListener();
    if (state.status === 'idle') void refreshEntitlements();
  }, []);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
