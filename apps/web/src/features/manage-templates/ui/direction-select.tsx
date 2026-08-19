import type { Direction } from '@fin/contracts';
import { useId } from 'react';

/** Money out is negative in the domain; the form asks rather than assumes. */
export function DirectionSelect({
  value,
  onChange,
}: {
  value: Direction;
  onChange: (direction: Direction) => void;
}) {
  const id = useId();

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600">
        Direção
      </label>
      <select
        id={id}
        value={value === 'IN' ? 'Entrada' : 'Saída'}
        onChange={(event) => {
          onChange(event.target.value === 'Entrada' ? 'IN' : 'OUT');
        }}
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm"
      >
        <option>Saída</option>
        <option>Entrada</option>
      </select>
    </div>
  );
}
