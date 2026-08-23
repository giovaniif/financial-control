import { useAccounts } from '@/entities/account';
import { useBuckets } from '@/entities/bucket';
import { useCards } from '@/entities/card';
import { useCycleWindow } from '@/entities/cycle';
import { useTemplates } from '@/entities/template';
import { BackupRestore } from '@/features/backup-restore';
import { Card, CardTitle } from '@/shared/ui';

/** UC-1.6 — the only recovery mechanism there is. */
export function BackupSection() {
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
