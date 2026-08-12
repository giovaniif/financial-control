export interface Step {
  id: string;
  label: string;
}

interface Props {
  steps: readonly Step[];
  current: number;
}

type State = 'done' | 'current' | 'upcoming';

const dot: Record<State, string> = {
  done: 'bg-green-100 text-green-700',
  current: 'bg-zinc-900 text-zinc-50',
  upcoming: 'bg-zinc-100 text-zinc-400',
};

const label: Record<State, string> = {
  done: 'text-zinc-500',
  current: 'font-medium text-zinc-900',
  upcoming: 'text-zinc-400',
};

function stateOf(index: number, current: number): State {
  if (index < current) return 'done';
  return index === current ? 'current' : 'upcoming';
}

/** Where the user is in a multi-step flow, and how much of it is left. */
export function Stepper({ steps, current }: Props) {
  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {steps.map((step, index) => {
        const state = stateOf(index, current);

        return (
          <li
            key={step.id}
            data-state={state}
            aria-current={state === 'current' ? 'step' : undefined}
            className="flex items-center gap-2 text-sm"
          >
            <span
              aria-hidden
              className={`flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${dot[state]}`}
            >
              {index + 1}
            </span>
            <span className={label[state]}>{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}
