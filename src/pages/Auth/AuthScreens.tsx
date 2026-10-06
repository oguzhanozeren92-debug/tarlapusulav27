import {
  useState,
  type Dispatch,
  type FormEvent,
  type SetStateAction,
} from 'react';

import type { Screen } from '../../types';
import { Button, Card } from '../../ui';
import PusulaMark from '../../ui/brand/PusulaMark';
import { supabase } from '../../supabaseClient';
import {
  isNativeOAuthAvailable,
  startNativeOAuth,
} from '../../mobile/nativeAuth';
import './Auth.css';

type AuthScreensProps = {
  screen: Screen;
  setScreen: Dispatch<SetStateAction<Screen>>;
  cmsRuntimeCss: string;
  email: string;
  setEmail: Dispatch<SetStateAction<string>>;
  username: string;
  setUsername: Dispatch<SetStateAction<string>>;
  password: string;
  setPassword: Dispatch<SetStateAction<string>>;
  authLoading: boolean;
  authMessage: string;
  setAuthMessage: Dispatch<SetStateAction<string>>;
  verificationEmail: string;
  handleEmailRegister: (
    e: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
  handleEmailLogin: (
    e: FormEvent<HTMLFormElement>,
  ) => void | Promise<void>;
};

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5.5 19C6.5 15.8 8.8 14 12 14C15.2 14 17.5 15.8 18.5 19" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="5" y="10" width="14" height="10" rx="2.3" />
      <path d="M8 10V7.4C8 5.2 9.8 3.5 12 3.5C14.2 3.5 16 5.2 16 7.4V10" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="M4.5 7L12 12.5L19.5 7" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.04H12v3.86h5.38a4.6 4.6 0 0 1-2 3.02v2.5h3.24c1.9-1.75 2.98-4.33 2.98-7.34Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.63-2.43l-3.24-2.5c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.05v2.58A10 10 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.39 13.9A6 6 0 0 1 6.08 12c0-.66.11-1.3.31-1.9V7.52H3.05A10 10 0 0 0 2 12c0 1.61.39 3.14 1.05 4.48l3.34-2.58Z" />
      <path fill="#EA4335" d="M12 5.97c1.47 0 2.78.5 3.82 1.49l2.87-2.87C16.96 2.98 14.7 2 12 2a10 10 0 0 0-8.95 5.52l3.34 2.58C7.18 7.73 9.39 5.97 12 5.97Z" />
    </svg>
  );
}

function FacebookIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="#1877F2" />
      <path fill="#fff" d="M13.34 20v-7h2.35l.35-2.73h-2.7V8.53c0-.79.22-1.33 1.35-1.33h1.44V4.76c-.25-.03-1.1-.1-2.1-.1-2.08 0-3.5 1.27-3.5 3.6v2.01H8.5V13h2.33v7h2.51Z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M16.7 12.7c0-2.38 1.95-3.52 2.04-3.58a4.37 4.37 0 0 0-3.44-1.86c-1.46-.15-2.86.86-3.6.86-.75 0-1.9-.84-3.12-.82a4.6 4.6 0 0 0-3.9 2.37c-1.66 2.88-.42 7.13 1.2 9.46.8 1.14 1.73 2.42 2.97 2.37 1.2-.05 1.65-.77 3.1-.77 1.44 0 1.84.77 3.1.75 1.28-.02 2.1-1.15 2.88-2.3.91-1.33 1.29-2.62 1.31-2.69-.03-.01-2.54-.98-2.54-3.77Zm-2.36-6.98c.65-.79 1.09-1.89.97-2.98-.94.04-2.08.63-2.75 1.42-.6.7-1.13 1.82-.99 2.89 1.05.08 2.12-.54 2.77-1.33Z"
      />
    </svg>
  );
}

function EyeIcon({ off = false }: { off?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.8 12C4.9 8.8 7.9 7 12 7C16.1 7 19.1 8.8 21.2 12C19.1 15.2 16.1 17 12 17C7.9 17 4.9 15.2 2.8 12Z" />
      <circle cx="12" cy="12" r="2.6" />
      {off && <path d="M4 4L20 20" />}
    </svg>
  );
}

function SatelliteIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <rect x="20" y="17" width="9" height="9" rx="1.3" transform="rotate(45 20 17)" />
      <path d="M13 12L20 19M28 27L35 34M9 16L5 20L12 27L16 23M32 25L36 21L43 28L39 32" />
      <path d="M18 31C15 34 15 38 18 41M14 28C9 33 9 40 14 45" />
    </svg>
  );
}

function AiIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M20 9C15 9 11 13 11 18V30C11 35 15 39 20 39C22.3 39 24.4 38.2 26 36.8C27.6 38.2 29.7 39 32 39C37 39 41 35 41 30C41 27.8 40.2 25.8 38.8 24.2C40.2 22.6 41 20.6 41 18C41 13 37 9 32 9C29.7 9 27.6 9.8 26 11.2C24.4 9.8 22.3 9 20 9Z" />
      <path d="M26 11V37M17 17H22M17 24H22M17 31H22M30 17H36M30 24H36M30 31H36" />
    </svg>
  );
}

function WeatherIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M14 30H34C38.4 30 42 26.4 42 22C42 17.7 38.6 14.2 34.3 14C32.6 9.9 28.7 7 24 7C17.8 7 12.8 11.7 12.2 17.7C8.7 18.5 6 21.7 6 25.5C6 28 7.2 30.2 9 31.6" />
      <path d="M15 35L12 41M24 35L21 41M33 35L30 41" />
    </svg>
  );
}

function BrandHeader() {
  return (
    <header className="tp-authv2-brand">
      <PusulaMark
        size={64}
        animated
        className="tp-authv2-brand-mark"
        label="TarlaPusula pusulası"
      />

      <div className="tp-authv2-wordmark" aria-label="TarlaPusula">
        <span>Tarla</span>
        <strong>Pusula</strong>
        <i className="tp-authv2-wordmark-shine" aria-hidden="true" />
      </div>

      <p>
        Tarlanı takip eder,
        <br />
        zamanı gelince seni yönlendirir.
      </p>
    </header>
  );
}

function FeatureCards() {
  return (
    <section className="tp-authv2-features">
      <Card flat className="tp-authv2-feature">
        <span className="tp-authv2-feature-icon"><SatelliteIcon /></span>
        <strong>Tarlayı Uydudan Takip Etme</strong>
        <span className="tp-authv2-feature-chevron" aria-hidden="true">›</span>
      </Card>

      <Card flat className="tp-authv2-feature">
        <span className="tp-authv2-feature-icon"><AiIcon /></span>
        <strong>Yapay Zeka Entegrasyonu</strong>
        <span className="tp-authv2-feature-chevron" aria-hidden="true">›</span>
      </Card>

      <Card flat className="tp-authv2-feature">
        <span className="tp-authv2-feature-icon"><WeatherIcon /></span>
        <strong>Hava Durumu ve Uyarılar</strong>
        <span className="tp-authv2-feature-chevron" aria-hidden="true">›</span>
      </Card>
    </section>
  );
}

export default function AuthScreens({
  screen,
  setScreen,
  cmsRuntimeCss,
  email,
  setEmail,
  username,
  setUsername,
  password,
  setPassword,
  authLoading,
  authMessage,
  setAuthMessage,
  verificationEmail,
  handleEmailRegister,
  handleEmailLogin,
}: AuthScreensProps) {
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmPassword, setConfirmPassword] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'email' | 'code' | 'password' | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryPasswordConfirm, setRecoveryPasswordConfirm] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<'google' | 'facebook' | null>(null);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryComplete, setRecoveryComplete] = useState(false);
  const [rememberSession, setRememberSession] = useState(() => {
    try {
      return window.localStorage.getItem('tp_remember_session') !== 'false';
    } catch {
      return true;
    }
  });

  const visibleScreen =
    screen === 'welcome' || screen === 'login' ? 'emailLogin' : screen;

  const openLogin = () => {
    setAuthMessage('');
    setScreen('emailLogin');
  };

  const openRegister = () => {
    setAuthMessage('');
    setConfirmPassword('');
    setScreen('emailRegister');
  };

  const openPasswordRecovery = () => {
    setAuthMessage('');
    setRecoveryMessage('');
    setRecoveryEmail(email.trim().toLowerCase());
    setRecoveryCode('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
    setRecoveryComplete(false);
    setRecoveryStep('email');
  };

  const closePasswordRecovery = async () => {
    if (recoveryStep === 'password') {
      await supabase.auth.signOut();
    }
    setRecoveryStep(null);
    setRecoveryMessage('');
    setRecoveryCode('');
    setRecoveryPassword('');
    setRecoveryPasswordConfirm('');
  };

  const sendRecoveryCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanEmail = recoveryEmail.trim().toLowerCase();

    if (!cleanEmail) {
      setRecoveryMessage('E-posta adresini gir.');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryMessage('');

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail);
      if (error) throw error;

      setRecoveryEmail(cleanEmail);
      setRecoveryStep('code');
    } catch (error) {
      console.error('Şifre kurtarma kodu gönderilemedi:', error);
      setRecoveryMessage('Kod gönderilemedi. E-posta adresini kontrol edip tekrar dene.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const verifyRecoveryCode = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const cleanCode = recoveryCode.replace(/\D/g, '').slice(0, 6);

    if (cleanCode.length !== 6) {
      setRecoveryMessage('E-postana gelen 6 haneli kodu gir.');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryMessage('');

    try {
      const { error } = await supabase.auth.verifyOtp({
        email: recoveryEmail,
        token: cleanCode,
        type: 'recovery',
      });
      if (error) throw error;

      setRecoveryStep('password');
    } catch (error) {
      console.error('Şifre kurtarma kodu doğrulanamadı:', error);
      setRecoveryMessage('Kod hatalı veya süresi dolmuş. Tekrar kontrol et.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const saveRecoveredPassword = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (recoveryPassword.length < 8) {
      setRecoveryMessage('Yeni şifre en az 8 karakter olmalı.');
      return;
    }

    if (recoveryPassword !== recoveryPasswordConfirm) {
      setRecoveryMessage('Yeni şifreler birbiriyle eşleşmiyor.');
      return;
    }

    setRecoveryLoading(true);
    setRecoveryMessage('');

    try {
      const { error } = await supabase.auth.updateUser({
        password: recoveryPassword,
      });
      if (error) throw error;

      await supabase.auth.signOut();
      setEmail(recoveryEmail);
      setPassword('');
      setRecoveryStep(null);
      setRecoveryCode('');
      setRecoveryPassword('');
      setRecoveryPasswordConfirm('');
      setRecoveryComplete(true);
    } catch (error) {
      console.error('Yeni şifre kaydedilemedi:', error);
      setRecoveryMessage('Yeni şifre kaydedilemedi. Tekrar dene.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleSocialLogin = async (provider: 'google' | 'facebook') => {
    setAuthMessage('');
    setSocialLoading(provider);

    try {
      if (isNativeOAuthAvailable()) {
        await startNativeOAuth(provider);
        setSocialLoading(null);
        return;
      }

      const redirectTo = `${window.location.origin}/`;

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo },
      });

      if (error) throw error;
    } catch (error) {
      console.error(`${provider} ile giriş başlatılamadı:`, error);
      setSocialLoading(null);
      setAuthMessage(
        provider === 'google'
          ? 'Google ile giriş şu anda başlatılamadı.'
          : 'Facebook ile giriş şu anda başlatılamadı.',
      );
    }
  };

  const onSubmitLogin = (e: FormEvent<HTMLFormElement>) => {
    try {
      window.localStorage.setItem(
        'tp_remember_session',
        rememberSession ? 'true' : 'false',
      );
    } catch {
      // localStorage kullanılamıyorsa Supabase oturumu normal şekilde devam eder.
    }

    handleEmailLogin(e);
  };

  if (visibleScreen === 'emailLogin') {
    return (
      <>
        <style>{cmsRuntimeCss}</style>

        <main className="tp-authv2">
          <div className="tp-authv2-inner">
            <BrandHeader />

            <Card className="tp-authv2-panel">
              <h1>Giriş Yap</h1>

              {recoveryComplete && (
                <div className="tp-authv2-success">
                  Şifren yenilendi. Yeni şifrenle giriş yapabilirsin.
                </div>
              )}

              <form onSubmit={onSubmitLogin}>
                <div className="tp-authv2-group">
                  <label htmlFor="tp-login-email">Kullanıcı adı / E-posta</label>
                  <div className="tp-authv2-input">
                    <span className="tp-authv2-input-icon"><UserIcon /></span>
                    <input
                      id="tp-login-email"
                      type="email"
                      value={email}
                      placeholder="Kullanıcı adı / E-posta"
                      autoComplete="email"
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setAuthMessage('');
                      }}
                    />
                  </div>
                </div>

                <div className="tp-authv2-group">
                  <label htmlFor="tp-login-password">Şifre</label>
                  <div className="tp-authv2-input">
                    <span className="tp-authv2-input-icon"><LockIcon /></span>
                    <input
                      id="tp-login-password"
                      type={showLoginPassword ? 'text' : 'password'}
                      value={password}
                      placeholder="Şifre"
                      autoComplete="current-password"
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthMessage('');
                      }}
                    />
                    <button
                      type="button"
                      className="tp-authv2-eye"
                      onClick={() => setShowLoginPassword((v) => !v)}
                      aria-label={showLoginPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      <EyeIcon off={showLoginPassword} />
                    </button>
                  </div>
                </div>

                <div className="tp-authv2-forgot-row">
                  <button
                    type="button"
                    className="tp-authv2-forgot"
                    onClick={openPasswordRecovery}
                  >
                    Şifremi unuttum
                  </button>
                </div>

                <label className="tp-authv2-remember">
                  <input
                    type="checkbox"
                    checked={rememberSession}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setRememberSession(checked);

                      try {
                        window.localStorage.setItem(
                          'tp_remember_session',
                          checked ? 'true' : 'false',
                        );
                      } catch {
                        // Tercih bu tarayıcıda saklanamıyorsa yalnızca mevcut ekranda uygulanır.
                      }
                    }}
                  />
                  <span className="tp-authv2-checkmark" aria-hidden="true">
                    <svg viewBox="0 0 18 18">
                      <path d="M4.2 9.4 7.2 12.3 13.8 5.7" />
                    </svg>
                  </span>
                  <span className="tp-authv2-remember-copy">
                    <strong>Oturumumu açık tut</strong>
                    <small>Bu cihazda tekrar giriş isteme</small>
                  </span>
                </label>

                {authMessage && (
                  <div className="tp-authv2-message">{authMessage}</div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  block
                  className="tp-authv2-primary"
                  disabled={authLoading}
                >
                  {authLoading ? 'Giriş Yapılıyor...' : 'Giriş Yap'}
                </Button>
              </form>

              <div className="tp-authv2-social-login" aria-label="Sosyal giriş seçenekleri">
                <span className="tp-authv2-social-label">veya</span>
                <div className="tp-authv2-social-icons">
                  <button
                    type="button"
                    className="tp-authv2-social-button"
                    aria-label="Google ile devam et"
                    title="Google ile devam et"
                    disabled={socialLoading !== null}
                    onClick={() => void handleSocialLogin('google')}
                  >
                    <GoogleIcon />
                  </button>
                  <button
                    type="button"
                    className="tp-authv2-social-button"
                    aria-label="Facebook ile devam et"
                    title="Facebook ile devam et"
                    disabled={socialLoading !== null}
                    onClick={() => void handleSocialLogin('facebook')}
                  >
                    <FacebookIcon />
                  </button>
                  <button type="button" className="tp-authv2-social-button tp-authv2-social-button--apple" aria-label="Apple ile devam et" title="Apple ile giriş yakında" disabled>
                    <AppleIcon />
                  </button>
                </div>
              </div>

              <div className="tp-authv2-footer">
                <span>Hesabın yok mu?</span>
                <Button type="button" variant="secondary" size="sm" onClick={openRegister}>
                  Ücretsiz Üye Ol
                </Button>
              </div>
            </Card>

            {recoveryStep && (
              <div className="tp-authv2-recovery-overlay" role="presentation">
                <section
                  className="tp-authv2-recovery-sheet"
                  role="dialog"
                  aria-modal="true"
                  aria-label="Şifre yenileme"
                >
                  <button
                    type="button"
                    className="tp-authv2-recovery-close"
                    onClick={() => void closePasswordRecovery()}
                    aria-label="Şifre yenilemeyi kapat"
                  >
                    ×
                  </button>

                  <h2>
                    {recoveryStep === 'email'
                      ? 'Şifreni Yenile'
                      : recoveryStep === 'code'
                        ? 'Kodu Gir'
                        : 'Yeni Şifre Oluştur'}
                  </h2>

                  {recoveryStep === 'email' && (
                    <form onSubmit={sendRecoveryCode}>
                      <p className="tp-authv2-recovery-copy">
                        Hesabındaki e-posta adresini gir. Şifre yenileme kodunu bu adrese göndereceğiz.
                      </p>

                      <div className="tp-authv2-group">
                        <label htmlFor="tp-recovery-email">E-posta</label>
                        <div className="tp-authv2-input">
                          <span className="tp-authv2-input-icon"><MailIcon /></span>
                          <input
                            id="tp-recovery-email"
                            type="email"
                            value={recoveryEmail}
                            placeholder="ornek@mail.com"
                            autoComplete="email"
                            onChange={(e) => {
                              setRecoveryEmail(e.target.value);
                              setRecoveryMessage('');
                            }}
                            required
                          />
                        </div>
                      </div>

                      {recoveryMessage && <div className="tp-authv2-message">{recoveryMessage}</div>}

                      <Button type="submit" size="lg" block className="tp-authv2-primary" disabled={recoveryLoading}>
                        {recoveryLoading ? 'Kod Gönderiliyor...' : 'Kodu Gönder'}
                      </Button>
                    </form>
                  )}

                  {recoveryStep === 'code' && (
                    <form onSubmit={verifyRecoveryCode}>
                      <p className="tp-authv2-recovery-copy">
                        <strong>{recoveryEmail}</strong> adresine gelen 6 haneli kodu gir.
                      </p>

                      <div className="tp-authv2-group">
                        <label htmlFor="tp-recovery-code">Doğrulama Kodu</label>
                        <div className="tp-authv2-input tp-authv2-code-input">
                          <input
                            id="tp-recovery-code"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            maxLength={6}
                            value={recoveryCode}
                            placeholder="000000"
                            autoComplete="one-time-code"
                            onChange={(e) => {
                              setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6));
                              setRecoveryMessage('');
                            }}
                            required
                          />
                        </div>
                      </div>

                      {recoveryMessage && <div className="tp-authv2-message">{recoveryMessage}</div>}

                      <Button type="submit" size="lg" block className="tp-authv2-primary" disabled={recoveryLoading}>
                        {recoveryLoading ? 'Kod Kontrol Ediliyor...' : 'Kodu Doğrula'}
                      </Button>

                      <button
                        type="button"
                        className="tp-authv2-recovery-secondary"
                        onClick={() => {
                          setRecoveryCode('');
                          setRecoveryMessage('');
                          setRecoveryStep('email');
                        }}
                      >
                        Kodu tekrar gönder
                      </button>
                    </form>
                  )}

                  {recoveryStep === 'password' && (
                    <form onSubmit={saveRecoveredPassword}>
                      <p className="tp-authv2-recovery-copy">
                        Kod doğrulandı. Şimdi hesabın için yeni bir şifre oluştur.
                      </p>

                      <div className="tp-authv2-group">
                        <label htmlFor="tp-recovery-password">Yeni Şifre</label>
                        <div className="tp-authv2-input">
                          <span className="tp-authv2-input-icon"><LockIcon /></span>
                          <input
                            id="tp-recovery-password"
                            type="password"
                            value={recoveryPassword}
                            placeholder="En az 8 karakter"
                            autoComplete="new-password"
                            minLength={8}
                            onChange={(e) => {
                              setRecoveryPassword(e.target.value);
                              setRecoveryMessage('');
                            }}
                            required
                          />
                        </div>
                      </div>

                      <div className="tp-authv2-group">
                        <label htmlFor="tp-recovery-password-confirm">Yeni Şifre Tekrar</label>
                        <div className="tp-authv2-input">
                          <span className="tp-authv2-input-icon"><LockIcon /></span>
                          <input
                            id="tp-recovery-password-confirm"
                            type="password"
                            value={recoveryPasswordConfirm}
                            placeholder="Yeni şifreni tekrar gir"
                            autoComplete="new-password"
                            minLength={8}
                            onChange={(e) => {
                              setRecoveryPasswordConfirm(e.target.value);
                              setRecoveryMessage('');
                            }}
                            required
                          />
                        </div>
                      </div>

                      {recoveryMessage && <div className="tp-authv2-message">{recoveryMessage}</div>}

                      <Button type="submit" size="lg" block className="tp-authv2-primary" disabled={recoveryLoading}>
                        {recoveryLoading ? 'Şifre Kaydediliyor...' : 'Yeni Şifreyi Kaydet'}
                      </Button>
                    </form>
                  )}

                  <button
                    type="button"
                    className="tp-authv2-recovery-back"
                    onClick={() => void closePasswordRecovery()}
                  >
                    Giriş ekranına dön
                  </button>
                </section>
              </div>
            )}

            <FeatureCards />
          </div>
        </main>
      </>
    );
  }

  if (visibleScreen === 'emailRegister') {
    const onSubmitRegister = (e: FormEvent<HTMLFormElement>) => {
      if (password !== confirmPassword) {
        e.preventDefault();
        setAuthMessage('Şifreler birbiriyle eşleşmiyor.');
        return;
      }
      handleEmailRegister(e);
    };

    return (
      <>
        <style>{cmsRuntimeCss}</style>

        <main className="tp-authv2">
          <div className="tp-authv2-inner tp-authv2-register-inner">
            <BrandHeader />

            <Card className="tp-authv2-panel tp-authv2-register-panel">
              <h1>Ücretsiz Kaydolun</h1>

              <form onSubmit={onSubmitRegister}>
                <div className="tp-authv2-group">
                  <label htmlFor="tp-register-name">Ad Soyad</label>
                  <div className="tp-authv2-input">
                    <span className="tp-authv2-input-icon"><UserIcon /></span>
                    <input
                      id="tp-register-name"
                      type="text"
                      value={username}
                      placeholder="Ad Soyad"
                      autoComplete="name"
                      onChange={(e) => {
                        setUsername(e.target.value);
                        setAuthMessage('');
                      }}
                      required
                    />
                  </div>
                </div>

                <div className="tp-authv2-group">
                  <label htmlFor="tp-register-email">Email</label>
                  <div className="tp-authv2-input">
                    <span className="tp-authv2-input-icon"><MailIcon /></span>
                    <input
                      id="tp-register-email"
                      type="email"
                      value={email}
                      placeholder="Email"
                      autoComplete="email"
                      onChange={(e) => {
                        setEmail(e.target.value);
                        setAuthMessage('');
                      }}
                      required
                    />
                  </div>
                </div>

                <div className="tp-authv2-group">
                  <label htmlFor="tp-register-password">Şifre</label>
                  <div className="tp-authv2-input">
                    <span className="tp-authv2-input-icon"><LockIcon /></span>
                    <input
                      id="tp-register-password"
                      type={showRegisterPassword ? 'text' : 'password'}
                      value={password}
                      placeholder="Şifre"
                      autoComplete="new-password"
                      minLength={8}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        setAuthMessage('');
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="tp-authv2-eye"
                      onClick={() => setShowRegisterPassword((v) => !v)}
                      aria-label={showRegisterPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      <EyeIcon off={showRegisterPassword} />
                    </button>
                  </div>
                </div>

                <div className="tp-authv2-group">
                  <label htmlFor="tp-register-confirm">Tekrar Şifre</label>
                  <div className="tp-authv2-input">
                    <span className="tp-authv2-input-icon"><LockIcon /></span>
                    <input
                      id="tp-register-confirm"
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      placeholder="Tekrar Şifre"
                      autoComplete="new-password"
                      minLength={8}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        setAuthMessage('');
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="tp-authv2-eye"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      aria-label={showConfirmPassword ? 'Şifreyi gizle' : 'Şifreyi göster'}
                    >
                      <EyeIcon off={showConfirmPassword} />
                    </button>
                  </div>
                </div>

                {authMessage && (
                  <div className="tp-authv2-message">{authMessage}</div>
                )}

                <Button
                  type="submit"
                  size="lg"
                  block
                  className="tp-authv2-primary tp-authv2-register-primary"
                  disabled={authLoading}
                >
                  {authLoading ? 'Kayıt Oluşturuluyor...' : 'Kayıt Ol'}
                </Button>
              </form>

              <div className="tp-authv2-footer">
                <span>Zaten hesabın var mı?</span>
                <Button type="button" variant="secondary" size="sm" onClick={openLogin}>Oturum Aç</Button>
              </div>
            </Card>
          </div>
        </main>
      </>
    );
  }

  if (visibleScreen === 'emailVerification') {
    return (
      <>
        <style>{cmsRuntimeCss}</style>

        <main className="tp-authv2">
          <div className="tp-authv2-inner tp-authv2-verification-inner">
            <BrandHeader />

            <Card className="tp-authv2-panel tp-authv2-verification-panel">
              <div className="tp-authv2-verification-icon"><MailIcon /></div>
              <h1>E-postanı doğrula</h1>
              <p>Hesabını etkinleştirmek için gönderdiğimiz doğrulama bağlantısına tıkla.</p>
              <strong>{verificationEmail || email}</strong>

              <Button
                type="button"
                size="lg"
                block
                className="tp-authv2-primary"
                onClick={() => {
                  setPassword('');
                  setAuthMessage('');
                  setScreen('emailLogin');
                }}
              >
                Giriş Ekranına Git
              </Button>
            </Card>
          </div>
        </main>
      </>
    );
  }

  return null;
}
