import { Sidebar } from './sidebar.js';

interface Props {
  onDismiss: () => void;
}

/**
 * The nav on a phone: the same sidebar, over the content rather than beside
 * it. It unmounts when dismissed — the nav holds no state worth keeping, and
 * links left in the tree behind a transform are links a keyboard still lands
 * on.
 */
export function NavDrawer({ onDismiss }: Props) {
  return (
    <>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Fechar o menu"
        className="fixed inset-0 z-40 cursor-pointer bg-zinc-900/40"
      />
      <div className="fixed inset-y-0 left-0 z-50 shadow-2xl">
        <Sidebar isCollapsed={false} onNavigate={onDismiss} />
      </div>
    </>
  );
}
