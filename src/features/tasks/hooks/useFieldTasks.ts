import { useCallback, useEffect, useRef, useState } from 'react';
import {
  completeFieldTask,
  dismissFieldTask,
  getFieldTasks,
  type FieldTask,
} from '../services/fieldTasks.service';

export function useFieldTasks(fieldId: string, open: boolean) {
  const [tasks, setTasks] = useState<FieldTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const refresh = useCallback(async () => {
    const requestedFieldId = String(fieldId ?? '').trim();
    const requestId = ++requestIdRef.current;

    if (!requestedFieldId || !open) {
      if (!requestedFieldId) setTasks([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const nextTasks = await getFieldTasks(requestedFieldId);
      if (requestId !== requestIdRef.current) return;

      setTasks(
        nextTasks.filter(
          (task) => String(task.fieldId ?? '').trim() === requestedFieldId,
        ),
      );
    } catch (caught) {
      if (requestId !== requestIdRef.current) return;
      setError(caught instanceof Error ? caught.message : 'Görevler yüklenemedi.');
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [fieldId, open]);

  useEffect(() => {
    // Yalnız tarla değişince eski listenin ekranda kalmasını engelle. Sheet'i
    // kapatıp açmak aynı veriyi silmesin; böylece tekrar açılış anlık olur.
    requestIdRef.current += 1;
    setTasks([]);
    setMessage(null);
    setError(null);
  }, [fieldId]);

  useEffect(() => {
    if (!open) return;
    void refresh();
  }, [open, refresh]);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;

    const handleTasksChanged = (event: Event) => {
      const changedFieldId = String(
        (event as CustomEvent)?.detail?.fieldId ?? '',
      );

      if (!changedFieldId || changedFieldId === fieldId) {
        void refresh();
      }
    };

    window.addEventListener('tp:tasks-changed', handleTasksChanged);
    return () => {
      window.removeEventListener('tp:tasks-changed', handleTasksChanged);
    };
  }, [fieldId, open, refresh]);

  const complete = useCallback(async (task: FieldTask) => {
    setMessage(null);
    const beforePoints = getGamificationState().points;

    try {
      const result = await completeFieldTask(task);
      setMessage(result.message);

      if (result.completed) {
        await refresh();

        try {
          const nextGamification = await refreshGamification();
          const gainedFromState = Math.max(0, nextGamification.points - beforePoints);
          const gainedFromResult = Math.max(0, Number((result as any)?.awardedPoints ?? 0));
          const gained = Math.max(gainedFromState, gainedFromResult);

          if (gained > 0) {
            showGamificationAward(
              task.title || 'Görev tamamlandı',
              gained,
              task.taskKey || 'TASK_REWARD',
            );
          }
        } catch (gamificationError) {
          console.warn('[tasks] Puan kutlaması yenilenemedi:', gamificationError);
        }
      }

      return result;
    } catch (caught) {
      const next = caught instanceof Error ? caught.message : 'Görev tamamlanamadı.';
      setMessage(next);
      return { completed: false, message: next };
    }
  }, [refresh]);

  const dismiss = useCallback(async (task: FieldTask) => {
    setMessage(null);
    try {
      const result = await dismissFieldTask(task);
      setMessage(result.message);
      await refresh();
      return result;
    } catch (caught) {
      const next = caught instanceof Error ? caught.message : 'Görev ertelenemedi.';
      setMessage(next);
      return { dismissed: false, message: next };
    }
  }, [refresh]);

  return {
    tasks,
    loading,
    error,
    message,
    refresh,
    complete,
    dismiss,
  };
}
