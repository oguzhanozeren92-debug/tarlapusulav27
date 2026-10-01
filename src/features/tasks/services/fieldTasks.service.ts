import { supabase } from '../../../supabaseClient';
import type { BiophysicalTaskCandidate } from '../../../services/fieldBiophysicsInsight.service';
import type { IrrigationDecisionSynthesis } from '../../irrigation/types/irrigationDecision';

const TASK_NOTIFICATION_STORAGE_KEY = 'tp_system_notifications_v1';

const TASK_MAINTENANCE_TTL_MS = 60_000;
const taskMaintenanceStartedAt = new Map<string, number>();
const taskMaintenanceInFlight = new Map<string, Promise<void>>();

export type FieldTask = {
  id: string;
  fieldId: string;
  title: string;
  description: string | null;
  source: string;
  actionTarget: string | null;
  priority: number;
  rewardPoints: number;
  dueDate: string | null;
  taskKey: string | null;
  metadata: Record<string, unknown>;
  completed: boolean;
  createdAt: string | null;
  fieldName?: string | null;
};

type RawFieldTask = {
  id?: unknown;
  field_id?: unknown;
  title?: unknown;
  description?: unknown;
  source?: unknown;
  action_target?: unknown;
  priority?: unknown;
  reward_rule_key?: unknown;
  metadata?: unknown;
  due_date?: unknown;
  task_key?: unknown;
  completed?: unknown;
  created_at?: unknown;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

function trTitle(value: unknown) {
  const raw = text(value);
  if (!raw) return '';
  return raw.charAt(0).toLocaleUpperCase('tr-TR') + raw.slice(1);
}

function taskTitleWithFieldName(titleInput: unknown, fieldNameInput: unknown) {
  const raw = text(titleInput).replace(/\s+/g, ' ');
  const fieldName = trTitle(fieldNameInput);
  if (!raw || !fieldName) return raw;

  if (/^tarlanın\b/iu.test(raw)) {
    return raw.replace(/^tarlanın\b/iu, `${fieldName} tarlasının`);
  }

  if (/^tarla\b/iu.test(raw)) {
    return raw.replace(/^tarla\b/iu, `${fieldName} tarlası`);
  }

  return raw;
}

function metadataObject(metadata: unknown): Record<string, unknown> {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, unknown>;
}

export function resolveTaskRewardPoints(input: {
  taskKey?: unknown;
  source?: unknown;
  actionTarget?: unknown;
  title?: unknown;
  metadata?: unknown;
}) {
  const metadata = metadataObject(input.metadata);
  const explicit = Number(metadata.rewardPoints ?? metadata.reward_points ?? 0);

  if (Number.isFinite(explicit) && explicit > 0) {
    return Math.max(1, Math.round(explicit));
  }

  const taskKey = text(input.taskKey).toLocaleLowerCase('tr-TR');
  const source = text(input.source).toLocaleLowerCase('tr-TR');
  const actionTarget = text(input.actionTarget).toLocaleLowerCase('tr-TR');
  const title = text(input.title).toLocaleLowerCase('tr-TR');

  if (taskKey === 'irrigation-status') return 20;
  if (taskKey === 'canopy-development') return 15;
  if (taskKey === 'canopy-height') return 15;
  if (taskKey === 'model-planting-date') return 10;
  if (taskKey === 'model-crop-variety') return 5;
  if (taskKey === 'model-last-irrigation') return 10;

  if (taskKey === 'irrigation-method') return 15;
  if (taskKey === 'model-surface-water-measurement') return 30;
  if (taskKey.startsWith('model-growth-stage-observation:')) return 20;
  if (taskKey === 'model-last-irrigation-amount') return 15;
  if (taskKey === 'irrigation-synthesis-field-check') return 25;
  if (taskKey === 'biophysics-field-check') return 30;

  if (taskKey === 'notification:soil-analysis') return 150;
  if (taskKey.startsWith('pusula-field-check:')) return 30;
  if (actionTarget === 'field-photo') return 30;

  if (title.includes('toprak analizi')) return 150;
  if (title.includes('fotoğraf')) return 30;
  if (title.includes('bitki gidişat')) return 30;
  if (title.includes('nem')) return 25;
  if (title.includes('sulama')) return 15;
  if (title.includes('gelişim evresi')) return 20;

  if (source === 'irrigation_synthesis') return 25;
  if (source === 'model-readiness') return 15;
  if (source === 'field-readiness') return 15;
  if (source === 'pusula' || source === 'notification-task') return 20;

  // Görevlerim ekranına düşen gerçek bir görev asla puansız kalmaz.
  return 10;
}

export function taskNotificationSubject(task: Pick<FieldTask, 'title'>) {
  const raw = text(task.title).replace(/\s+/g, ' ');
  const title = raw.toLocaleLowerCase('tr-TR');

  if (!raw) return 'Görev';
  if (title.includes('külleme')) return 'Bağ küllemesi';
  if (title.includes('toprak analizi')) return 'Toprak analizi';
  if (title.includes('toprak nem')) return 'Toprak nemi';
  if (title.includes('son sulama')) return 'Sulama kaydı';
  if (title.includes('uydu görünt')) return 'Uydu görüntüsü';
  if (title.includes('gelişim evresi')) return 'Gelişim evresi';
  if (title.includes('fotoğraf')) return 'Tarla fotoğrafı';
  if (title.includes('bitki gidişat')) return 'Bitki gidişatı';

  const direction = [
    ['doğu', 'Doğu bölüm'],
    ['batı', 'Batı bölüm'],
    ['kuzey', 'Kuzey bölüm'],
    ['güney', 'Güney bölüm'],
    ['merkez', 'Merkez bölüm'],
  ].find(([needle]) => title.includes(needle));

  if (direction && title.includes('kontrol')) {
    return `${direction[1]} kontrolü`;
  }

  const cleaned = raw
    .replace(/\b(?:tarlanın|tarla|tarlayı|tarlada)\b/giu, '')
    .replace(/\b(?:kontrol et|ekle|ölç|incele|doğrula|kaydet)\b/giu, '')
    .replace(/\s+/g, ' ')
    .trim();

  const value = cleaned || raw;
  return value.length > 34 ? `${value.slice(0, 31).trimEnd()}…` : value;
}

export function taskNotificationTitle(task: Pick<FieldTask, 'title'>) {
  return text(task.title) || 'Yeni görev';
}

export function taskNotificationMessage(
  task: Pick<FieldTask, 'description' | 'rewardPoints'>,
) {
  const summary = text(task.description)
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)[0]
    ?.trim();

  const shortSummary =
    summary && summary.length > 72
      ? `${summary.slice(0, 69).trimEnd()}…`
      : summary;

  return `Yeni görev tanımlandı · +${task.rewardPoints} Pusula Puanı${
    shortSummary ? ` · ${shortSummary}` : ''
  }`;
}

function normalizeTask(row: RawFieldTask): FieldTask {
  const metadata = metadataObject(row.metadata);
  const taskKey = text(row.task_key) || null;
  const source = text(row.source) || 'user';
  const actionTarget = text(row.action_target) || null;
  const title = text(row.title) || 'Görev';
  const points = resolveTaskRewardPoints({
    taskKey,
    source,
    actionTarget,
    title,
    metadata,
  });

  return {
    id: text(row.id),
    fieldId: text(row.field_id),
    title,
    description: text(row.description) || null,
    source,
    actionTarget,
    priority: Number.isFinite(Number(row.priority)) ? Number(row.priority) : 0,
    rewardPoints: points,
    dueDate: text(row.due_date) || null,
    taskKey,
    metadata: {
      ...metadata,
      rewardPoints: points,
    },
    completed: Boolean(row.completed),
    createdAt: text(row.created_at) || null,
  };
}

function emitTasksChanged(fieldId: string) {
  if (typeof window === 'undefined') return;

  window.dispatchEvent(
    new CustomEvent('tp:tasks-changed', {
      detail: { fieldId },
    }),
  );
}

function linkedTaskId(item: any) {
  const direct = text(item?.taskId ?? item?.task_id ?? item?.task?.id);
  if (direct) return direct;

  const id = text(item?.id);
  if (id.startsWith('task-defined:')) return id.slice('task-defined:'.length);
  if (id.startsWith('task-notice:')) return id.slice('task-notice:'.length);

  return '';
}

function removeTaskNotification(taskIdInput: string) {
  if (typeof window === 'undefined') return;

  const taskId = text(taskIdInput);
  if (!taskId) return;

  try {
    const raw = window.localStorage.getItem(TASK_NOTIFICATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const previous = Array.isArray(parsed) ? parsed : [];

    const next = previous.filter((item: any) => {
      if (!item || typeof item !== 'object') return false;
      return linkedTaskId(item) !== taskId;
    });

    window.localStorage.setItem(
      TASK_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(next),
    );
    window.dispatchEvent(
      new CustomEvent('tp:notifications-updated', {
        detail: { notifications: next },
      }),
    );
  } catch {
    // Bildirim temizliği başarısız olsa bile görev akışı devam eder.
  }
}

function publishTaskNotifications(tasks: FieldTask[], fieldNameInput?: string | null) {
  if (typeof window === 'undefined') return;

  try {
    const raw = window.localStorage.getItem(TASK_NOTIFICATION_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    const previous = Array.isArray(parsed) ? parsed : [];
    const byId = new Map<string, any>();

    /*
     * Görev bildirimleri field_todos'taki aktif görevlerden yeniden kurulur.
     * Böylece bitmiş/gizlenmiş/eski görevin bildirimi listede asılı kalmaz.
     */
    previous.forEach((item: any) => {
      if (!item?.id || item.kind === 'task') return;

      const taskId = linkedTaskId(item);
      const isTaskNotification =
        Boolean(taskId) ||
        item.source === 'task-system' ||
        String(item.id).startsWith('task-defined:') ||
        String(item.id).startsWith('task-notice:');

      if (isTaskNotification) return;
      byId.set(String(item.id), item);
    });

    const nowIso = new Date().toISOString();
    const fieldName = trTitle(fieldNameInput);

    tasks.forEach((task) => {
      if (!task.id) return;

      const notificationId = `task-defined:${task.id}`;
      const existing = previous.find(
        (item: any) => String(item?.id ?? '') === notificationId,
      );
      const createdAt = task.createdAt || existing?.createdAt || nowIso;

      const nextTitle = taskNotificationTitle(task);
      const nextMessage = taskNotificationMessage(task);
      const contentChanged =
        !existing ||
        text(existing.title) !== nextTitle ||
        text(existing.message) !== nextMessage ||
        text(existing.fieldName) !== fieldName;

      byId.set(notificationId, {
        id: notificationId,
        fieldId: task.fieldId,
        fieldName: fieldName || existing?.fieldName || null,
        source: 'task-system',
        severity: task.priority >= 90 ? 'warning' : 'info',
        title: nextTitle,
        message: nextMessage,
        iconKey: 'task',
        target: 'tasks',
        priority: task.priority,
        kind: 'notification',
        // Bildirim kendi kaydıdır; gerçek görev field_todos'ta yaşar.
        // Aradaki tek bağ taskId'dir, görev verisini bildirime kopyalamıyoruz.
        taskId: task.id,
        isRead: contentChanged ? false : (existing?.isRead ?? false),
        createdAt: existing?.createdAt ?? createdAt,
        // Aynı açık görev her senkronizasyonda tekrar "yeni" görünmesin.
        updatedAt: contentChanged ? nowIso : (existing?.updatedAt ?? createdAt),
      });
    });

    const next = Array.from(byId.values())
      .sort((a: any, b: any) => {
        const at = new Date(a.updatedAt ?? a.createdAt ?? 0).getTime();
        const bt = new Date(b.updatedAt ?? b.createdAt ?? 0).getTime();
        return bt - at;
      })
      .slice(0, 160);

    window.localStorage.setItem(
      TASK_NOTIFICATION_STORAGE_KEY,
      JSON.stringify(next),
    );
    window.dispatchEvent(
      new CustomEvent('tp:notifications-updated', {
        detail: { notifications: next },
      }),
    );
  } catch (error) {
    console.warn('[tasks] Yeni görev bildirimi kaydedilemedi:', error);
  }
}



export function syncBiophysicalTrendTaskBestEffort(
  fieldIdInput: string,
  candidate: BiophysicalTaskCandidate | null | undefined,
) {
  const fieldId = text(fieldIdInput);
  if (!fieldId || !supabase) return;

  void (async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return;

    const taskKey = 'biophysics-field-check';
    const { data: existing, error: existingError } = await supabase
      .from('field_todos')
      .select('id,completed,dismissed,metadata')
      .eq('user_id', userData.user.id)
      .eq('field_id', fieldId)
      .eq('task_key', taskKey)
      .maybeSingle();

    if (existingError) throw existingError;

    const existingMetadata = metadataObject(existing?.metadata);
    const now = new Date().toISOString();

    if (!candidate?.active) {
      if (existing && !existing.completed && !existing.dismissed) {
        const { error } = await supabase
          .from('field_todos')
          .update({
            completed: true,
            completed_at: now,
            metadata: {
              ...existingMetadata,
              autoResolved: true,
              autoResolvedAt: now,
              resolution: 'biophysical_trend_normalized',
            },
            updated_at: now,
          })
          .eq('id', existing.id)
          .eq('user_id', userData.user.id);

        if (error) throw error;
        removeTaskNotification(String(existing.id));
        emitTasksChanged(fieldId);
      }
      return;
    }

    const sceneId = text(candidate.sceneId);
    if (
      existing &&
      !existing.completed &&
      !existing.dismissed &&
      text(existingMetadata.sceneId) === sceneId
    ) {
      return;
    }

    const row = {
      title: candidate.title,
      description: candidate.description,
      source: 'biophysics_trend',
      action_target: 'field-photo',
      priority: candidate.priority,
      reward_rule_key: null,
      due_date: null,
      completed: false,
      completed_at: null,
      dismissed: false,
      metadata: {
        sceneId: candidate.sceneId,
        acquiredAt: candidate.acquiredAt,
        reasonCodes: candidate.reasonCodes,
        sourceLayer: candidate.sourceLayer,
        openPhoto: candidate.openPhoto,
        productionAuthority: false,
        verificationReason: 'biophysical_multi_signal_decline',
        rewardPoints: candidate.rewardPoints,
      },
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from('field_todos')
        .update(row)
        .eq('id', existing.id)
        .eq('user_id', userData.user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('field_todos').insert({
        ...row,
        user_id: userData.user.id,
        field_id: fieldId,
        task_key: taskKey,
      });
      if (error) throw error;
    }

    emitTasksChanged(fieldId);
  })().catch((error: unknown) => {
    console.warn('[tasks] Biyofizik trend görevi senkronize edilemedi:', error);
  });
}

export function syncIrrigationSynthesisVerificationTaskBestEffort(
  fieldIdInput: string,
  synthesis: IrrigationDecisionSynthesis | null | undefined,
) {
  const fieldId = text(fieldIdInput);
  if (!fieldId || !supabase) return;

  void (async () => {
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) return;

    const taskKey = 'irrigation-synthesis-field-check';
    const { data: existing, error: existingError } = await supabase
      .from('field_todos')
      .select('id,completed,dismissed,metadata')
      .eq('user_id', userData.user.id)
      .eq('field_id', fieldId)
      .eq('task_key', taskKey)
      .maybeSingle();

    if (existingError) throw existingError;

    const existingMetadata = metadataObject(existing?.metadata);
    const isMixed = synthesis?.agreement === 'mixed';

    if (!isMixed) {
      if (existing && !existing.completed && !existing.dismissed) {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('field_todos')
          .update({
            completed: true,
            completed_at: now,
            metadata: {
              ...existingMetadata,
              autoResolved: true,
              autoResolvedAt: now,
              resolution: 'irrigation_models_reconciled',
            },
            updated_at: now,
          })
          .eq('id', existing.id)
          .eq('user_id', userData.user.id);
        if (error) throw error;
        emitTasksChanged(fieldId);
      }
      return;
    }

    if (existing?.dismissed && existingMetadata.suppressSimilarTask === true) return;

    const generatedAt = text(synthesis?.generatedAt) || new Date().toISOString();
    if (
      existing?.completed &&
      text(existingMetadata.synthesisGeneratedAt) === generatedAt
    ) {
      return;
    }

    const now = new Date().toISOString();
    const row = {
      title: 'Sulama Kararını Sahada Doğrula',
      description:
        'Ana sulama önerisi korunuyor; pyfao56 kısa dönem su dengesi ayrıştığı için son sulama kaydını ve tarladaki gerçek koşulları kontrol et.',
      source: 'irrigation_synthesis',
      action_target: 'irrigation_detail',
      priority: 92,
      reward_rule_key: null,
      due_date: null,
      completed: false,
      completed_at: null,
      dismissed: false,
      metadata: {
        synthesisGeneratedAt: generatedAt,
        synthesisAgreement: synthesis?.agreement ?? null,
        synthesisConfidence: synthesis?.confidence ?? null,
        stageLabel: synthesis?.stageLabel ?? null,
        evidence: (synthesis?.evidence ?? []).slice(0, 5),
        warnings: (synthesis?.warnings ?? []).slice(0, 3),
        productionAuthority: false,
        verificationReason: 'model_divergence',
        rewardPoints: 25,
      },
      updated_at: now,
    };

    if (existing?.id) {
      const { error } = await supabase
        .from('field_todos')
        .update(row)
        .eq('id', existing.id)
        .eq('user_id', userData.user.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('field_todos').insert({
        ...row,
        user_id: userData.user.id,
        field_id: fieldId,
        task_key: taskKey,
      });
      if (error) throw error;
    }

    emitTasksChanged(fieldId);
  })().catch((error: unknown) => {
    console.warn('[tasks] Sulama sentezi saha doğrulama görevi senkronize edilemedi:', error);
  });
}

export function syncIrrigationEvidenceTasksBestEffort(fieldIdInput: string) {
  const fieldId = text(fieldIdInput);
  if (!fieldId || !supabase) return;

  void supabase
    .rpc('tp_sync_irrigation_evidence_tasks', { p_field_id: fieldId })
    .then(({ error }) => {
      if (error) {
        console.warn(
          '[tasks] Sulama kanıtı görevleri senkronize edilemedi:',
          error.message,
        );
        return;
      }

      emitTasksChanged(fieldId);
    })
    .catch((error: unknown) => {
      console.warn(
        '[tasks] Sulama kanıtı görevleri senkronize edilemedi:',
        error,
      );
    });
}

async function synchronizeGeneratedTasks(fieldId: string) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  const results = await Promise.allSettled([
    supabase.rpc('tp_sync_field_tasks', { p_field_id: fieldId }),
    supabase.rpc('tp_sync_model_readiness_tasks', { p_field_id: fieldId }),
    supabase.rpc('tp_sync_irrigation_evidence_tasks', {
      p_field_id: fieldId,
    }),
    supabase.rpc('tp_sync_growth_stage_observation_task', {
      p_field_id: fieldId,
    }),
    supabase.rpc('tp_sync_irrigation_amount_task', {
      p_field_id: fieldId,
    }),
    supabase.rpc('tp_refresh_action_tasks', {
      p_field_id: fieldId,
    }),
  ]);

  for (const result of results) {
    if (result.status === 'fulfilled' && result.value?.error) {
      console.warn(
        '[tasks] Görev senkronizasyonu:',
        result.value.error.message,
      );
    }
  }
}


function isLegacyNdviRelativeAutoTask(row: any) {
  const taskKey = text(row?.task_key ?? row?.taskKey);
  const metadata = metadataObject(row?.metadata);
  const metadataSource = text(metadata.source).toLocaleLowerCase('tr-TR');
  const importantArea = metadataObject(metadata.importantArea);
  const searchable = [
    row?.title,
    row?.description,
    row?.source,
    row?.action_target ?? row?.actionTarget,
    taskKey,
    metadataSource,
    metadata.taskBasis,
    metadata.notificationId,
    metadata.originalTaskKey,
    importantArea.summary,
    JSON.stringify(importantArea.evidence ?? []),
  ]
    .map((value) => text(value, 2000).toLocaleLowerCase('tr-TR'))
    .join(' ');

  const explicitNdviTask =
    taskKey.startsWith('ndvi-follow-up-photo:') ||
    taskKey === 'pusula-field-check:ndvi-relative' ||
    taskKey.startsWith('pusula-field-check:ndvi-relative:') ||
    taskKey.startsWith('pusula-field-check:area:') ||
    metadataSource === 'ndvi_follow_up' ||
    metadataSource === 'ndvi_relative_difference';

  const ndviAreaEvidence =
    text(metadata.sourceLayer).toLocaleLowerCase('tr-TR') === 'vegetation' &&
    (
      searchable.includes('ndvi') ||
      searchable.includes('parsel ortalamas') ||
      searchable.includes('göreli bitki gelişim fark')
    );

  return explicitNdviTask || ndviAreaEvidence;
}

async function closeLegacyNdviRelativeAutoTasks(fieldId: string) {
  if (!supabase) return;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return;

  const { data, error } = await supabase
    .from('field_todos')
    .select('id,title,description,source,action_target,task_key,metadata')
    .eq('user_id', user.id)
    .eq('field_id', fieldId)
    .eq('completed', false)
    .eq('dismissed', false);

  if (error) throw error;

  const obsolete = (data ?? []).filter(isLegacyNdviRelativeAutoTask);
  if (!obsolete.length) return;

  const now = new Date().toISOString();

  for (const row of obsolete) {
    const metadata = metadataObject((row as any).metadata);

    const { error: updateError } = await supabase
      .from('field_todos')
      .update({
        completed: true,
        completed_at: now,
        metadata: {
          ...metadata,
          autoResolved: true,
          autoResolvedAt: now,
          resolution: 'ndvi_analysis_no_longer_creates_tasks_or_notifications',
        },
        updated_at: now,
      })
      .eq('id', (row as any).id)
      .eq('user_id', user.id);

    if (updateError) {
      console.warn('[tasks] Eski NDVI görevi kapatılamadı:', updateError.message);
    }
  }
}

function scheduleTaskMaintenance(fieldId: string) {
  const now = Date.now();
  const lastStarted = taskMaintenanceStartedAt.get(fieldId) ?? 0;

  if (taskMaintenanceInFlight.has(fieldId)) return;
  if (now - lastStarted < TASK_MAINTENANCE_TTL_MS) return;

  taskMaintenanceStartedAt.set(fieldId, now);

  const pending = (async () => {
    try {
      await synchronizeGeneratedTasks(fieldId);
      await closeLegacyNdviRelativeAutoTasks(fieldId);
      emitTasksChanged(fieldId);
    } catch (error) {
      console.warn('[tasks] Arka plan görev bakımı tamamlanamadı:', error);
    } finally {
      taskMaintenanceInFlight.delete(fieldId);
    }
  })();

  taskMaintenanceInFlight.set(fieldId, pending);
}

export async function getFieldTasks(
  fieldId: string,
): Promise<FieldTask[]> {
  const id = text(fieldId);

  if (!id) return [];

  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  // Listeyi açarken altı ayrı RPC'yi bekletme. Mevcut görevleri hemen oku;
  // üretim/temizlik senkronu arka planda bir kez çalışsın. NDVI görevleri aşağıdaki
  // filtreyle zaten ekrana çıkmaz.
  scheduleTaskMaintenance(id);

  const [taskResult, fieldResult] = await Promise.all([
    supabase
      .from('field_todos')
      .select(
        'id,field_id,title,description,source,action_target,priority,reward_rule_key,metadata,due_date,task_key,completed,created_at',
      )
      .eq('field_id', id)
      .eq('completed', false)
      .eq('dismissed', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true }),
    supabase
      .from('fields')
      .select('name')
      .eq('id', id)
      .maybeSingle(),
  ]);

  const { data, error } = taskResult;
  if (error) throw error;

  const now = Date.now();

  const tasks = (data ?? [])
    .filter((row) => !isLegacyNdviRelativeAutoTask(row))
    .map((row) => normalizeTask(row as RawFieldTask))
    .filter((task) => {
      const snoozedUntil = text(task.metadata.snoozedUntil);

      if (snoozedUntil) {
        const until = new Date(snoozedUntil).getTime();
        if (Number.isFinite(until) && until > now) return false;
      }

      return true;
    });

  const fieldName = trTitle(fieldResult.data?.name);
  const namedTasks = tasks.map((task) => ({
    ...task,
    fieldName: fieldName || null,
    title: taskTitleWithFieldName(task.title, fieldName),
  }));

  publishTaskNotifications(namedTasks, fieldName);
  return namedTasks;
}

/**
 * "Şimdi değil"
 *
 * Görev tamamlanmış veya uygunsuz sayılmaz.
 * Sadece belirli bir süre kullanıcının aktif listesinden gizlenir.
 */
export async function snoozeFieldTask(
  task: FieldTask,
  hours = 24,
) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  const taskId = text(task.id);

  if (!taskId) {
    throw new Error('Görev kimliği bulunamadı.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error('Görevi ertelemek için oturum gerekli.');
  }

  const safeHours = Math.max(1, hours);

  const snoozedUntil = new Date(
    Date.now() + safeHours * 60 * 60 * 1000,
  ).toISOString();

  const metadata = {
    ...task.metadata,
    snoozedUntil,
    userFeedback: 'snoozed',
    userFeedbackAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('field_todos')
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', user.id)
    .select('id,field_id')
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('Görev bulunamadı veya güncellenemedi.');
  }

  removeTaskNotification(taskId);
  emitTasksChanged(text(data.field_id) || task.fieldId);

  return {
    snoozed: true,
    snoozedUntil,
    message: 'Görevi 24 saatliğine gizledim.',
  };
}

/**
 * "Bana uygun değil"
 *
 * Kullanıcının bu görevi yapamayacağını/uygun bulmadığını
 * kalıcı geri bildirim olarak kaydeder.
 *
 * Görev tamamlanmış sayılmaz ve Pusula puanı verilmez.
 */
export async function markFieldTaskUnsuitable(task: FieldTask) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  const taskId = text(task.id);

  if (!taskId) {
    throw new Error('Görev kimliği bulunamadı.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error('Görev geri bildirimi için oturum gerekli.');
  }

  const metadata = {
    ...task.metadata,
    userFeedback: 'not_applicable',
    userFeedbackAt: new Date().toISOString(),
    suppressSimilarTask: true,
  };

  const { data, error } = await supabase
    .from('field_todos')
    .update({
      dismissed: true,
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', user.id)
    .select('id,field_id')
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('Görev bulunamadı veya güncellenemedi.');
  }

  removeTaskNotification(taskId);
  emitTasksChanged(text(data.field_id) || task.fieldId);

  return {
    dismissed: true,
    message:
      'Bu görevi kaldırdım ve uygun değil geri bildirimini kaydettim.',
  };
}

export async function dismissFieldTask(task: FieldTask) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  const taskId = text(task.id);

  if (!taskId) {
    throw new Error('Görev kimliği bulunamadı.');
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) throw userError;

  if (!user) {
    throw new Error('Görevi ertelemek için oturum gerekli.');
  }

  const { data, error } = await supabase
    .from('field_todos')
    .update({
      dismissed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .eq('user_id', user.id)
    .select('id,field_id')
    .maybeSingle();

  if (error) throw error;

  if (!data) {
    throw new Error('Görev bulunamadı veya güncellenemedi.');
  }

  removeTaskNotification(taskId);
  emitTasksChanged(text(data.field_id) || task.fieldId);

  return {
    dismissed: true,
    message:
      'Şimdilik gizledim. İlgili veriyi daha sonra yine ekleyebilirsin.',
  };
}

export async function completeFieldTask(task: FieldTask) {
  if (!supabase) {
    throw new Error('Supabase bağlantısı hazır değil.');
  }

  if (task.taskKey) {
    const actionTask =
      task.taskKey === 'notification:soil-analysis' ||
      task.taskKey.startsWith('pusula-field-check:');

    const { data, error } = await supabase.rpc(
      actionTask
        ? 'tp_complete_action_task'
        : 'tp_complete_field_task',
      {
        p_task_id: task.id,
      },
    );

    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;

    const completed = Boolean(
      (result as any)?.completed,
    );

    if (!completed) {
      return {
        completed: false,
        message:
          (result as any)?.reason === 'completion_not_verified'
            ? 'Bu görev, ilgili bilgiyi gerçekten tamamladığında otomatik kapanacak.'
            : 'Görev henüz tamamlanmış görünmüyor.',
      };
    }

    removeTaskNotification(task.id);
    emitTasksChanged(task.fieldId);

    const awardedPoints = Number(
      (result as any)?.awarded_points ?? 0,
    );

    return {
      completed: true,
      awardedPoints,
      message:
        awardedPoints > 0
          ? `+${awardedPoints} Pusula kazandın.`
          : 'Görev tamamlandı.',
    };
  }

  const { error } = await supabase
    .from('field_todos')
    .update({
      completed: true,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', task.id);

  if (error) throw error;

  removeTaskNotification(task.id);
  emitTasksChanged(task.fieldId);

  return {
    completed: true,
    awardedPoints: 0,
    message: 'Görev tamamlandı.',
  };
}