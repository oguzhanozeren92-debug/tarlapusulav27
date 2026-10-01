type MonitoringContext = Record<string, unknown>;

type MonitoringSdk = {
  init?: (options: Record<string, unknown>) => void;
  captureException?: (
    error: unknown,
    options?: { extra?: MonitoringContext },
  ) => void;
};

declare global {
  interface Window {
    Sentry?: MonitoringSdk;
  }
}

let initialized = false;

function scrub(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(
        /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
        '[email]',
      )
      .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+\b/g, '[token]');
  }

  if (Array.isArray(value)) {
    return value.map(scrub);
  }

  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value)) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.includes('password') ||
        normalizedKey.includes('token') ||
        normalizedKey.includes('authorization') ||
        normalizedKey.includes('cookie') ||
        normalizedKey.includes('prompt') ||
        normalizedKey.includes('message') ||
        normalizedKey.includes('body')
      ) {
        output[key] = '[filtered]';
        continue;
      }

      output[key] = scrub(item);
    }

    return output;
  }

  return value;
}

function browserSentry(): MonitoringSdk | null {
  if (typeof window === 'undefined') return null;
  return window.Sentry ?? null;
}

/**
 * Monitoring must never prevent TarlaPusula from starting.
 *
 * The Sentry package is intentionally NOT imported here. StackBlitz/Vite can
 * otherwise fail the whole application during dependency resolution when the
 * optional SDK is not installed yet. If a Sentry browser SDK is loaded later,
 * this adapter will use window.Sentry automatically; otherwise monitoring is a
 * safe no-op and the application continues normally.
 */
export async function initMonitoring(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const enabled =
    String(import.meta.env.VITE_SENTRY_ENABLED ?? '').toLowerCase() ===
    'true';
  const dsn = String(import.meta.env.VITE_SENTRY_DSN ?? '').trim();

  if (!enabled || !dsn) return;

  const Sentry = browserSentry();
  if (!Sentry?.init) {
    console.info(
      '[TarlaPusula] Harici hata izleme SDK’sı yüklenmedi; uygulama normal şekilde devam ediyor.',
    );
    return;
  }

  try {
    Sentry.init({
      dsn,
      release:
        String(import.meta.env.VITE_APP_RELEASE ?? '').trim() || undefined,
      sendDefaultPii: false,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      beforeSend(event: any) {
        if (event?.request) {
          delete event.request.cookies;
          delete event.request.headers;
          delete event.request.data;
          delete event.request.query_string;
        }

        if (event?.user) {
          delete event.user.email;
          delete event.user.ip_address;
          delete event.user.username;
        }

        if (event?.contexts) event.contexts = scrub(event.contexts);
        if (event?.extra) event.extra = scrub(event.extra);
        if (event?.tags) event.tags = scrub(event.tags);

        return event;
      },
    });
  } catch (error) {
    console.warn(
      '[TarlaPusula] Hata izleme başlatılamadı; uygulama izleme olmadan devam ediyor.',
      error,
    );
  }
}

export async function captureMonitoringError(
  error: unknown,
  context?: MonitoringContext,
): Promise<void> {
  const Sentry = browserSentry();

  if (Sentry?.captureException) {
    try {
      Sentry.captureException(error, {
        extra: context ? (scrub(context) as MonitoringContext) : undefined,
      });
      return;
    } catch {
      // Monitoring itself must never break the app.
    }
  }

  console.error('[TarlaPusula]', error, context ? scrub(context) : undefined);
}
