import type { AlertResponse } from '@fin/contracts';

import { Badge, Button, CardTitle } from '@/shared/ui';

const tones = {
  CRITICAL: 'critical',
  WARNING: 'warning',
  INFO: 'info',
} as const;

const borders = {
  CRITICAL: 'border-l-red-600',
  WARNING: 'border-l-amber-500',
  INFO: 'border-l-blue-500',
} as const;

interface Props {
  alerts: AlertResponse[];
  /**
   * UC-8 — an alert is the thing most worth asking about, so it carries the
   * question to the assistant when there is one to ask.
   */
  onAsk?: ((alert: AlertResponse) => void) | undefined;
}

/** UC-4.7 — what needs attention, ranked by severity. */
export function AlertList({ alerts, onAsk }: Props) {
  if (alerts.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-2">
      <CardTitle>Needs attention</CardTitle>
      {alerts.map((alert) => (
        <div
          key={alert.title}
          // A negative balance date is exactly the warning that must reach a
          // screen reader without being hunted for.
          role={alert.severity === 'CRITICAL' ? 'alert' : undefined}
          className={`flex flex-col gap-1 rounded-lg border border-zinc-200 border-l-4 bg-white p-3 ${borders[alert.severity]}`}
        >
          <div className="flex items-center gap-2">
            <Badge tone={tones[alert.severity]}>{alert.severity}</Badge>
            <span className="text-sm font-medium">{alert.title}</span>
          </div>
          <p className="text-sm text-zinc-600">{alert.body}</p>
          {onAsk !== undefined && (
            <div>
              <Button
                aria-label="Ask about this alert"
                onClick={() => {
                  onAsk(alert);
                }}
              >
                Ask about this
              </Button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}
