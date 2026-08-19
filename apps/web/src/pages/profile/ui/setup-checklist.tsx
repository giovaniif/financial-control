import { Link } from 'react-router';

import { useTemplates } from '@/entities/template';
import { useSetupState } from '@/shared/api';
import { unskipSetup } from '@/shared/model';
import { Card, CardTitle } from '@/shared/ui';

/**
 * UC-1.5 — the same seven questions the setup conversation asks, in the same
 * order, showing which are still outstanding. Everything but the buckets is
 * answered on this screen, which is why only that step links away.
 */
export function SetupChecklist() {
  const { data } = useSetupState();
  const { data: bills } = useTemplates();

  const recurring = bills?.templates ?? [];
  const income = recurring.filter((bill) => bill.direction === 'IN');
  const outgoing = recurring.filter((bill) => bill.direction === 'OUT');
  const variable = outgoing.filter((bill) => bill.isEstimate);
  const anchorConfigured = data?.anchorConfigured === true;

  const steps = [
    {
      label: 'O ciclo de pagamento',
      state: anchorConfigured ? 'configurado' : 'ainda não definido',
      done: anchorConfigured,
      to: null,
    },
    countStep('Contas', data?.accounts ?? 0, 'contas'),
    recordedStep('Salário', income.length),
    recordedStep('Contas fixas', outgoing.length - variable.length),
    recordedStep('Contas variáveis', variable.length),
    countStep('Cartões de crédito', data?.cards ?? 0, 'cartões'),
    {
      ...countStep('Caixinhas', data?.buckets ?? 0, 'caixinhas'),
      to: '/savings',
    },
  ];

  return (
    <Card label="Configuração" className="flex flex-col gap-3">
      <CardTitle>Configuração</CardTitle>
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
          Executar a configuração novamente
        </Link>
      </div>
    </Card>
  );
}

function countStep(label: string, count: number, noun: string) {
  return {
    label,
    state: `${String(count)} ${noun}`,
    done: count > 0,
    to: null as string | null,
  };
}

function recordedStep(label: string, count: number) {
  return {
    label,
    state: `${String(count)} registrados`,
    done: count > 0,
    to: null as string | null,
  };
}
