import { useEffect, useRef } from 'react';
import {
  getUnlockedFieldCount,
  useGamificationStore,
} from '../../gamification/useGamificationStore';
import {
  playPremiumFeedback,
  primePremiumFeedback,
  type PremiumFeedbackTone,
} from './premiumFeedback.service';

export default function PremiumFeedbackLayer() {
  const gamification = useGamificationStore();
  const handledAwardId = useRef<number | null>(null);

  useEffect(() => {
    const seenInsightIds = new Set<string>();

    const prime = (event: Event) => {
      if (!event.isTrusted) return;
      void primePremiumFeedback();
    };

    const onFeedback = (event: Event) => {
      const tone = (event as CustomEvent<{ tone?: PremiumFeedbackTone }>).detail?.tone;
      if (tone) playPremiumFeedback(tone);
    };

    const onPusulaInsight = (event: Event) => {
      const detail = (event as CustomEvent<{ insight?: { id?: string } }>).detail;
      const id = String(detail?.insight?.id ?? '').trim();
      if (!id || seenInsightIds.has(id)) return;
      if (/guide|fallback|timeout|loading|hazirlaniyor/i.test(id)) return;
      seenInsightIds.add(id);
      playPremiumFeedback('message');
    };

    const onDocumentClick = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;

      const pusulaButton = target.closest(
        '[aria-label="Pusula"], [title="Pusula"], .tp-pusula-logo-button, .tp-global-pusula-anchor',
      );

      if (pusulaButton) {
        playPremiumFeedback('compass');
        return;
      }

      if (target.closest('.field-map-finish-button')) {
        window.setTimeout(() => {
          if (document.querySelector('.field-map-message.success')) {
            playPremiumFeedback('snap');
          }
        }, 80);
      }
    };

    // click capture, document'taki Pusula click handlerından önce çalışır.
    // Böylece AudioContext gerçek kullanıcı aktivasyonu içinde açılır.
    window.addEventListener('click', prime, true);
    window.addEventListener('keydown', prime, true);
    window.addEventListener('tp:premium-feedback', onFeedback as EventListener);
    window.addEventListener('tp-pusula-insight', onPusulaInsight as EventListener);
    document.addEventListener('click', onDocumentClick, true);

    return () => {
      window.removeEventListener('click', prime, true);
      window.removeEventListener('keydown', prime, true);
      window.removeEventListener('tp:premium-feedback', onFeedback as EventListener);
      window.removeEventListener('tp-pusula-insight', onPusulaInsight as EventListener);
      document.removeEventListener('click', onDocumentClick, true);
    };
  }, []);

  useEffect(() => {
    const award = gamification.lastAward;
    if (!award || award.id === handledAwardId.current) return;
    handledAwardId.current = award.id;

    const after = Math.max(0, Number(gamification.points) || 0);
    const before = Math.max(0, after - Math.max(0, Number(award.points) || 0));
    const didUnlockField =
      getUnlockedFieldCount(after) > getUnlockedFieldCount(before);

    playPremiumFeedback(didUnlockField ? 'level-up' : 'point');
  }, [gamification.lastAward, gamification.points]);

  return null;
}
