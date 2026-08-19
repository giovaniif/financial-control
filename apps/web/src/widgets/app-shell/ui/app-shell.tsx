import type { ReactNode } from 'react';

import { EstimatesToggle } from '@/features/toggle-estimates';
import { useAssistantRail } from '@/shared/model';

import { AccountsTotal } from './accounts-total.js';
import { AssistantRail } from './assistant-rail.js';
import { ChatTab } from './chat-tab.js';
import { CycleNav } from './cycle-nav.js';
import { Sidebar } from './sidebar.js';

interface Props {
  title: string;
  subtitle: string;
  children: ReactNode;
}

/**
 * The persistent shell: nav, the assistant rail, screen title, cycle nav and
 * the estimates toggle.
 *
 * Opening the chat folds the nav to icons rather than taking a second rail's
 * worth of width from the figures — and the accounts total moves into the
 * header rather than folding away with it (UC-1.2).
 */
export function AppShell({ title, subtitle, children }: Props) {
  const { isOpen } = useAssistantRail();

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900">
      <Sidebar isCollapsed={isOpen} />
      <AssistantRail />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-end justify-between gap-6 border-b border-zinc-200 bg-white/85 px-8 py-4 backdrop-blur">
          <div className="flex flex-col gap-0.5">
            <h1 className="text-lg font-semibold">{title}</h1>
            <p className="text-xs text-zinc-500">{subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            {isOpen && <AccountsTotal layout="inline" />}
            <CycleNav />
            <EstimatesToggle />
          </div>
        </header>
        <div className="px-8 py-6 pb-14">{children}</div>
      </main>
      {!isOpen && <ChatTab />}
    </div>
  );
}
