import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../../supabaseClient';

const styles = `
  :root{color-scheme:light}
  *{box-sizing:border-box}
  body{margin:0;background:#f4f5f6;color:#111827}
  .tp-delete-web{
    min-height:100vh;padding:28px 14px 52px;
    font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
  }
  .tp-delete-web-shell{width:min(100%,620px);margin:0 auto}
  .tp-delete-web-brand{
    display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;
    color:#111827;font-size:12px;font-weight:950;letter-spacing:-.02em;
  }
  .tp-delete-web-brand span:last-child{color:#747b84;font-size:9px;letter-spacing:.08em}
  .tp-delete-web-card{
    padding:22px;border:1px solid #dde1e5;border-radius:24px;background:#fff;
    box-shadow:0 18px 54px rgba(17,24,39,.08)
  }
  .tp-delete-web-kicker{display:block;color:#777f88;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
  .tp-delete-web h1{margin:7px 0 8px;font-size:28px;line-height:1.05;letter-spacing:-.045em}
  .tp-delete-web p{margin:0;color:#626b76;font-size:12px;line-height:1.55}
  .tp-delete-web-note{
    margin-top:14px;padding:12px;border:1px solid #e1e5e9;border-radius:14px;background:#f8f9fa;
    color:#4b5563;font-size:10px;line-height:1.5
  }
  .tp-delete-web-warning{
    margin-top:12px;padding:12px;border:1px solid #ecdada;border-radius:14px;background:#fff8f8;
    color:#7d3434;font-size:10px;line-height:1.5
  }
  .tp-delete-web-label{display:block;margin-top:15px;color:#4b5563;font-size:9px;font-weight:900;letter-spacing:.05em;text-transform:uppercase}
  .tp-delete-web-input{
    width:100%;min-height:46px;margin-top:6px;padding:0 13px;border:1px solid #d5dbe0;border-radius:13px;
    background:#fff;color:#111827;font:750 13px system-ui;outline:none
  }
  .tp-delete-web-input:focus{border-color:#111827;box-shadow:0 0 0 3px rgba(17,24,39,.08)}
  .tp-delete-web-primary,.tp-delete-web-danger,.tp-delete-web-soft{
    width:100%;min-height:46px;margin-top:10px;border-radius:13px;font:850 11px system-ui;cursor:pointer
  }
  .tp-delete-web-primary{border:1px solid #111827;background:#111827;color:#fff}
  .tp-delete-web-soft{border:1px solid #dce1e5;background:#f7f8f9;color:#111827}
  .tp-delete-web-danger{border:1px solid #8d2f2f;background:#8d2f2f;color:#fff}
  .tp-delete-web-primary:disabled,.tp-delete-web-danger:disabled,.tp-delete-web-soft:disabled{opacity:.45;cursor:not-allowed}
  .tp-delete-web-socials{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
  .tp-delete-web-socials button{margin-top:0}
  .tp-delete-web-divider{display:flex;align-items:center;gap:10px;margin:15px 0 2px;color:#9aa1a9;font-size:9px}
  .tp-delete-web-divider:before,.tp-delete-web-divider:after{content:"";height:1px;flex:1;background:#e4e7ea}
  .tp-delete-web-message{margin-top:10px;padding:10px;border-radius:12px;background:#f4f5f6;color:#4b5563;font-size:10px;line-height:1.45}
  .tp-delete-web-message.error{background:#fff1f1;color:#873939}
  .tp-delete-web-user{margin-top:13px;padding:11px;border:1px solid #e1e5e9;border-radius:14px;background:#fafafa}
  .tp-delete-web-user strong{display:block;font-size:11px}
  .tp-delete-web-user span{display:block;margin-top:3px;color:#6b7280;font-size:9.5px}
  .tp-delete-web-links{display:flex;justify-content:center;gap:14px;margin-top:14px;flex-wrap:wrap}
  .tp-delete-web-links a{color:#69717d;font-size:9px;text-decoration:underline;text-underline-offset:3px}
  @media(max-width:520px){
    .tp-delete-web{padding-top:14px}
    .tp-delete-web-card{padding:18px;border-radius:20px}
    .tp-delete-web h1{font-size:24px}
    .tp-delete-web-socials{grid-template-columns:1fr}
  }
`;

function deletionReturnUrl() {
  return `${window.location.origin}/?accountDeletion=1`;
}

export default function AccountDeletionPage() {
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [phrase, setPhrase] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [messageTone, setMessageTone] = useState<'error' | 'info'>('info');
  const [deleted, setDeleted] = useState(false);

  useEffect(() => {
    let alive = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (!alive) return;
      setUser(data.user ?? null);
      if (data.user?.email) setEmail(data.user.email);
      setChecking(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      setUser(session?.user ?? null);
      if (session?.user?.email) setEmail(session.user.email);
      setChecking(false);
    });

    return () => {
      alive = false;
      void listener.subscription.unsubscribe();
    };
  }, []);

  const sendMagicLink = async () => {
    const normalized = email.trim().toLowerCase();
    if (!normalized || loading) return;

    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          shouldCreateUser: false,
          emailRedirectTo: deletionReturnUrl(),
        },
      });

      if (error) throw error;

      setMessageTone('info');
      setMessage(
        'Giriş bağlantısını e-posta adresine gönderdik. Aynı cihazda bağlantıyı açıp bu sayfaya dönebilirsin.',
      );
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Giriş bağlantısı gönderilemedi.',
      );
    } finally {
      setLoading(false);
    }
  };

  const signInWithProvider = async (provider: 'google' | 'facebook') => {
    if (loading) return;
    setLoading(true);
    setMessage('');

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: deletionReturnUrl() },
      });
      if (error) throw error;
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error ? error.message : 'Giriş başlatılamadı.',
      );
      setLoading(false);
    }
  };

  const deleteAccount = async () => {
    if (loading || !user) return;

    if (phrase.trim().toLocaleUpperCase('tr-TR') !== 'SİL') {
      setMessageTone('error');
      setMessage('Devam etmek için SİL yazmalısın.');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      const { data, error } = await supabase.functions.invoke('delete-account', {
        body: { confirm: 'DELETE_MY_ACCOUNT' },
      });

      if (error) throw error;
      if (!data?.ok) {
        throw new Error(
          data?.userMessage || data?.error || 'Hesap silinemedi.',
        );
      }

      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Sunucudaki kullanıcı zaten silinmiş olabilir.
      }

      try {
        window.localStorage.removeItem('tarlapusula-auth');
      } catch {
        // Depolama erişimi engelliyse sayfa yine güvenli başarı durumunu gösterir.
      }

      setUser(null);
      setDeleted(true);
      setMessage('');
    } catch (error) {
      setMessageTone('error');
      setMessage(
        error instanceof Error
          ? error.message
          : 'Hesap silme işlemi tamamlanamadı.',
      );
    } finally {
      setLoading(false);
    }
  };

  const confirmed = phrase.trim().toLocaleUpperCase('tr-TR') === 'SİL';

  return (
    <>
      <style>{styles}</style>
      <main className="tp-delete-web">
        <div className="tp-delete-web-shell">
          <div className="tp-delete-web-brand">
            <span>TarlaPusula</span>
            <span>HESAP & VERİ SİLME</span>
          </div>

          <section className="tp-delete-web-card">
            {deleted ? (
              <>
                <span className="tp-delete-web-kicker">İŞLEM TAMAMLANDI</span>
                <h1>Hesabın silindi</h1>
                <p>
                  TarlaPusula hesabın ve hesabına bağlı uygulama verilerinin
                  silme işlemi tamamlandı.
                </p>
                <div className="tp-delete-web-warning">
                  App Store veya Google Play üzerinden aktif bir aboneliğin
                  varsa mağaza aboneliğini ayrıca mağaza hesabından yönetmen
                  gerekir.
                </div>
              </>
            ) : user ? (
              <>
                <span className="tp-delete-web-kicker">KALICI İŞLEM</span>
                <h1>TarlaPusula hesabını sil</h1>
                <p>
                  Bu işlem geri alınamaz. Tarlaların, tarımsal kayıtların,
                  fotoğrafların, analizlerin, bildirimlerin ve hesabına bağlı
                  TarlaPusula verileri silinir.
                </p>

                <div className="tp-delete-web-user">
                  <strong>Doğrulanmış hesap</strong>
                  <span>{user.email || 'Oturum açılmış kullanıcı'}</span>
                </div>

                <div className="tp-delete-web-warning">
                  Aktif App Store veya Google Play aboneliği hesabı silmekle
                  otomatik olarak iptal olmaz. Aboneliği ilgili mağaza
                  hesabından ayrıca iptal etmelisin.
                </div>

                <label className="tp-delete-web-label" htmlFor="delete-confirm">
                  Onaylamak için SİL yaz
                </label>
                <input
                  id="delete-confirm"
                  className="tp-delete-web-input"
                  value={phrase}
                  onChange={(event) => {
                    setPhrase(event.target.value);
                    if (message) setMessage('');
                  }}
                  autoComplete="off"
                  spellCheck={false}
                  disabled={loading}
                />

                <button
                  type="button"
                  className="tp-delete-web-danger"
                  disabled={!confirmed || loading}
                  onClick={() => void deleteAccount()}
                >
                  {loading ? 'Hesap siliniyor…' : 'Hesabı Kalıcı Olarak Sil'}
                </button>

                <button
                  type="button"
                  className="tp-delete-web-soft"
                  disabled={loading}
                  onClick={() => void supabase.auth.signOut({ scope: 'local' })}
                >
                  Bu hesaptan çık
                </button>
              </>
            ) : (
              <>
                <span className="tp-delete-web-kicker">GOOGLE PLAY & GİZLİLİK</span>
                <h1>Hesap ve verilerini sil</h1>
                <p>
                  TarlaPusula uygulaması telefonunda olmasa bile buradan
                  hesabını doğrulayıp kalıcı silme işlemini başlatabilirsin.
                </p>

                <div className="tp-delete-web-note">
                  Güvenlik için önce hesabın sana ait olduğunu doğrulamamız
                  gerekir. E-posta bağlantısı mevcut hesabına giriş yapar;
                  yeni hesap oluşturmaz.
                </div>

                <label className="tp-delete-web-label" htmlFor="delete-email">
                  TarlaPusula e-posta adresin
                </label>
                <input
                  id="delete-email"
                  type="email"
                  className="tp-delete-web-input"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="ornek@email.com"
                  autoComplete="email"
                  disabled={loading || checking}
                />

                <button
                  type="button"
                  className="tp-delete-web-primary"
                  disabled={loading || checking || !email.trim()}
                  onClick={() => void sendMagicLink()}
                >
                  {loading ? 'Gönderiliyor…' : 'Güvenli Giriş Bağlantısı Gönder'}
                </button>

                <div className="tp-delete-web-divider">veya</div>
                <div className="tp-delete-web-socials">
                  <button
                    type="button"
                    className="tp-delete-web-soft"
                    disabled={loading || checking}
                    onClick={() => void signInWithProvider('google')}
                  >
                    Google ile doğrula
                  </button>
                  <button
                    type="button"
                    className="tp-delete-web-soft"
                    disabled={loading || checking}
                    onClick={() => void signInWithProvider('facebook')}
                  >
                    Facebook ile doğrula
                  </button>
                </div>
              </>
            )}

            {message ? (
              <div className={`tp-delete-web-message ${messageTone === 'error' ? 'error' : ''}`}>
                {message}
              </div>
            ) : null}
          </section>

          <div className="tp-delete-web-links">
            <a href="/privacy-policy.html">Gizlilik Politikası</a>
            <a href="/">TarlaPusula ana sayfa</a>
          </div>
        </div>
      </main>
    </>
  );
}
