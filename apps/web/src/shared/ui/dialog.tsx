import type { ReactNode } from 'react';
import { useEffect, useId } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * Every form in the app is a short one over an existing screen, so they all
 * open here rather than on a route of their own. Not `<dialog>`: its modal
 * behaviour is unimplemented in jsdom, and the focus trap it would buy is not
 * worth a component that cannot be tested.
 */
export function Dialog({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onClose]);

  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-zinc-900/30 p-6 pt-24">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-zinc-200 bg-white p-5 shadow-lg"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Descartar"
            className="cursor-pointer rounded-lg px-2 py-0.5 text-lg leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
