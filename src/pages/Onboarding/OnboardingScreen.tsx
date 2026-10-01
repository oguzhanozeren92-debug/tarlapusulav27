import { onboardingQuestions } from '../../data/onboarding';
import { Button, Card } from '../../ui';
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

  return (
    <>
      <style>{cmsRuntimeCss}</style>

      <main className="tp-ob-page">
        <div className="tp-ob-pattern" aria-hidden="true" />

        <Card className="tp-ob-shell">
          <header className="tp-ob-top">
            <Button
              variant="ghost"
              size="sm"
              className="tp-ob-back"
              onClick={onBack}
              aria-label="Geri"
            >
              ←
            </Button>

            <div className="tp-ob-step">
              <strong>{onboardingStep + 1}</strong>
              <span>/ {onboardingQuestions.length}</span>
            </div>

            <div className="tp-ob-top-spacer" aria-hidden="true" />
          </header>

          <div
            className="tp-ob-progress"
            aria-label={`Adım ${onboardingStep + 1} / ${onboardingQuestions.length}`}
          >
            {onboardingQuestions.map((_, index) => (
              <span
                key={index}
                className={index <= onboardingStep ? 'is-active' : ''}
              />
            ))}
          </div>

          <section className="tp-ob-copy">
            <span className="tp-ob-kicker">SENİ TANIYALIM</span>
            <h1>{currentQuestion.title}</h1>
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

                  <span
                    className="tp-ob-option-check"
                    aria-hidden="true"
                  >
                    {selected ? '✓' : ''}
                  </span>
                </button>
              );
            })}

            {showOtherProductInput ? (
              <Card tone="subtle" flat className="tp-ob-other">
                <label htmlFor="tp-ob-other-product">
                  Diğer ürünün adı
                </label>

                <input
                  id="tp-ob-other-product"
                  type="text"
                  value={otherProduct}
                  onChange={(event) =>
                    onOtherProductChange(event.target.value)
                  }
                  placeholder="Örn: Şeker pancarı, Pamuk, Çay, Kivi..."
                />

                <small>
                  Listede olmayan ürünü buraya yazabilirsin.
                </small>
              </Card>
            ) : null}
          </div>

          {authMessage ? (
            <div className="tp-ob-message" role="status">
              {authMessage}
            </div>
          ) : null}

          <footer className="tp-ob-actions">
            <Button
              variant="secondary"
              size="lg"
              onClick={onSkip}
              disabled={authLoading}
            >
              Şimdilik geç
            </Button>

            <Button
              size="lg"
              onClick={onNext}
              disabled={authLoading}
            >
              {authLoading
                ? 'Kaydediliyor...'
                : isLastStep
                  ? 'Tamamla'
                  : 'Devam'}
            </Button>
          </footer>
        </Card>
      </main>
    </>
  );
}
