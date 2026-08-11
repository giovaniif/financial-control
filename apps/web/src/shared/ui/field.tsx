import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
  error?: string;
}

/** A labelled input. Every input in the app is reachable by its label. */
export function Field({ label, hint, error, ...props }: Props) {
  const id = useId();
  const describedBy = error !== undefined ? `${id}-error` : `${id}-hint`;

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-zinc-600">
        {label}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={error !== undefined}
        aria-describedby={
          error !== undefined || hint !== undefined ? describedBy : undefined
        }
        className="rounded-lg border border-zinc-200 px-3 py-1.5 text-sm focus:border-zinc-400 focus:outline-none aria-[invalid=true]:border-red-300"
      />
      {error !== undefined ? (
        <span id={`${id}-error`} role="alert" className="text-xs text-red-700">
          {error}
        </span>
      ) : (
        hint !== undefined && (
          <span id={`${id}-hint`} className="text-xs text-zinc-500">
            {hint}
          </span>
        )
      )}
    </div>
  );
}
