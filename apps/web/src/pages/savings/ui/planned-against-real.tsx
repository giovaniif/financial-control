import type { BucketView } from '@/entities/bucket';
import { plannedAgainstReal } from '@/entities/bucket';
import { formatBRL } from '@/shared/lib';
import { Card, CardTitle, StatTile } from '@/shared/ui';

/**
 * UC-6.6 — what the rules said should have accumulated, against what is
 * actually there. The gap is the honest picture, and naming what causes it is
 * the whole reason the log keeps corrections rather than overwriting.
 */
export function PlannedAgainstReal({ bucket }: { bucket: BucketView }) {
  const { planned, real, gap } = plannedAgainstReal(bucket);

  return (
    <Card label="Planned against real" className="flex flex-col gap-3 bg-white">
      <CardTitle>{bucket.name} — planned against real</CardTitle>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile
          label="The rules said"
          cents={planned}
          note="Every contribution the rules made, plus what each override replaced"
        />
        <StatTile
          label="Actually there"
          cents={real}
          note="The fold over the whole event log"
        />
        <StatTile label="Gap" cents={gap} signed note={explain(gap)} />
      </div>
    </Card>
  );
}

function explain(gap: number): string {
  if (gap === 0) {
    return 'Exactly what the rules said would be here';
  }
  if (gap > 0) {
    return `${formatBRL(gap)} ahead of what the rules said — yields and corrections are the difference`;
  }

  return `${formatBRL(-gap)} behind what the rules said — withdrawals and corrections are the difference`;
}
