import type { ReactNode } from 'react';

interface Props {
  children: ReactNode;
  className?: string;
  /**
   * Names the section for assistive technology. A card carrying one of a
   * screen's own sections gets one; a card that is one item in a list of many
   * does not, or the page becomes a wall of landmarks.
   */
  label?: string;
}

export function Card({ children, className = '', label }: Props) {
  return (
    <section
      aria-label={label}
      className={`rounded-xl border border-zinc-200 bg-white p-4 ${className}`}
    >
      {children}
    </section>
  );
}

export function CardTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="text-xs font-semibold tracking-wider text-zinc-500 uppercase">
      {children}
    </h2>
  );
}
