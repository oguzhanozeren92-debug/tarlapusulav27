import {
  ArrowLeft,
  ArrowRight,
  Check,
  Compass,
} from 'lucide-react';
import { onboardingQuestions } from '../../data/onboarding';
import './Onboarding.css';

type OnboardingScreenProps = {
  cmsRuntimeCss: string;
  onboardingStep: number;
  answers: Record<number, string[]>;
  otherProduct: string;
  authMessage: string;
  authLoading: boolean;
  onOtherProductChange: (value: string) => void;
  onBack: () => void;
  onSelectAnswer: (value: string) => void;
  onSkip: () => void | Promise<void>;
  onNext: () => void | Promise<void>;
};

export default function OnboardingScreen({
  cmsRuntimeCss,
  onboardingStep,
  answers,
  otherProduct,
  authMessage,
  authLoading,
  onOtherProductChange,
  onBack,
  onSelectAnswer,
  onSkip,
  onNext,
}: OnboardingScreenProps) {
  const currentQuestion = onboardingQuestions[onboardingStep];
  const selectedAnswers = answers[onboardingStep] || [];
  const showOtherProductInput =
    onboardingStep === 2 && selectedAnswers.includes('Diğer ürün');

  if (!currentQuestion) return null;

  const isLastStep = onboardingStep === onboardingQuestions.length - 1;
  const answered = selectedAnswers.length > 0;
  const progress = ((onboardingStep + 1) / onboardingQuestions.length) * 100;

  return (
    <>
      <style>{cmsRuntimeCss}</style>

      <main className="tp-ob-page">
        <section className="tp-ob-shell" aria-labelledby="tp-ob-question">
          <header className="tp-ob-top">
            <button
              type="button"
              className="tp-ob-back"
              onClick={onBack}
              aria-label="Geri"
            >
              <ArrowLeft size={18} />
            </button>

            <div className="tp-ob-brand" aria-label="TarlaPusula başlangıç profili">
              <span className="tp-ob-brand-mark" aria-hidden="true">
                <Compass size={17} />
              </span>
              <div>
                <small>BAŞLANGIÇ PROFİLİ</small>
                <strong>Seni tanıyalım</strong>
              </div>
            </div>

            <span className="tp-ob-step">
              <strong>{onboardingStep + 1}</strong>
              <small>/ {onboardingQuestions.length}</small>
            </span>
          </header>

          <div
            className="tp-ob-progress"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={onboardingQuestions.length}
            aria-valuenow={onboardingStep + 1}
            aria-label={`Soru ${onboardingStep + 1} / ${onboardingQuestions.length}`}
          >
            <i style={{ width: `${progress}%` }} />
          </div>

          <section className="tp-ob-copy">
            <div className="tp-ob-question-meta">
              <span>SORU {String(onboardingStep + 1).padStart(2, '0')}</span>
              {currentQuestion.multi ? <em>Birden fazla seçebilirsin</em> : <em>Bir seçim yap</em>}
            </div>

            <h1 id="tp-ob-question">{currentQuestion.title}</h1>
            <p>{currentQuestion.subtitle}</p>
          </section>

          <div className="tp-ob-options">
            {currentQuestion.options.map(([icon, label]) => {
              const selected = selectedAnswers.includes(label);

              return (
                <button
                  key={label}
                  type="button"
                  className={`tp-ob-option${selected ? ' is-selected' : ''}`}
                  onClick={() => onSelectAnswer(label)}
                  aria-pressed={selected}
                >
                  <span className="tp-ob-option-icon" aria-hidden="true">
                    {icon}
                  </span>

                  <span className="tp-ob-option-label">{label}</span>

                  <span className="tp-ob-option-check" aria-hidden="true">
                    {selected ? <Check size={13} strokeWidth={3} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {showOtherProductInput ? (
            <label className="tp-ob-other" htmlFor="tp-ob-other-product">
              <span>Diğer ürünün adı</span>
              <input
                id="tp-ob-other-product"
                type="text"
                value={otherProduct}
                onChange={(event) => onOtherProductChange(event.target.value)}
                placeholder="Örn. Şeker pancarı, Pamuk, Çay…"
                autoComplete="off"
              />
            </label>
          ) : null}

          {authMessage ? (
            <div className="tp-ob-message" role="status">
              {authMessage}
            </div>
          ) : null}

          <footer className="tp-ob-actions">
            <button
              type="button"
              className="tp-ob-skip"
              onClick={onSkip}
              disabled={authLoading}
            >
              Şimdilik geç
            </button>

            <button
              type="button"
              className="tp-ob-next"
              onClick={onNext}
              disabled={authLoading}
              data-answered={answered ? 'true' : 'false'}
            >
              <span>
                {authLoading
                  ? 'Kaydediliyor…'
                  : isLastStep
                    ? 'Profili tamamla'
                    : 'Devam et'}
              </span>
              {!authLoading ? <ArrowRight size={17} /> : null}
            </button>
          </footer>
        </section>
      </main>
    </>
  );
}
