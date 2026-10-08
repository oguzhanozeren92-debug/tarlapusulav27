import { Capacitor } from '@capacitor/core';
import {
  Haptics,
  ImpactStyle,
  NotificationType,
} from '@capacitor/haptics';

export type PremiumFeedbackTone =
  | 'compass'
  | 'message'
  | 'point'
  | 'level-up'
  | 'critical'
  | 'snap';

const SOUND_PREF_KEY = 'tp_premium_sound_enabled_v1';
const HAPTIC_PREF_KEY = 'tp_premium_haptic_enabled_v1';

type WebkitWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext;
};

let audioContext: AudioContext | null = null;
let masterGain: GainNode | null = null;
let primed = false;

function readPreference(key: string, fallback = true) {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored !== '0' && stored !== 'false';
  } catch {
    return fallback;
  }
}

export function isPremiumSoundEnabled() {
  return readPreference(SOUND_PREF_KEY, true);
}

export function isPremiumHapticEnabled() {
  return readPreference(HAPTIC_PREF_KEY, true);
}

export function setPremiumSoundEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(SOUND_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Tercih kaydı mümkün değilse mevcut oturum devam eder.
  }
}

export function setPremiumHapticEnabled(enabled: boolean) {
  try {
    window.localStorage.setItem(HAPTIC_PREF_KEY, enabled ? '1' : '0');
  } catch {
    // Tercih kaydı mümkün değilse mevcut oturum devam eder.
  }
}

function getAudioContext(createIfMissing = false) {
  if (typeof window === 'undefined') return null;
  if (audioContext) return audioContext;
  if (!createIfMissing) return null;

  const AudioContextCtor =
    window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AudioContextCtor) return null;

  try {
    audioContext = new AudioContextCtor();
    masterGain = audioContext.createGain();
    masterGain.gain.value = 0.19;
    masterGain.connect(audioContext.destination);
    return audioContext;
  } catch {
    audioContext = null;
    masterGain = null;
    return null;
  }
}

export function primePremiumFeedback() {
  if (primed || !isPremiumSoundEnabled()) return;
  if (typeof window === 'undefined') return;

  /*
    event.isTrusted tek başına yeterli değil: StackBlitz/WebContainer gibi
    iframe önizlemelerinde tarayıcı olayı güvenilir görse bile ses açma için
    "transient user activation" vermeyebiliyor. Chrome'un AudioContext
    uyarısını üretmemek için context'i yalnız gerçek user activation anında
    oluşturup/resume ediyoruz.
  */
  const activation =
    typeof navigator !== 'undefined' ? navigator.userActivation : undefined;

  if (activation && !activation.isActive) return;

  const context = getAudioContext(true);
  if (!context) return;

  if (context.state === 'running') {
    primed = true;
    return;
  }

  try {
    const resumeResult = context.resume();
    void resumeResult
      .then(() => {
        primed = context.state === 'running';
      })
      .catch(() => {
        // Tarayıcı/WebView sesi hâlâ bloke ederse sessizce bekle.
      });
  } catch {
    // Ses bağlamı açılamazsa uygulama sessiz şekilde devam eder.
  }
}

async function nativeHaptic(tone: PremiumFeedbackTone) {
  try {
    if (tone === 'level-up') {
      await Haptics.notification({ type: NotificationType.Success });
      return;
    }
    if (tone === 'critical') {
      await Haptics.notification({ type: NotificationType.Warning });
      return;
    }
    await Haptics.impact({
      style:
        tone === 'compass' || tone === 'snap'
          ? ImpactStyle.Medium
          : ImpactStyle.Light,
    });
  } catch {
    // Native haptic desteklenmezse ses tek başına çalışır.
  }
}

function webHaptic(tone: PremiumFeedbackTone) {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
  const pattern =
    tone === 'level-up'
      ? [12, 45, 18]
      : tone === 'critical'
        ? [28, 55, 28]
        : tone === 'compass'
          ? 10
          : tone === 'snap'
            ? 13
            : 8;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Web Vibration API yoksa sessizce devam et.
  }
}

function haptic(tone: PremiumFeedbackTone) {
  if (!isPremiumHapticEnabled()) return;
  if (Capacitor.isNativePlatform()) {
    void nativeHaptic(tone);
    return;
  }
  webHaptic(tone);
}

type Note = {
  frequency: number;
  start: number;
  duration: number;
  gain: number;
  type?: OscillatorType;
};

function playNotes(notes: Note[]) {
  if (!isPremiumSoundEnabled()) return;
  const context = getAudioContext(false);
  const output = masterGain;
  if (!context || !output || context.state !== 'running') return;

  const now = context.currentTime + 0.008;

  notes.forEach((note) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = now + note.start;
    const end = start + note.duration;

    oscillator.type = note.type ?? 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(
      Math.max(0.001, note.gain),
      start + 0.018,
    );
    gain.gain.exponentialRampToValueAtTime(0.0001, end);

    oscillator.connect(gain);
    gain.connect(output);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  });
}

export function playPremiumFeedback(tone: PremiumFeedbackTone) {
  haptic(tone);

  switch (tone) {
    case 'compass':
      playNotes([
        { frequency: 392, start: 0, duration: 0.09, gain: 0.23, type: 'triangle' },
        { frequency: 587.33, start: 0.065, duration: 0.14, gain: 0.16, type: 'sine' },
      ]);
      break;
    case 'message':
      playNotes([
        { frequency: 523.25, start: 0, duration: 0.1, gain: 0.14 },
        { frequency: 659.25, start: 0.085, duration: 0.13, gain: 0.13 },
      ]);
      break;
    case 'point':
      playNotes([
        { frequency: 659.25, start: 0, duration: 0.07, gain: 0.12, type: 'triangle' },
        { frequency: 783.99, start: 0.052, duration: 0.1, gain: 0.1, type: 'triangle' },
      ]);
      break;
    case 'level-up':
      playNotes([
        { frequency: 392, start: 0, duration: 0.11, gain: 0.15, type: 'triangle' },
        { frequency: 523.25, start: 0.09, duration: 0.14, gain: 0.16, type: 'triangle' },
        { frequency: 659.25, start: 0.19, duration: 0.18, gain: 0.15, type: 'sine' },
        { frequency: 783.99, start: 0.31, duration: 0.25, gain: 0.11, type: 'sine' },
      ]);
      break;
    case 'critical':
      playNotes([
        { frequency: 246.94, start: 0, duration: 0.16, gain: 0.13, type: 'triangle' },
        { frequency: 246.94, start: 0.2, duration: 0.16, gain: 0.11, type: 'triangle' },
      ]);
      break;
    case 'snap':
      playNotes([
        { frequency: 880, start: 0, duration: 0.055, gain: 0.09, type: 'sine' },
      ]);
      break;
  }
}

export function emitPremiumFeedback(tone: PremiumFeedbackTone) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('tp:premium-feedback', {
      detail: { tone },
    }),
  );
}
