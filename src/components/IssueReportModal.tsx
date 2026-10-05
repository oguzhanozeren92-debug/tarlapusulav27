import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import './IssueReportModal.css';

type Props = {
  open: boolean;
  onClose: () => void;
  screen?: string;
};

type Category = 'bug' | 'suggestion' | 'content' | 'other';

const MAX_FILE_SIZE = 6 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function extensionFor(file: File) {
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  return 'jpg';
}

export default function IssueReportModal({ open, onClose, screen }: Props) {
  const [category, setCategory] = useState<Category>('bug');
  const [message, setMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!attachment) {
      setPreviewUrl('');
      return;
    }
    const url = URL.createObjectURL(attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [attachment]);

  useEffect(() => {
    if (!open) {
      setNotice('');
      setBusy(false);
    }
  }, [open]);

  const canSubmit = useMemo(
    () => message.trim().length >= 10 && message.trim().length <= 3000 && !busy,
    [message, busy],
  );

  if (!open) return null;

  const pickAttachment = (file: File | null) => {
    setNotice('');
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      setNotice('Ekran görüntüsü PNG, JPG veya WEBP olmalı.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setNotice('Ekran görüntüsü en fazla 6 MB olabilir.');
      return;
    }
    setAttachment(file);
  };

  const submit = async () => {
    const cleanMessage = message.trim();
    if (cleanMessage.length < 10) {
      setNotice('Sorunu en az 10 karakterle anlat.');
      return;
    }

    setBusy(true);
    setNotice('');
    let uploadedPath = '';

    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError || !auth.user) throw new Error('Hata bildirmek için oturum açık olmalı.');

      const user = auth.user;
      let attachmentMeta: {
        attachment_bucket?: string;
        attachment_path?: string;
        attachment_name?: string;
        attachment_mime_type?: string;
        attachment_size?: number;
      } = {};

      if (attachment) {
        const objectId =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        uploadedPath = `${user.id}/${objectId}.${extensionFor(attachment)}`;

        const { error: uploadError } = await supabase.storage
          .from('issue-report-attachments')
          .upload(uploadedPath, attachment, {
            contentType: attachment.type,
            upsert: false,
          });

        if (uploadError) throw uploadError;

        attachmentMeta = {
          attachment_bucket: 'issue-report-attachments',
          attachment_path: uploadedPath,
          attachment_name: attachment.name,
          attachment_mime_type: attachment.type,
          attachment_size: attachment.size,
        };
      }

      const { error: insertError } = await supabase.from('app_issue_reports').insert({
        user_id: user.id,
        user_email: user.email ?? null,
        category,
        message: cleanMessage,
        screen: String(screen || '').trim() || null,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        ...attachmentMeta,
      });

      if (insertError) throw insertError;

      setMessage('');
      setAttachment(null);
      setCategory('bug');
      setNotice('Bildirimin admine ulaştı. Teşekkürler.');
      window.dispatchEvent(new CustomEvent('tp:issue-report-submitted'));

      window.setTimeout(() => {
        setNotice('');
        onClose();
      }, 900);
    } catch (error: any) {
      if (uploadedPath) {
        void supabase.storage.from('issue-report-attachments').remove([uploadedPath]);
      }
      setNotice(error?.message || 'Bildirim gönderilemedi.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tp-issue-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="tp-issue-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Hata bildir"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <div>
            <small>TARLAPUSULA DESTEK</small>
            <h3>Hata bildir</h3>
            <p>Ne olduğunu yaz; istersen ekran görüntüsü de ekle.</p>
          </div>
          <button type="button" aria-label="Kapat" onClick={onClose}>×</button>
        </header>

        <label className="tp-issue-field">
          <span>Konu</span>
          <select value={category} onChange={(event) => setCategory(event.target.value as Category)}>
            <option value="bug">Uygulama hatası</option>
            <option value="suggestion">Öneri</option>
            <option value="content">İçerik sorunu</option>
            <option value="other">Diğer</option>
          </select>
        </label>

        <label className="tp-issue-field">
          <span>Mesajın</span>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value.slice(0, 3000))}
            rows={6}
            placeholder="Örn. Tarlalarım ekranında Yeni Tarla Ekle düğmesine basınca ekran boş kalıyor..."
          />
          <small>{message.trim().length}/3000</small>
        </label>

        <div className="tp-issue-attachment">
          <div>
            <strong>Ekran görüntüsü</strong>
            <span>PNG, JPG veya WEBP · en fazla 6 MB</span>
          </div>
          <label className="tp-issue-file-button">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => pickAttachment(event.target.files?.[0] ?? null)}
            />
            {attachment ? 'Görseli değiştir' : 'Ekran resmi ekle'}
          </label>
        </div>

        {previewUrl && (
          <div className="tp-issue-preview">
            <img src={previewUrl} alt="Eklenecek ekran görüntüsü önizlemesi" />
            <button type="button" onClick={() => setAttachment(null)}>Görseli kaldır</button>
          </div>
        )}

        {notice && <div className="tp-issue-notice" role="status">{notice}</div>}

        <footer>
          <button type="button" className="ghost" onClick={onClose}>Vazgeç</button>
          <button type="button" className="primary" disabled={!canSubmit} onClick={() => void submit()}>
            {busy ? 'Gönderiliyor…' : 'Admine gönder'}
          </button>
        </footer>
      </section>
    </div>
  );
}
