import { supabase } from '../../../supabaseClient';

export type QuickCalendarReminderInput = {
  fieldId: string;
  reminderType: string;
  title: string;
  reminderDate: string;
  reminderTime?: string | null;
  notes?: string | null;
};

export type QuickCalendarReminderResult = {
  id: string;
  created: boolean;
};

function clean(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

export function calendarDateAfterDays(daysInput: number, base = new Date()) {
  const days = Number.isFinite(daysInput) ? Math.max(0, Math.round(daysInput)) : 0;
  const date = new Date(base);
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function normalizeCalendarDate(value: unknown) {
  const raw = clean(value, 24);
  const direct = raw.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (direct) return direct;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return '';
  return calendarDateAfterDays(0, parsed);
}

function notifyCalendarReminderSaved(
  id: string,
  fieldId: string,
  reminderDate: string,
  created: boolean,
) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('tp:calendar-reminder-added', {
    detail: { id, fieldId, reminderDate, created },
  }));
}

export async function addQuickCalendarReminder(
  input: QuickCalendarReminderInput,
): Promise<QuickCalendarReminderResult> {
  const fieldId = clean(input.fieldId, 100);
  const reminderType = clean(input.reminderType, 80) || 'Diğer';
  const title = clean(input.title, 180) || `${reminderType} hatırlatması`;
  const reminderDate = normalizeCalendarDate(input.reminderDate);
  const reminderTime = clean(input.reminderTime, 10) || null;
  const notes = clean(input.notes, 900) || null;

  if (!fieldId) throw new Error('Takvime eklemek için tarla seçilmeli.');
  if (!reminderDate) throw new Error('Takvime eklemek için geçerli tarih gerekli.');

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) throw new Error('Takvime eklemek için giriş yapmalısın.');

  const existingQuery = supabase
    .from('calendar_reminders')
    .select('id')
    .eq('user_id', user.id)
    .eq('field_id', fieldId)
    .eq('reminder_type', reminderType)
    .eq('title', title)
    .eq('reminder_date', reminderDate)
    .eq('completed', false)
    .limit(1);

  const { data: existing, error: existingError } = reminderTime
    ? await existingQuery.eq('reminder_time', reminderTime).maybeSingle()
    : await existingQuery.is('reminder_time', null).maybeSingle();

  if (existingError) throw existingError;

  if (existing?.id) {
    // Duplicates are valid saved entries too. Refresh Calendar, so the
    // previously saved item is immediately visible after the button is tapped.
    notifyCalendarReminderSaved(String(existing.id), fieldId, reminderDate, false);
    return { id: String(existing.id), created: false };
  }

  const { data, error } = await supabase
    .from('calendar_reminders')
    .insert({
      user_id: user.id,
      field_id: fieldId,
      reminder_type: reminderType,
      title,
      reminder_date: reminderDate,
      reminder_time: reminderTime,
      notes,
      completed: false,
      notification_enabled: true,
      timezone:
        Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Istanbul',
    })
    .select('id')
    .single();

  if (error) throw error;

  notifyCalendarReminderSaved(String(data.id), fieldId, reminderDate, true);

  return { id: String(data.id), created: true };
}
