import { Button, Card } from '../../ui';
import './Onboarding.css';

type ReadyScreenProps = {
  cmsRuntimeCss: string;
  onContinue: () => void;
};

export default function ReadyScreen({
  cmsRuntimeCss,
  onContinue,
}: ReadyScreenProps) {
  return (
    <>
      <style>{cmsRuntimeCss}</style>

      <main className="tp-ob-page">
        <div className="tp-ob-pattern" aria-hidden="true" />

        <Card className="tp-ready-shell">
          <div className="tp-ready-check" aria-hidden="true">
            ✓
          </div>

          <span className="tp-ob-kicker">BAŞLANGIÇ PROFİLİ</span>

          <h1>Hazırsın!</h1>

          <p className="tp-ready-lead">
            TarlaPusula başlangıç profilini oluşturdu.
          </p>

          <Card tone="subtle" flat className="tp-ready-progress-card">
            <div className="tp-ready-progress-copy">
              <strong>Profilin %30 tamamlandı</strong>
              <span>Seni kullandıkça daha iyi tanıyacağız.</span>
            </div>

            <div className="tp-ready-progress-bar" aria-hidden="true">
              <span />
            </div>
          </Card>

          <div className="tp-ready-benefits">
            <Card flat className="tp-ready-benefit">
              <span className="tp-ready-benefit-icon" aria-hidden="true">
                🌦️
              </span>
              <p>Hava ve risk uyarıları kişiselleşecek.</p>
            </Card>

            <Card flat className="tp-ready-benefit">
              <span className="tp-ready-benefit-icon" aria-hidden="true">
                🌱
              </span>
              <p>Ürünlerine uygun içerikler gösterilecek.</p>
            </Card>

            <Card flat className="tp-ready-benefit">
              <span className="tp-ready-benefit-icon" aria-hidden="true">
                🔔
              </span>
              <p>Gereksiz bildirimler azaltılacak.</p>
            </Card>
          </div>

          <Button
            size="lg"
            block
            onClick={onContinue}
            className="tp-ready-continue"
          >
            Ana Sayfaya Geç
          </Button>
        </Card>
      </main>
    </>
  );
}
