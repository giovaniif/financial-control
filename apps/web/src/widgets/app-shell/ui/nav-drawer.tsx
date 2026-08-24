import { EASE_SHEET, MOTION_MS } from '../model/motion.js';
import { Sidebar } from './sidebar.js';

interface Props {
  isOpen: boolean;
  onDismiss: () => void;
}

/**
 * The nav on a phone: the same sidebar, over the content rather than beside
 * it.
 *
 * It stays mounted and hides with `visibility`, as the chat rail does — which
 * both lets it slide out instead of vanishing and keeps its links out of the
 * accessibility tree and the tab order while it is away. A drawer that is
 * merely translated off-screen is still a set of links a keyboard lands on.
 */
export function NavDrawer({ isOpen, onDismiss }: Props) {
  const motion = {
    transitionDuration: `${String(MOTION_MS)}ms`,
    transitionTimingFunction: EASE_SHEET,
  };

  return (
    <>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar o menu"
        style={{
          ...motion,
          visibility: isOpen ? 'visible' : 'hidden',
          transitionProperty: 'opacity, visibility',
        }}
        className={`fixed inset-0 z-40 cursor-pointer bg-zinc-900/40 motion-reduce:transition-none ${
          isOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <div
        style={{
          ...motion,
          visibility: isOpen ? 'visible' : 'hidden',
          transitionProperty: 'transform, visibility',
        }}
        className={`fixed inset-y-0 left-0 z-50 shadow-2xl motion-reduce:transition-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <Sidebar isCollapsed={false} onNavigate={onDismiss} />
      </div>
    </>
  );
}
