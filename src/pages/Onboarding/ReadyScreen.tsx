import {
  ArrowRight,
  Check,
  Compass,
  Sprout,
  CloudSun,
  Bell,
} from 'lucide-react';
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

      <main className="tp-ob-page tp-ready-page">
        <section className="tp-ready-shell">
          <div className="tp-ready-brand">
            <span><Compass size={20} /></span>
            <small>TARLAPUSULA</small>
          </div>

          <div className="tp-ready-check" aria-hidden="true">
            <Check size={28} strokeWidth={3} />
          </div>

          <span className="tp-ob-kicker">BAŞLANGIÇ PROFİLİN HAZIR</span>
          <h1>Hazırsın.</h1>
          <p className="tp-ready-lead">
            Verdiğin cevapları Pusula önerilerini ve içeriklerini sana göre düzenlemek için kullanacağız.
          </p>

          <div className="tp-ready-progress-card">
            <div className="tp-ready-progress-copy">
              <strong>Profilin %30 tamamlandı</strong>
              <span>Seni kullandıkça daha iyi tanıyacağız.</span>
            </div>
            <div className="tp-ready-progress-bar" aria-hidden="true"><span /></div>
          </div>

          <div className="tp-ready-benefits">
            <article className="tp-ready-benefit">
              <span><CloudSun size={17} /></span>
              <p>Hava ve risk uyarıları daha kişisel olacak.</p>
            </article>
            <article className="tp-ready-benefit">
              <span><Sprout size={17} /></span>
              <p>Ürünlerine uygun bilgi ve öneriler öne çıkacak.</p>
            </article>
            <article className="tp-ready-benefit">
              <span><Bell size={17} /></span>
              <p>Gereksiz bildirimler azaltılacak.</p>
            </article>
          </div>

          <button type="button" className="tp-ready-continue" onClick={onContinue}>
            <span>İlk tarlanı ekle</span>
            <ArrowRight size={17} />
          </button>
        </section>
      </main>
    </>
  );
}
