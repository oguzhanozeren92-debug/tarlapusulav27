import { supabase } from '../../../supabaseClient';
import type { HomeSystemNotification } from '../../decision/types/homeDecision';
import type { EarthSearchNdviStats } from '../../home-map/services/earthSearchNdvi.service';

function text(value: unknown) {
  return String(value ?? '').trim();
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function normalizeAreaKey(value: unknown) {
  return text(value)
    .toLocaleLowerCase('tr-TR')
    .replace(/\s+/g, '-');
}

function stableTaskKey(
  notification: HomeSystemNotification,
): string | null {
  const task = notification.task;
  if (!task) return null;

  const target = text(task.actionTarget);

  if (target === 'field-photo') {
    const metadata = objectValue(task.metadata);
    const semanticSource = text(metadata.source);
    const semanticTaskKey = text(task.taskKey);

    if (
      semanticSource === 'ndvi_follow_up' ||
      semanticSource === 'ndvi_relative_difference'
    ) {
      return null;
    }

    if (semanticSource === 'ndvi_anomaly' && semanticTaskKey) {
      return semanticTaskKey;
    }

    const importantArea = objectValue(metadata.importantArea);
    const areaKey = normalizeAreaKey(
      importantArea.area ?? metadata.direction,
    );

    /*
     * Konumu olmayan genel Pusula uyarısı bildirimdir, görev değildir.
     */
    if (!areaKey) return null;

    return `pusula-field-check:area:${areaKey}`;
  }

  return text(task.taskKey) || null;
}

export async function syncNotificationTasks(
  fieldId: string,
  notifications: HomeSystemNotification[],
  ndviStats: EarthSearchNdviStats | null = null,
) {
  const id = text(fieldId);
  if (!id || !supabase) return;
  void ndviStats;

  const taskNotifications = notifications
    .map((notification) => ({
      notification,
      taskKey: stableTaskKey(notification),
    }))
    .filter(
      (item): item is {
        notification: HomeSystemNotification;
        taskKey: string;
      } => {
        if (!item.taskKey) return false;
        if (item.taskKey.startsWith('ndvi-follow-up-photo:')) return false;
        if (item.taskKey === 'pusula-field-check:ndvi-relative') return false;
        if (item.taskKey.startsWith('pusula-field-check:ndvi-relative:')) return false;
        if (item.taskKey.startsWith('pusula-field-check:area:')) return false;
        return true;
      },
    );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;
  if (!user) return;

  const taskKeys = taskNotifications.map((item) => item.taskKey);

  /*
   * Ürün kararı: NDVI / göreli fark Görevlerim'e otomatik görev üretmez.
   * Eski sürümlerde üretilmiş açık NDVI saha görevleri temizlenir.
   * Göreli fark yalnız harita/analiz akışında kalır.
   */
  const now = new Date().toISOString();

  const { data: oldNdviTasks, error: oldNdviTasksError } = await supabase
    .from('field_todos')
    .select('id,task_key,completed,dismissed,metadata')
    .eq('user_id', user.id)
    .eq('field_id', id)
    .eq('completed', false)
    .eq('dismissed', false);

  if (oldNdviTasksError) throw oldNdviTasksError;

  for (const row of oldNdviTasks ?? []) {
    const rowTaskKey = text((row as any).task_key);
    const rowMetadata = objectValue((row as any).metadata);
    const rowSource = text(rowMetadata.source);
    const isNdviRelativeTask =
      rowTaskKey.startsWith('ndvi-follow-up-photo:') ||
      rowTaskKey === 'pusula-field-check:ndvi-relative' ||
      rowTaskKey.startsWith('pusula-field-check:ndvi-relative:') ||
      rowTaskKey.startsWith('pusula-field-check:area:') ||
      text(rowMetadata.taskBasis) === 'ndvi-relative-difference' ||
      rowSource === 'ndvi_follow_up' ||
      rowSource === 'ndvi_relative_difference';

    if (!isNdviRelativeTask) continue;

    const { error } = await supabase
      .from('field_todos')
      .update({
        completed: true,
        completed_at: now,
        metadata: {
          ...rowMetadata,
          autoResolved: true,
          autoResolvedAt: now,
          resolution: 'ndvi_analysis_no_longer_creates_tasks_or_notifications',
        },
        updated_at: now,
      })
      .eq('id', (row as any).id)
      .eq('user_id', user.id);

    if (error) throw error;
  }

  if (!taskNotifications.length) return;

  const { data: existingRows, error: existingError } = await supabase
    .from('field_todos')
    .select('id,task_key,completed,dismissed,metadata')
    .eq('user_id', user.id)
    .eq('field_id', id)
    .in('task_key', taskKeys);

  if (existingError) throw existingError;

  const existingByKey = new Map(
    (existingRows ?? []).map((row: any) => [String(row.task_key), row]),
  );

  for (const item of taskNotifications) {
    const notification = item.notification;
    const task = notification.task!;
    const taskKey = item.taskKey;

    const existing = existingByKey.get(taskKey);
    const taskMetadata = objectValue(task.metadata);
    const existingMetadata = objectValue(existing?.metadata);

    const metadata = {
      ...existingMetadata,
      ...taskMetadata,
      rewardPoints: Number(task.rewardPoints ?? 0),
      originalTaskKey: text(task.taskKey) || null,
      notificationId: notification.id,
      notificationSource: notification.source,
      notificationTarget: notification.target,
      notificationSeverity: notification.severity,
    };

    const values = {
      title: notification.title,
      description: notification.detail,
      source: 'notification-task',
      action_target: task.actionTarget,
      priority: notification.priority,
      reward_rule_key: task.rewardRuleKey ?? null,
      metadata,
      dismissed: false,
      updated_at: new Date().toISOString(),
    };

    if (existing) {
      if (existing.completed) continue;

      const { error } = await supabase
        .from('field_todos')
        .update(values)
        .eq('id', existing.id)
        .eq('user_id', user.id);

      if (error) throw error;
      continue;
    }

    const { error } = await supabase.from('field_todos').insert({
      user_id: user.id,
      field_id: id,
      task_key: taskKey,
      completed: false,
      ...values,
    });

    if (error && error.code !== '23505') throw error;
  }
}
