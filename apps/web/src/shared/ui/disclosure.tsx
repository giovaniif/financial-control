import type { ReactNode } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  /** What the trigger says. Names its subject, so several on a screen differ. */
  label: string;
  children: ReactNode;
}

/** Where the panel sits, in viewport coordinates. */
interface At {
  top: number;
  right: number;
}

/** Just under the trigger, right edges aligned. */
function placeUnder(box: DOMRect): At {
  return { top: box.bottom + 4, right: window.innerWidth - box.right };
}

/**
 * A trigger and the panel it reveals.
 *
 * **Deliberately a disclosure and not a menu.** `role="menu"` promises
 * arrow-key roving focus and typeahead; claiming it without implementing it
 * leaves a screen-reader user pressing keys that do nothing, which is worse
 * than the plain semantics. The panel holds ordinary buttons that open
 * ordinary dialogs, and that is exactly what a disclosure describes.
 *
 * **Portalled and positioned, not absolutely placed.** A trigger inside a
 * horizontally scrolling row has its panel clipped by that row — `overflow-x:
 * auto` clips the other axis too — so the panel renders into `body` at the
 * trigger's coordinates and follows it while anything scrolls.
 *
 * It follows rather than closing on scroll. Closing looked simpler and was
 * wrong: the row this sits in snap-scrolls, so the panel shut itself the
 * instant it opened.
 *
 * The panel stays mounted while hidden, because an action in it opens a
 * dialog and unmounting would take the dialog down with the panel.
 */
export function Disclosure({ label, children }: Props) {
  const [at, setAt] = useState<At | undefined>(undefined);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const isOpen = at !== undefined;

  const close = () => {
    setAt(undefined);
  };

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        // Focus goes back where it came from, or it lands on the body and the
        // next Tab starts from the top of the page.
        trigger.current?.focus();
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      const inTrigger = trigger.current?.contains(target) ?? false;
      const inPanel = panel.current?.contains(target) ?? false;
      if (!inTrigger && !inPanel) {
        close();
      }
    };
    // Taking an action puts the panel away. Listened for rather than handed
    // to the caller as an `onClick`, which would be a click handler on a
    // non-interactive element — and this is the primitive's business anyway.
    const onAction = (event: MouseEvent) => {
      if ((event.target as HTMLElement).closest('button') !== null) {
        close();
      }
    };

    const follow = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (box !== undefined) {
        setAt(placeUnder(box));
      }
    };

    const opened = panel.current;
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', follow, true);
    window.addEventListener('resize', follow);
    opened?.addEventListener('click', onAction);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', follow, true);
      window.removeEventListener('resize', follow);
      opened?.removeEventListener('click', onAction);
    };
  }, [isOpen]);

  const toggle = () => {
    if (isOpen) {
      close();
      return;
    }
    const box = trigger.current?.getBoundingClientRect();
    if (box !== undefined) {
      setAt(placeUnder(box));
    }
  };

  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-label={label}
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={toggle}
        /* No border: it sits beside a real button on every row it appears
           on, and two outlines side by side read as two equal choices when
           one is the action and the other is only a way in. Vertical, which
           is what a per-row overflow control is. */
        className="cursor-pointer rounded-lg px-1.5 py-1 text-base leading-none text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
      >
        ⋮
      </button>
      {createPortal(
        <div
          ref={panel}
          id={panelId}
          hidden={!isOpen}
          style={
            at === undefined ? undefined : { top: at.top, right: at.right }
          }
          /* The panel styles its own items rather than every caller passing
             a variant: being in a menu is what makes a button a menu row, and
             that is something the container knows. Bordered pills inside a
             bordered panel read as boxes in a box. */
          className="fixed z-40 flex min-w-52 flex-col items-stretch rounded-xl border border-zinc-200 bg-white p-1 text-zinc-900 shadow-lg [&_button]:w-full [&_button]:rounded-md [&_button]:border-0 [&_button]:bg-transparent [&_button]:px-3 [&_button]:py-2 [&_button]:text-left [&_button]:font-normal [&_button]:hover:bg-zinc-100"
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
