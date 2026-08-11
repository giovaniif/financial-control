import type { ReactNode } from 'react';

import { EstimatesToggle } from '@/features/toggle-estimates';

import { CycleNav } from './cycle-nav.js';
import { Sidebar } from './sidebar.js';

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/** The persistent shell: sidebar, screen title, cycle nav, estimates toggle. */
export function AppShell({ title, subtitle, children }: Props) {
  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-end justify-between gap-6 border-b border-zinc-200 bg-white/85 px-8 py-4 backdrop-blur">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <CycleNav />
            <EstimatesToggle />
          </div>
        </header>
        <div className="px-8 py-6 pb-14">{children}</div>
      </main>
    </div>
  );
}
