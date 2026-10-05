import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

type NativeFeedbackKind = 'menu' | 'pusula' | 'points';

const SOUND_PREF_KEY = 'tp_mobile_sound_enabled_v1';
let installed = false;
let audioContext: AudioContext | null = null;

function soundEnabled() {
  try {
    return window.localStorage.getItem(SOUND_PREF_KEY) !== '0';
  } catch {
    return true;
  }
}

function getAudioContext() {
  if (audioContext) return audioContext;

  const AudioContextCtor = (
    window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).AudioContext ?? (
    window as typeof window & {
      webkitAudioContext?: typeof AudioContext;
    }
  ).webkitAudioContext;

  if (!AudioContextCtor) return null;

  audioContext = new AudioContextCtor();
  return audioContext;
}

function tone(
  frequency: number,
  startDelay: number,
  duration: number,
  volume: number,
) {
  if (!soundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      void ctx.resume();
    }

    const start = ctx.currentTime + startDelay;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, start);

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  } catch {
    // Ses hiçbir zaman ana kullanıcı akışını bozmaz.
  }
}

function playSound(kind: NativeFeedbackKind) {
  if (kind === 'menu') {
    tone(420, 0, 0.07, 0.035);
    return;
  }

  if (kind === 'points') {
    tone(620, 0, 0.08, 0.04);
    tone(820, 0.07, 0.10, 0.035);
    return;
  }

  // Pusula'nın eski karakter hissine yakın, kısa iki notalı işaret.
  tone(520, 0, 0.08, 0.035);
  tone(740, 0.075, 0.12, 0.04);
}

function haptic(kind: NativeFeedbackKind) {
  if (!Capacitor.isNativePlatform()) return;

  const style =
    kind === 'pusula'
      ? ImpactStyle.Medium
      : ImpactStyle.Light;

  void Haptics.impact({ style }).catch(() => undefined);
}

function feedback(kind: NativeFeedbackKind) {
  playSound(kind);
  haptic(kind);
}

export function installNativeFeedback() {
  if (installed || !Capacitor.isNativePlatform() || typeof document === 'undefined') {
    return;
  }

  installed = true;

  document.addEventListener(
    'click',
    (event) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        target.closest('.tp-brand-pusula-anchor') ||
        target.closest('.tp-global-pusula-anchor')
      ) {
        feedback('pusula');
        return;
      }

      if (
        target.closest('.tp-menu-btn') ||
        target.closest('.tp-global-page-menu') ||
        target.closest('[aria-label="Menüyü aç"]')
      ) {
        feedback('menu');
        return;
      }

      if (
        target.closest('.tp-score') ||
        target.closest('.tp-global-points-glass') ||
        target.closest('[aria-label^="Pusula puanı"]')
      ) {
        feedback('points');
      }
    },
    true,
  );
}
