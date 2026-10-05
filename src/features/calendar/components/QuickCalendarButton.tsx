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

  const add = async () => {
    if (state === 'saving' || state === 'saved') return;
    setState('saving');

    try {
      const result = await addQuickCalendarReminder(reminder);
      setState('saved');
      onAdded?.(result.created);
    } catch (error) {
      console.warn('[calendar] Hızlı takvim kaydı eklenemedi:', error);
      setState('error');
    }
  };

  const text =
    state === 'saving'
      ? 'Ekleniyor…'
      : state === 'saved'
        ? savedLabel
        : state === 'error'
          ? 'Tekrar dene'
          : label;

  return (
    <button
      type="button"
      className={`tp-quick-calendar ${state === 'saved' ? 'is-saved' : ''} ${className}`.trim()}
      onClick={() => void add()}
      disabled={state === 'saving' || state === 'saved'}
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
    </button>
  );
}
