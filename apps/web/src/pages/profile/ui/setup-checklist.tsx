import { Link } from 'react-router';

import { useSetupState } from '@/shared/api';
import { unskipSetup } from '@/shared/model';
import { Card, CardTitle } from '@/shared/ui';

/**
 * UC-1.5 — the app ships empty, so first run is an ordered checklist: each
 * step depends on the ones before it. Everything but the buckets is
 * configured on this same screen, which is why only that step links away.
 */
export function SetupChecklist() {
  const { data } = useSetupState();
  const counts = {
    accounts: data?.accounts ?? 0,
    cards: data?.cards ?? 0,
    templates: data?.templates ?? 0,
    buckets: data?.buckets ?? 0,
  };

  const steps = [
    {
      label: 'Payday anchor',
      state: data?.anchorConfigured === true ? 'configured' : 'not set yet',
      done: data?.anchorConfigured === true,
      to: null,
    },
    {
      label: 'Accounts',
      state: `${String(counts.accounts)} accounts`,
      done: counts.accounts > 0,
      to: null,
    },
    {
      label: 'Credit cards',
      state: `${String(counts.cards)} cards`,
      done: counts.cards > 0,
      to: null,
    },
    {
      label: 'Recurring templates',
      state: `${String(counts.templates)} templates`,
      done: counts.templates > 0,
      to: null,
    },
    {
      label: 'Buckets',
      state: `${String(counts.buckets)} buckets`,
      done: counts.buckets > 0,
      to: '/savings',
    },
  ];

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>First run</CardTitle>
      <ol className="flex flex-col gap-2 text-sm">
        {steps.map((step, index) => (
          <li key={step.label} className="flex items-center gap-3">
            <span
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${
                step.done
                  ? 'bg-green-100 text-green-700'
                  : 'bg-zinc-100 text-zinc-500'
              }`}
            >
              {index + 1}
            </span>
            {step.to === null ? (
              <span className="flex-1">{step.label}</span>
            ) : (
              <Link
                to={step.to}
                className="flex-1 underline-offset-2 hover:underline"
              >
                {step.label}
              </Link>
            )}
            <span className="text-xs text-zinc-500">{step.state}</span>
          </li>
        ))}
      </ol>
      <div>
        <Link
          to="/onboarding"
          onClick={unskipSetup}
          className="text-sm underline-offset-2 hover:underline"
        >
          Run setup again
        </Link>
      </div>
    </Card>
  );
}
