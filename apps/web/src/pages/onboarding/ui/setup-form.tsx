import type { ReactNode } from 'react';

import { useSelectedCycle } from '@/features/navigate-cycle';

import { AccountsSection } from './sections/accounts-section.js';
import { AnchorSection } from './sections/anchor-section.js';
import { BucketsSection } from './sections/buckets-section.js';
import { CardsSection } from './sections/cards-section.js';
import { TemplatesSection } from './sections/templates-section.js';
import { SetupSummary } from './setup-summary.js';

/**
 * UC-1.5 — the same sections as the conversation, asked in fields. Without a
 * key the app is not unusable: this is the whole of setup, and it says why it
 * is asking this way rather than leaving the user to wonder.
 *
 * Each section writes as it is filled in, which is the one real difference
 * from the conversation — there is no draft to hold back until the end.
 */
export function SetupForm() {
  const { selectedMonth } = useSelectedCycle();

  return (
    <div className="flex flex-col gap-8">
      <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-700">
        Setting up by conversation needs a Claude API key, and this app has none
        configured. Nothing is missing because of that — the same sections are
        below as a plain form, and every one of them can be changed later from
        Profile.
      </p>

      <Section title="The payday cycle">
        <AnchorSection />
      </Section>
      <Section title="Where your money sits">
        <AccountsSection />
      </Section>
      <Section title="Salary and what repeats every cycle">
        <TemplatesSection currentMonth={selectedMonth ?? ''} />
      </Section>
      <Section title="Credit cards and their invoices">
        <CardsSection />
      </Section>
      <Section title="What you are saving for">
        <BucketsSection />
      </Section>

      <Section title="Where that leaves you">
        <SetupSummary />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-t border-zinc-200 pt-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
