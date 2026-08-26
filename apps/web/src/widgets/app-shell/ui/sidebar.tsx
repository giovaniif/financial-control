import { NavLink } from 'react-router';

import { EASE_SHEET, MOTION_MS } from '../model/motion.js';
import { AccountsTotal } from './accounts-total.js';

/**
 * Three screens, per `docs/USE_CASES.md` §5 — few enough to need no grouping.
 *
 * The two that answer a question sit together (§1: Main answers Q1,
 * Investments & Savings answers Q2); Perfil configures the app and follows
 * them.
 */
const items = [
  {
    to: '/',
    label: 'Principal',
    paths: ['M4 10.5 12 4l8 6.5', 'M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9'],
  },
  {
    to: '/savings',
    label: 'Investimentos e Reservas',
    paths: ['M3.5 17.5 10 11l4 4 6.5-7.5', 'M15 7.5h5.5V13'],
  },
  {
    to: '/profile',
    label: 'Perfil',
    paths: [
      'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M4.5 20.5a7.5 7.5 0 0 1 15 0',
    ],
  },
];

interface Props {
  /** Folded to a 56px icon strip so the chat rail has somewhere to open. */
  isCollapsed: boolean;
  /**
   * Called once a screen is picked. The drawer passes a dismiss here; beside
   * the content there is nothing to dismiss, so it does not.
   */
  onNavigate?: (() => void) | undefined;
}

export function Sidebar({ isCollapsed, onNavigate }: Props) {
  return (
    <aside
      style={{
        transitionProperty: 'width',
        transitionDuration: `${String(MOTION_MS)}ms`,
        transitionTimingFunction: EASE_SHEET,
      }}
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-6 overflow-hidden border-r border-zinc-200 bg-white py-5 motion-reduce:transition-none ${
        isCollapsed ? 'w-14 items-center' : 'w-60'
      }`}
    >
      <div className={`flex items-center gap-2 ${isCollapsed ? '' : 'px-5'}`}>
        <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-900 font-mono text-xs font-semibold text-zinc-50">
          R
        </span>
        <span
          className={`text-sm font-semibold ${isCollapsed ? 'sr-only' : ''}`}
        >
          Controle Financeiro
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={({ isActive }) =>
              `mx-2 flex items-center gap-2 rounded-lg text-sm transition-colors ${
                isCollapsed ? 'size-10 justify-center' : 'px-3 py-2.5'
              } ${
                isActive
                  ? 'bg-zinc-100 font-semibold text-zinc-900'
                  : 'text-zinc-600 hover:bg-zinc-50'
              }`
            }
          >
            <NavIcon paths={item.paths} />
            {/* An icon with a tooltip is not a name: the label stays in the
                link, read out even when it is not drawn. */}
            <span className={isCollapsed ? 'sr-only' : ''}>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Permanently visible: while the nav is folded the header carries it.
          The bottom padding is the desktop chat button's room, which sits in
          this corner; on a phone that button is bottom-right and the drawer
          simply keeps the same footing. */}
      {!isCollapsed && (
        <div className="mt-auto px-5 pb-14">
          <AccountsTotal />
        </div>
      )}
    </aside>
  );
}

function NavIcon({ paths }: { paths: readonly string[] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-5 shrink-0"
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}
