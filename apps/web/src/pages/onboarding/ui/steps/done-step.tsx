import { Link } from 'react-router';

import { useSetupState } from '@/shared/api';
import { Skeleton } from '@/shared/ui';

/** UC-1.5 — what was actually set up, and where to go with it. */
export function DoneStep() {
  const { data, isPending } = useSetupState();

  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  const rows = [
    {
      label: 'Payday anchor',
      value: (data?.anchorConfigured ?? false) ? 'configured' : 'not set',
    },
    { label: 'Accounts', value: String(data?.accounts ?? 0) },
    { label: 'Credit cards', value: String(data?.cards ?? 0) },
    { label: 'Recurring templates', value: String(data?.templates ?? 0) },
    { label: 'Buckets', value: String(data?.buckets ?? 0) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        That is everything the app needs to start answering. From here it fills
        the next twelve cycles from your templates, assigns each card invoice to
        the cycle containing its due date, and allocates the surplus by your
        rules.
      </p>

      <dl className="divide-y divide-zinc-100 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between py-1.5">
            <dt className="text-zinc-600">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-zinc-500">
        Nothing here is final — every one of these is editable from Settings,
        and the next cycle you open will show what they add up to.
      </p>

      <div>
        <Link
          to="/"
          className="inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
        >
          Open the Dashboard
        </Link>
      </div>
    </div>
  );
}
