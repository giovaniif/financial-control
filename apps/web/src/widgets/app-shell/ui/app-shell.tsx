import type { ReactNode } from 'react';
import { useState } from 'react';

import { useMediaQuery } from '@/shared/lib';
import { useAssistantRail, WIDE_ENOUGH_FOR_SHELL } from '@/shared/model';

import { AccountsTotal } from './accounts-total.js';
import { AssistantRail } from './assistant-rail.js';
import { ChatTab } from './chat-tab.js';
import { CycleNav } from './cycle-nav.js';
import { NavDrawer } from './nav-drawer.js';
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
 *
 * Open or folded, the chat holds the same edge: a surface that crossed the
 * screen when it collapsed would read as two different features.
 *
 * Below 64rem none of that fits, so the shell is a different layout rather
 * than a squeezed one: the nav is a drawer, the chat is a sheet, and the
 * header's controls wrap onto a row of their own.
 */
export function AppShell({ title, subtitle, children }: Props) {
  const { isOpen } = useAssistantRail();
  const isWide = useMediaQuery(WIDE_ENOUGH_FOR_SHELL);
  const [isNavOpen, setIsNavOpen] = useState(false);
  // Two ways to run out of room: the rail takes a third of a desktop, and a
  // phone never had it. Both fold the same way — the controls become icons
  // and the subtitle goes, being the one line that repeats what the screen
  // already makes obvious.
  const isTight = !isWide || isOpen;

  const dismissNav = () => {
    setIsNavOpen(false);
  };

  return (
    <div className="flex min-h-screen bg-zinc-50 text-zinc-900 lg:h-screen lg:min-h-0 lg:overflow-hidden">
      {isWide && <Sidebar isCollapsed={isOpen} />}
      {!isWide && <NavDrawer isOpen={isNavOpen} onDismiss={dismissNav} />}
      <AssistantRail />
      {!isOpen && <ChatTab />}
      <main className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <header className="sticky top-0 z-20 flex flex-col gap-2 border-b border-zinc-200 bg-white/85 px-4 py-2.5 backdrop-blur lg:flex-row lg:flex-wrap lg:items-end lg:justify-between lg:gap-6 lg:px-8 lg:py-4">
          <div className="flex min-w-0 items-center gap-3">
            {!isWide && (
              <button
                type="button"
                onClick={() => {
                  setIsNavOpen(true);
                }}
                aria-label="Abrir o menu"
                aria-expanded={isNavOpen}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-600 transition-colors hover:bg-zinc-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  className="size-5"
                >
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              </button>
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <h1 className="truncate text-base font-semibold lg:text-lg">
                {title}
              </h1>
              {!isTight && (
                <p className="truncate text-xs text-zinc-500">{subtitle}</p>
              )}
            </div>
          </div>
          <div className="flex w-full items-center gap-2 lg:w-auto lg:shrink-0">
            {isWide && isOpen && <AccountsTotal layout="compact" />}
            <CycleNav />
          </div>
        </header>
        {/* The bottom padding clears the floating chat button, which sits over
            the end of the content on every screen. */}
        {/* Below `lg` the page scrolls, because a phone cannot hold the
            figures and a usable worklist at once. From `lg` up the window is
            the frame and the screen fits inside it — only the list that grows
            with the data scrolls. */}
        <div className="flex flex-col px-4 py-5 pb-24 sm:px-6 lg:min-h-0 lg:flex-1 lg:px-8 lg:py-6 lg:pb-6">
          {children}
        </div>
      </main>
    </div>
  );
}
