import type { AnchorSettingsResponse } from '@fin/contracts';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { useAccounts } from '@/entities/account';
import { useBuckets } from '@/entities/bucket';
import { useCycleWindow } from '@/entities/cycle';
import { useCards } from '@/entities/card';
import { useTemplates } from '@/entities/template';
import { BackupRestore } from '@/features/backup-restore';
import { ChangeAnchor } from '@/features/configure-anchor';
import { ManageAccounts } from '@/features/manage-accounts';
import { api, queryKeys, useSetupState } from '@/shared/api';
import { unskipSetup } from '@/shared/model';
import { Amount, Badge, Card, CardTitle, Skeleton } from '@/shared/ui';
import { AppShell } from '@/widgets/app-shell';

/** UC-1 — the configuration, visited rarely and deliberately. */
export function SettingsPage() {
  return (
    <AppShell
      title="Settings"
      subtitle="The payday anchor, the accounts, and how the app renders things"
    >
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <PaydayAnchor />
        <Accounts />
        <FirstRun />
        <Formatting />
        <Backup />
      </div>
    </AppShell>
  );
}

function PaydayAnchor() {
  const { data, isPending } = useQuery({
    queryKey: queryKeys.anchor(),
    queryFn: () => api<AnchorSettingsResponse>('/settings/anchor'),
  });

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Payday anchor</CardTitle>
      {isPending || data === undefined ? (
        <Skeleton className="h-10 w-40" />
      ) : (
        <>
          <p className="text-sm">
            Salary lands on day{' '}
            <strong className="font-mono">{data.anchorDay}</strong>, moving to
            the {data.shiftPolicy === 'PRECEDING' ? 'preceding' : 'following'}{' '}
            business day when that falls on a weekend or a holiday.
          </p>
          {/* Changing it re-slices every open cycle, so it is never silent. */}
          <p className="text-xs text-zinc-500">
            Changing the anchor re-slices every open cycle. Closed cycles are
            never touched, and the change is previewed before it applies.
          </p>
          <div>
            <ChangeAnchor
              anchorDay={data.anchorDay}
              shiftPolicy={data.shiftPolicy}
            />
          </div>
        </>
      )}
    </Card>
  );
}

function Accounts() {
  const { data, isPending } = useAccounts();

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Accounts</CardTitle>
      {isPending || data === undefined ? (
        <Skeleton className="h-16 w-full" />
      ) : data.accounts.length === 0 ? (
        <>
          <p className="text-sm text-zinc-500">
            No accounts yet. Their total is the app&rsquo;s starting cash.
          </p>
          <ManageAccounts accounts={[]} />
        </>
      ) : (
        <ul className="divide-y divide-zinc-100 text-sm">
          {data.accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 py-1.5">
              <span className="flex-1">{account.name}</span>
              <Badge>{account.type.toLowerCase()}</Badge>
              <Amount cents={account.balance} className="w-28 text-right" />
            </li>
          ))}
          <li className="flex items-center gap-3 pt-2 text-sm font-semibold">
            <span className="flex-1">In accounts now</span>
            <Amount cents={data.total} className="w-28 text-right" />
          </li>
        </ul>
      )}
      {data !== undefined && data.accounts.length > 0 && (
        <ManageAccounts accounts={data.accounts} />
      )}
    </Card>
  );
}

/**
 * UC-1.5 — the app ships empty and has no import path, so first run is an
 * ordered checklist: each step depends on the ones before it.
 */
function FirstRun() {
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
      to: '/cards',
    },
    {
      label: 'Recurring templates',
      state: `${String(counts.templates)} templates`,
      done: counts.templates > 0,
      to: '/templates',
    },
    {
      label: 'Buckets',
      state: `${String(counts.buckets)} buckets`,
      done: counts.buckets > 0,
      to: '/buckets',
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
            {/* Each step leads to where it is done, not just to its count. */}
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

/** UC-1.6 — the only recovery mechanism there is. */
function Backup() {
  const accounts = useAccounts();
  const cards = useCards();
  const templates = useTemplates();
  const buckets = useBuckets();
  const cycles = useCycleWindow();

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Backup</CardTitle>
      <BackupRestore
        counts={{
          accounts: accounts.data?.accounts.length ?? 0,
          cycles: cycles.data?.cycles.length ?? 0,
          templates: templates.data?.templates.length ?? 0,
          cards: cards.data?.length ?? 0,
          buckets: buckets.data?.length ?? 0,
        }}
      />
    </Card>
  );
}

/** UC-1.4 — read-only, so the conventions are explicit rather than implied. */
function Formatting() {
  const rows = [
    ['Currency', 'R$ 1.234,56'],
    ['Dates', 'dd/MM/yyyy'],
    ['Outgoing money', 'negative, shown in red'],
    ['Cycle naming', 'August 2026 (5 Aug – 3 Sep)'],
  ];

  return (
    <Card className="flex flex-col gap-3">
      <CardTitle>Formatting</CardTitle>
      <dl className="flex flex-col gap-1.5 text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between">
            <dt className="text-zinc-500">{label}</dt>
            <dd className="font-mono text-xs">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
