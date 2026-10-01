import type { FieldTask } from '../../tasks/services/fieldTasks.service';
import type {
  TaskMapPrescriptionState,
  TaskMapSnapshot,
  TaskMapZone,
  TaskMapZoneKind,
} from '../types/taskMap';

function text(value: unknown, max = 500) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function listText(value: unknown, limit = 8) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => text(item, 220)).filter(Boolean)),
  ).slice(0, limit);
}

function finite(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function sourceLayer(task: FieldTask) {
  const metadata = objectValue(task.metadata);
  const declared = text(metadata.sourceLayer, 80);
  if (declared) return declared;
  const target = text(task.actionTarget, 80).toLocaleLowerCase('tr-TR');
  if (target.includes('radar')) return 'radar-water';
  if (target.includes('soil')) return 'soil';
  return 'vegetation';
}

function isSuppressedNdviTask(task: FieldTask) {
  const metadata = objectValue(task.metadata);
  const important = objectValue(metadata.importantArea);
  const taskKey = text(task.taskKey, 240).toLocaleLowerCase('tr-TR');
  const metadataSource = text(metadata.source, 120).toLocaleLowerCase('tr-TR');
  const haystack = [
    task.title,
    task.description,
    task.source,
    task.actionTarget,
    taskKey,
    metadataSource,
    metadata.taskBasis,
    metadata.notificationId,
    important.summary,
    JSON.stringify(important.evidence ?? []),
  ]
    .map((value) => text(value, 2000).toLocaleLowerCase('tr-TR'))
    .join(' ');

  if (taskKey.startsWith('ndvi-follow-up-photo:')) return true;
  if (taskKey === 'pusula-field-check:ndvi-relative') return true;
  if (taskKey.startsWith('pusula-field-check:ndvi-relative:')) return true;
  if (taskKey.startsWith('pusula-field-check:area:')) return true;
  if (metadataSource === 'ndvi_follow_up') return true;
  if (metadataSource === 'ndvi_relative_difference') return true;

  return (
    sourceLayer(task) === 'vegetation' &&
    (
      haystack.includes('ndvi') ||
      haystack.includes('parsel ortalamas') ||
      haystack.includes('göreli bitki gelişim fark')
    )
  );
}

function spatialPayload(task: FieldTask) {
  const metadata = objectValue(task.metadata);
  const important = objectValue(metadata.importantArea);
  const direction =
    text(important.area, 80) ||
    text(metadata.direction, 80) ||
    text(metadata.area, 80) ||
    null;
  const geometry =
    important.geometry ??
    metadata.areaGeometry ??
    metadata.geometry ??
    null;
  const bounds = important.bounds ?? metadata.bounds ?? null;
  return { direction, geometry, bounds };
}

function zoneKind(task: FieldTask): TaskMapZoneKind {
  const target = text(task.actionTarget, 100).toLocaleLowerCase('tr-TR');
  const source = text(task.source, 100).toLocaleLowerCase('tr-TR');
  const haystack = `${task.title} ${task.description ?? ''}`.toLocaleLowerCase('tr-TR');

  if (target === 'field-photo' || haystack.includes('fotoğraf')) return 'photo-check';
  if (target.includes('irrigation') || source.includes('irrigation')) return 'irrigation-check';
  if (
    haystack.includes('örnek') ||
    haystack.includes('numune') ||
    haystack.includes('toprak analizi')
  ) {
    return 'sampling';
  }
  return 'field-check';
}

const VERIFIED_AUTHORITIES = new Set([
  'verified-local-prescription',
  'official-label-prescription',
  'agronomist-verified',
  'laboratory-calibrated-prescription',
]);

function prescription(task: FieldTask): {
  state: TaskMapPrescriptionState;
  label: string | null;
  rate: number | null;
  unit: string | null;
  authority: string | null;
  evidence: string[];
} {
  const metadata = objectValue(task.metadata);
  const value = objectValue(metadata.prescription);
  const requested =
    Object.keys(value).length > 0 || metadata.prescriptionRequested === true;

  if (!requested) {
    return {
      state: 'none',
      label: null,
      rate: null,
      unit: null,
      authority: null,
      evidence: [],
    };
  }

  const authority = text(
    value.authority ?? metadata.prescriptionAuthority,
    120,
  ) || null;
  const verified =
    value.verified === true &&
    Boolean(authority && VERIFIED_AUTHORITIES.has(authority));
  const rate = finite(value.rate ?? value.dose ?? value.amount);
  const unit = text(value.unit, 50) || null;
  const label = text(value.label ?? value.action, 180) || null;
  const evidence = listText(value.evidence ?? metadata.prescriptionEvidence, 8);

  if (!verified) {
    return {
      state: 'blocked',
      label: label || 'Doğrulanmamış uygulama isteği',
      rate: null,
      unit: null,
      authority,
      evidence,
    };
  }

  return {
    state: 'verified',
    label: label || 'Doğrulanmış uygulama',
    rate,
    unit,
    authority,
    evidence,
  };
}

function buildZone(task: FieldTask): TaskMapZone | null {
  const spatial = spatialPayload(task);
  if (!spatial.direction && !spatial.geometry && !spatial.bounds) return null;

  const rx = prescription(task);
  const kind = rx.state === 'verified' ? 'verified-application' : zoneKind(task);
  const metadata = objectValue(task.metadata);
  const evidence = Array.from(
    new Set([
      ...listText(metadata.evidence, 6),
      ...rx.evidence,
      text(metadata.verificationReason, 180),
      text(metadata.source, 120),
    ].filter(Boolean)),
  ).slice(0, 10);

  return {
    taskId: task.id,
    taskKey: task.taskKey,
    title: task.title,
    description: task.description,
    source: task.source,
    actionTarget: task.actionTarget,
    priority: task.priority,
    direction: spatial.direction,
    geometry: spatial.geometry,
    bounds: spatial.bounds,
    sourceLayer: sourceLayer(task),
    kind,
    prescriptionState: rx.state,
    prescriptionLabel: rx.label,
    prescriptionRate: rx.rate,
    prescriptionUnit: rx.unit,
    prescriptionAuthority: rx.authority,
    evidence,
  };
}

export function buildTaskMapSnapshot(
  fieldIdInput: string,
  tasks: FieldTask[],
): TaskMapSnapshot {
  const fieldId = text(fieldIdInput, 120);
  const fieldTasks = fieldId
    ? tasks.filter(
        (task) =>
          text(task.fieldId, 120) === fieldId &&
          !isSuppressedNdviTask(task),
      )
    : [];
  const zones = fieldTasks
    .map(buildZone)
    .filter((value): value is TaskMapZone => Boolean(value))
    .sort((a, b) => b.priority - a.priority || a.title.localeCompare(b.title, 'tr'));

  return {
    version: '25.0',
    fieldId,
    status: zones.length ? 'ready' : 'empty',
    openTaskCount: fieldTasks.length,
    spatialTaskCount: zones.length,
    verifiedPrescriptionCount: zones.filter(
      (zone) => zone.prescriptionState === 'verified',
    ).length,
    blockedPrescriptionCount: zones.filter(
      (zone) => zone.prescriptionState === 'blocked',
    ).length,
    zones,
    guardrails: {
      taskAreaIsNotAutomaticPrescription: true,
      coarseDirectionIsNotMachineGuidanceGeometry: true,
      numericRateRequiresVerifiedAuthority: true,
      chemicalSelectionIsNeverGeneratedFromRemoteSignalAlone: true,
    },
    generatedAt: new Date().toISOString(),
  };
}
