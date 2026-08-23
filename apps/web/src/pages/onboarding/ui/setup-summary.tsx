import { Link } from 'react-router';

import { useSetupState } from '@/shared/api';
import { Skeleton } from '@/shared/ui';

/** UC-1.5 — what was actually set up, and where to go with it. */
export function SetupSummary() {
  const { data, isPending } = useSetupState();

  if (isPending) {
    return <Skeleton className="h-32 w-full" />;
  }

  const rows = [
    {
      label: 'Dia do pagamento',
      value: (data?.anchorConfigured ?? false) ? 'configurado' : 'não definido',
    },
    { label: 'Contas', value: String(data?.accounts ?? 0) },
    { label: 'Salário e contas', value: String(data?.templates ?? 0) },
    { label: 'Caixinhas', value: String(data?.buckets ?? 0) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-zinc-600">
        Isso é tudo o que o app precisa para começar a responder. A partir daqui
        ele preenche os próximos doze ciclos com o seu salário e suas contas, e
        aloca a sobra pelas suas regras.
      </p>

      <dl className="divide-y divide-zinc-100 text-sm">
        {rows.map((row) => (
          <div key={row.label} className="flex justify-between py-1.5">
            <dt className="text-zinc-600">{row.label}</dt>
            <dd className="font-medium">{row.value}</dd>
          </div>
        ))}
      </dl>

      <p className="text-sm text-zinc-500">
        Nada aqui é definitivo — cada um destes itens é editável no Perfil, e o
        próximo ciclo que você abrir vai mostrar no que eles se somam.
      </p>

      <div>
        <Link
          to="/"
          className="inline-block rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-zinc-50 transition-colors hover:bg-zinc-800"
        >
          Abrir o Principal
        </Link>
      </div>
    </div>
  );
}
