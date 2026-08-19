import { AppShell } from '@/widgets/app-shell';

import { AccountsSection } from './accounts-section.js';
import { BackupSection } from './backup-section.js';
import { BillsSection } from './bills-section.js';
import { CardsSection } from './cards-section.js';
import { Formatting } from './formatting.js';
import { PaydayAnchor } from './payday-anchor.js';
import { SetupChecklist } from './setup-checklist.js';

/**
 * UC-1 and UC-2 — everything the user configures, in the order the setup
 * conversation asked for it: the anchor, the accounts, the salary, the bills,
 * the cards. A section here is the question that filled it, made editable.
 */
export function ProfilePage() {
  return (
    <AppShell
      title="Perfil"
      subtitle="Tudo que você configura — o dia do pagamento, as contas, as contas a pagar e os cartões"
    >
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <PaydayAnchor />
          <AccountsSection />
        </div>
        <BillsSection />
        <CardsSection />
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <SetupChecklist />
          <Formatting />
          <BackupSection />
        </div>
      </div>
    </AppShell>
  );
}
