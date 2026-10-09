import { useState } from 'react';
import { CalendarPlus, Check, LoaderCircle } from 'lucide-react';
import {
  addQuickCalendarReminder,
  type QuickCalendarReminderInput,
} from '../services/quickCalendar.service';
import './QuickCalendarButton.css';

type Props = QuickCalendarReminderInput & {
  label?: string;
  savedLabel?: string;
  className?: string;
  onAdded?: (created: boolean) => void;
};

export default function QuickCalendarButton({
  label = 'Takvime ekle',
  savedLabel = 'Takvime eklendi',
  className = '',
  onAdded,
  ...reminder
}: Props) {
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const add = async () => {
    if (state === 'saving') return;
    if (state === 'saved') {
      window.dispatchEvent(new CustomEvent('tp:open-calendar'));
      return;
    }
    setState('saving');
    setErrorMessage('');

    try {
      const result = await addQuickCalendarReminder(reminder);
      setState('saved');
      onAdded?.(result.created);
    } catch (error) {
      console.warn('[calendar] Hızlı takvim kaydı eklenemedi:', error);
      setErrorMessage(error instanceof Error ? error.message : 'Takvim kaydı oluşturulamadı.');
      setState('error');
    }
  };

  const text =
    state === 'saving'
      ? 'Ekleniyor…'
      : state === 'saved'
        ? `${savedLabel} · Takvimde göster`
        : state === 'error'
          ? 'Tekrar dene'
          : label;

  return (
    <button
      type="button"
      className={`tp-quick-calendar ${state === 'saved' ? 'is-saved' : ''} ${className}`.trim()}
      onClick={() => void add()}
      disabled={state === 'saving'}
      title={state === 'error' ? errorMessage : undefined}
      aria-live="polite"
    >
      {state === 'saving' ? (
        <LoaderCircle className="is-spinning" size={15} aria-hidden="true" />
      ) : state === 'saved' ? (
        <Check size={15} aria-hidden="true" />
      ) : (
        <CalendarPlus size={15} aria-hidden="true" />
      )}
      <span>{text}</span>
      {state === 'error' && (
        <small role="alert" style={{ display:'block', fontSize:11, marginTop:3 }}>
          {errorMessage}
        </small>
      )}
    </button>
  );
}
