import type { HarmonizedHomeDecisionEvent } from '../types/modelGateway';
import type {
  HomeDecisionEvent,
  HomeSystemNotification,
  HomeTodayDecision,
  HomeTodayIconKey,
} from '../types/homeDecision';

type DecisionEvent = HomeDecisionEvent | HarmonizedHomeDecisionEvent;

type IconResolver = (iconKey: HomeTodayIconKey) => string;

const defaultIconResolver: IconResolver = (iconKey) => iconKey;

export function selectTodayEvents(events: DecisionEvent[]): DecisionEvent[] {
  const seenGroups = new Set<string>();

  return events
    .filter((event) => event.channels.includes('today') && event.today)
    .filter((event) => {
      if (seenGroups.has(event.group)) return false;
      seenGroups.add(event.group);
      return true;
    })
    .slice(0, 5);
}

export function makeAllClearEvent(fieldKey: string): HomeDecisionEvent {
  return {
    id: `status:${fieldKey || 'home'}:all-clear`,
    group: 'status',
    source: 'field',
    priority: 1,
    severity: 'info',
    target: 'home',
    channels: ['today'],
    label: 'BUGÜN',
    title: 'Acil İşlem Görünmüyor',
    detail: 'Yeni veri geldikçe burası otomatik güncellenecek',
    today: {
      tone: 'green',
      visual: 'irrigation',
      iconKey: 'leaf-green',
      iconClass: 'leaf',
    },
  };
}

export function toTodayDecision(
  event: DecisionEvent,
  fieldId?: string | null,
  resolveIcon: IconResolver = defaultIconResolver,
): HomeTodayDecision | null {
  if (!event.today) return null;

  return {
    id: event.id,
    group: event.group,
    priority: event.priority,
    label: event.label,
    title: event.title,
    detail: event.detail,
    tone: event.today.tone,
    visual: event.today.visual,
    iconSrc: resolveIcon(event.today.iconKey),
    iconClass: event.today.iconClass,
    target: event.target,
    fieldId: fieldId ?? null,
    source: event.source,
    evidence: event.evidence,
    confidence: 'gateway' in event ? event.gateway.confidence : event.confidence,
    kind: event.kind,
    missingInfoKind: event.missingInfoKind,
    task: event.task,
  };
}

export function toNotification(event: DecisionEvent): HomeSystemNotification | null {
  if (!event.notification || !event.channels.includes('notification')) return null;

  return {
    id: event.id,
    priority: event.priority,
    severity: event.severity,
    source: event.source,
    title: event.title,
    detail: event.detail,
    iconKey: event.notification.iconKey,
    iconTone: event.notification.iconTone,
    dotTone: event.notification.dotTone,
    target: event.target,
    task: event.task,
  };
}

export type DecisionChannelProjection = {
  todayDecisions: HomeTodayDecision[];
  fieldStatusDecisions: HomeTodayDecision[];
  notifications: HomeSystemNotification[];
  primaryDecision: DecisionEvent | null;
  pusulaDecision: DecisionEvent | null;
};

/**
 * Tek kanonik karar listesi -> bütün kullanıcı yüzeyleri.
 * Burada tarımsal hesap yapılmaz; aynı event yalnızca Today / Tarla Durumu /
 * Bildirim / Pusula görünüm sözleşmelerine çevrilir.
 */
export function projectDecisionChannels({
  events,
  fieldKey,
  fieldId,
  resolveIcon,
}: {
  events: DecisionEvent[];
  fieldKey: string;
  fieldId?: string | null;
  resolveIcon?: IconResolver;
}): DecisionChannelProjection {
  const selectedToday = selectTodayEvents(events);
  const todaySource: DecisionEvent[] = selectedToday.length
    ? selectedToday
    : [makeAllClearEvent(fieldKey)];

  const resolvedFieldId = String(fieldId ?? fieldKey ?? '').trim() || null;

  const iconResolver = resolveIcon ?? defaultIconResolver;

  const todayDecisions = todaySource
    .map((event) => toTodayDecision(event, resolvedFieldId, iconResolver))
    .filter((item): item is HomeTodayDecision => Boolean(item));

  const fieldStatusDecisions = events
    .filter((event) => Boolean(event.today))
    .map((event) => toTodayDecision(event, resolvedFieldId, iconResolver))
    .filter((item): item is HomeTodayDecision => Boolean(item));

  const notifications = events
    .map(toNotification)
    .filter((item): item is HomeSystemNotification => Boolean(item))
    .slice(0, 12);

  const primaryDecision =
    events.find((event) => event.channels.includes('today')) ?? events[0] ?? null;

  const pusulaDecision =
    events.find((event) => event.channels.includes('pusula')) ?? null;

  return {
    todayDecisions,
    fieldStatusDecisions,
    notifications,
    primaryDecision,
    pusulaDecision,
  };
}
