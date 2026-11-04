import { useEffect, useState } from 'react';
import { enableNativePushNotifications } from './nativePush';
import { enableNativeLocalReminders, nativeLocalEnabled, nativeLocalSupported, testNativeLocalReminder } from './nativeLocalReminders';

const OFFER = 'tp:local-reminder-offered:v1';
export default function NativeLocalReminderOffer() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!nativeLocalSupported() || nativeLocalEnabled() || localStorage.getItem(OFFER) === '1') return;
    const timer = window.setTimeout(() => setVisible(true), 2500);
    return () => window.clearTimeout(timer);
  }, []);
  if (!visible) return null;
  const dismiss = () => { localStorage.setItem(OFFER, '1'); setVisible(false); };
  const enable = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await enableNativeLocalReminders();
      await testNativeLocalReminder();
      dismiss();
      // Remote push remains separate: a missing APNs token must NOT break local reminders.
      void enableNativePushNotifications().catch(e => console.info('TarlaPusula remote alerts require APNs registration:', e));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Bildirim ayarı açılamadı.');
    } finally { setBusy(false); }
  };
  return <aside role="dialog" aria-label="TarlaPusula bildirim izni"
    style={{position:'fixed',left:'max(12px, env(safe-area-inset-left))',right:'max(12px, env(safe-area-inset-right))',
      bottom:'calc(18px + env(safe-area-inset-bottom))',zIndex:4000,padding:18,borderRadius:20,
      border:'1px solid #a2c5ad',boxShadow:'0 14px 46px #123f2455',background:'#f3fff7',color:'#16432a',
      maxWidth:430,margin:'0 auto'}}>
    <strong style={{fontSize:17}}>🔔 TarlaPusula bildirimlerini aç</strong>
    <p style={{fontSize:13,lineHeight:1.55,margin:'8px 0'}}>
      İzin verirsen haftalık tarla kontrolünü iPhone hatırlatır. Gerçek uydu, hava ve Pusula uyarıları için sunucu bildirim kaydını da deneriz.
    </p>
    {error && <p role="alert" style={{color:'#a12d36',fontSize:12}}>{error}</p>}
    <div style={{display:'flex',gap:9}}>
      <button type="button" disabled={busy} onClick={() => void enable()}
        style={{flex:1,border:0,borderRadius:12,padding:12,color:'white',background:'#147545',fontWeight:800}}>
        {busy?'Açılıyor…':'Bildirimleri aç'}
      </button>
      <button type="button" onClick={dismiss} disabled={busy}
        style={{border:'1px solid #b4cbbb',borderRadius:12,padding:12,background:'white',color:'#254c37',fontWeight:700}}>
        Şimdi değil
      </button>
    </div>
  </aside>;
}
