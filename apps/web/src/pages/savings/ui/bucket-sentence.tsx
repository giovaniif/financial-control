import type {
  BucketProjectionView,
  GoalProjection,
  OngoingProjection,
} from '@/entities/bucket';
import {
  formatBRL,
  formatMonthLabel,
  formatMonthOf,
  formatPercent,
  shiftMonth,
} from '@/shared/lib';
import { Amount, Badge, Card, Field } from '@/shared/ui';

interface Props {
  projection: BucketProjectionView;
  /** The cycle the projection counts from — the one the header has selected. */
  fromMonth: string | undefined;
  yieldPercent: string;
  onYieldChange: (percent: string) => void;
}

/** UC-7.3 — one plain sentence per bucket, in that bucket's own terms. */
export function BucketSentence({
  projection,
  fromMonth,
  yieldPercent,
  onYieldChange,
}: Props) {
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{projection.name}</span>
        {projection.mode === 'GOAL' ? (
          <Badge tone={projection.isOnTrack ? 'positive' : 'critical'}>
            {projection.isOnTrack ? 'no prazo' : 'atrasada'}
          </Badge>
        ) : (
          <Badge tone="info">contínua</Badge>
        )}
      </div>

      {projection.mode === 'GOAL' ? (
        <GoalSentence projection={projection} fromMonth={fromMonth} />
      ) : (
        <OngoingSentence projection={projection} />
      )}

      {/* UC-7.1 and UC-7.4 — the assumption sits with the number it moves. */}
      <Field
        label="Rendimento anual esperado"
        aria-label={`Rendimento anual esperado para ${projection.name}`}
        type="number"
        value={yieldPercent}
        onChange={(event) => {
          onYieldChange(event.target.value);
        }}
        hint="Uma premissa. Ajustar aqui move a projeção; salvar na regra da caixinha é o que mantém."
      />
    </Card>
  );
}

function GoalSentence({
  projection,
  fromMonth,
}: {
  projection: GoalProjection;
  fromMonth: string | undefined;
}) {
  return (
    <>
      <p className="text-sm text-zinc-600">
        Com <Amount cents={projection.contributionPerCycle} /> por ciclo e{' '}
        {formatPercent(projection.expectedYieldPercent)} ao ano,{' '}
        {projection.name}{' '}
        {projection.reachesTargetIn === null ? (
          <>
            nunca alcança <Amount cents={projection.target} />.
          </>
        ) : (
          <>
            alcança <Amount cents={projection.target} />{' '}
            {arrival(fromMonth, projection.reachesTargetIn)}.
          </>
        )}
        {projection.targetDate !== null &&
          ` Objetivo: ${formatMonthOf(projection.targetDate)}.`}
      </p>

      {projection.contributionToCatchUp !== null && (
        <p role="alert" className="text-sm text-red-700">
          {formatBRL(projection.contributionToCatchUp)} por ciclo traria de
          volta ao prazo.
        </p>
      )}
    </>
  );
}

function OngoingSentence({ projection }: { projection: OngoingProjection }) {
  return (
    <p className="text-sm text-zinc-600">
      Com <Amount cents={projection.contributionPerCycle} /> por ciclo e{' '}
      {formatPercent(projection.expectedYieldPercent)} ao ano, {projection.name}{' '}
      tem{' '}
      {projection.inFiveYears === null ? (
        '—'
      ) : (
        <Amount cents={projection.inFiveYears} compact />
      )}{' '}
      em 5 anos e{' '}
      {projection.inTenYears === null ? (
        '—'
      ) : (
        <Amount cents={projection.inTenYears} compact />
      )}{' '}
      em 10. Sem objetivo a bater — a questão é só se o ritmo está certo.
    </p>
  );
}

/**
 * The projection counts in cycles from the one on screen. Without a cycle to
 * count from there is no month to name, and saying so beats naming a wrong one.
 */
function arrival(fromMonth: string | undefined, cycles: number): string {
  return fromMonth === undefined
    ? `em ${String(cycles)} ciclos`
    : `em ${formatMonthLabel(shiftMonth(fromMonth, cycles))}`;
}
