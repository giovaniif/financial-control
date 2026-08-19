import type { SetupSection } from '@fin/contracts';

import { SECTION_LABELS, SECTION_ORDER } from '../model/sections.js';

interface Props {
  /** What is being asked about now, or nothing once the draft is complete. */
  next: SetupSection | null;
}

/**
 * UC-1.5 — the seven questions as a path, carried in the top bar. It reads the
 * draft's own progress: everything behind the current section has been
 * answered, and none of it is a step the user walks through by clicking.
 */
export function SetupProgress({ next }: Props) {
  const current =
    next === null ? SECTION_ORDER.length : SECTION_ORDER.indexOf(next);

  return (
    <nav aria-label="Setup progress">
      <ol className="flex items-center text-xs whitespace-nowrap">
        {SECTION_ORDER.map((section, index) => (
          <li
            key={section}
            aria-current={index === current ? true : undefined}
            className="flex shrink-0 items-center"
          >
            {index > 0 && (
              <span aria-hidden="true" className="mx-2 h-px w-4 bg-zinc-200" />
            )}
            <Marker isDone={index < current} isCurrent={index === current} />
            <span
              className={
                index === current
                  ? 'ml-1.5 font-medium text-zinc-900'
                  : `ml-1.5 ${index < current ? 'text-zinc-500' : 'text-zinc-400'}`
              }
            >
              {SECTION_LABELS[section]}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Marker({
  isDone,
  isCurrent,
}: {
  isDone: boolean;
  isCurrent: boolean;
}) {
  if (isDone) {
    return (
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="size-3 text-zinc-400"
      >
        <path d="m5 13 4 4L19 7" />
      </svg>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={
        isCurrent
          ? 'size-1.5 rounded-full bg-zinc-900'
          : 'size-1.5 rounded-full border border-zinc-300'
      }
    />
  );
}
