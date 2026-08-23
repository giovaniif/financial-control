import type { ReactNode } from 'react';

import { useSelectedCycle } from '@/features/navigate-cycle';

import { AccountsSection } from './sections/accounts-section.js';
import { AnchorSection } from './sections/anchor-section.js';
import { BucketsSection } from './sections/buckets-section.js';
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
        Configurar por conversa precisa de uma chave de API do Claude, e este
        app não tem nenhuma configurada. Nada fica faltando por causa disso — as
        mesmas seções estão abaixo como um formulário simples, e cada uma delas
        pode ser alterada depois no Perfil.
      </p>

      <Section title="O ciclo de pagamento">
        <AnchorSection />
      </Section>
      <Section title="Onde o seu dinheiro está">
        <AccountsSection />
      </Section>
      <Section title="Salário e o que se repete a cada ciclo">
        <TemplatesSection currentMonth={selectedMonth ?? ''} />
      </Section>
      <Section title="Para o que você está guardando">
        <BucketsSection />
      </Section>

      <Section title="Onde isso deixa você">
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
