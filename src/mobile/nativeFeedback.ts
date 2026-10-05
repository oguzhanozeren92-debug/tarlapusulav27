import { Capacitor } from '@capacitor/core';
import {
  Haptics,
  ImpactStyle,
  NotificationType,
} from '@capacitor/haptics';

export type MobileFeedbackKind =
  | 'menu'
  | 'tap'
  | 'pusula'
  | 'points'
  | 'success';

const SOUND_PREF_KEY = 'tp_mobile_sound_enabled_v1';

let audioContext: AudioContext | null = null;

function soundEnabled() {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function getAudioContext() {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;

  const AudioContextCtor =
    window.AudioContext ??
    (window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }).webkitAudioContext;

  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  return audioContext;
}

function scheduleTone(
  context: AudioContext,
  frequency: number,
  startAt: number,
  duration: number,
  gainValue: number,
) {
  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(frequency, startAt);

  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(gainValue, startAt + 0.012);
  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    startAt + Math.max(0.025, duration),
  );

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.02);
}

async function playSound(kind: MobileFeedbackKind) {
  if (!soundEnabled()) return;
  if (kind === 'menu' || kind === 'tap') return;

  const context = getAudioContext();
  if (!context) return;

  try {
    if (context.state === 'suspended') {
      await context.resume();
    }

    const now = context.currentTime + 0.01;

    if (kind === 'pusula') {
      scheduleTone(context, 659.25, now, 0.075, 0.032);
      scheduleTone(context, 880, now + 0.065, 0.095, 0.028);
      return;
    }

    if (kind === 'points') {
      scheduleTone(context, 783.99, now, 0.055, 0.028);
      scheduleTone(context, 1046.5, now + 0.045, 0.085, 0.025);
      return;
    }

    if (kind === 'success') {
      scheduleTone(context, 523.25, now, 0.06, 0.028);
      scheduleTone(context, 659.25, now + 0.055, 0.07, 0.027);
      scheduleTone(context, 783.99, now + 0.11, 0.1, 0.024);
    }
  } catch {
    // Ses kullanılamasa da uygulama ve haptic davranışı devam eder.
  }
}

async function playHaptic(kind: MobileFeedbackKind) {
  if (!Capacitor.isNativePlatform()) return;

  try {
    if (kind === 'success' || kind === 'points') {
      await Haptics.notification({
        type:
          kind === 'success'
            ? NotificationType.Success
            : NotificationType.Warning,
      });
      return;
    }

    if (kind === 'menu' || kind === 'tap') {
      await Haptics.impact({ style: ImpactStyle.Light });
      return;
    }

    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Haptic desteklenmiyorsa sessizce devam et.
  }
}

export async function playMobileFeedback(kind: MobileFeedbackKind) {
  await Promise.allSettled([playHaptic(kind), playSound(kind)]);
}

export function setMobileSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Tercih yazılamazsa varsayılan açık kalır.
  }
}
