import { NavLink } from 'react-router';

import { AccountsTotal } from './accounts-total.js';

/** Three screens, per `docs/USE_CASES.md` §5 — few enough to need no grouping. */
const items = [
  {
    to: '/',
    label: 'Main',
    paths: ['M4 10.5 12 4l8 6.5', 'M6 10v9a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-9'],
  },
  {
    to: '/profile',
    label: 'Profile',
    paths: [
      'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
      'M4.5 20.5a7.5 7.5 0 0 1 15 0',
    ],
  },
  {
    to: '/savings',
    label: 'Investments & Savings',
    paths: ['M3.5 17.5 10 11l4 4 6.5-7.5', 'M15 7.5h5.5V13'],
  },
];

interface Props {
  /** Folded to a 56px icon strip so the chat rail has somewhere to open. */
  isCollapsed: boolean;
}

export function Sidebar({ isCollapsed }: Props) {
  return (
    <aside
      className={`sticky top-0 flex h-screen shrink-0 flex-col gap-6 border-r border-zinc-200 bg-white py-5 ${
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
          Financial Control
        </span>
      </div>

      <nav className="flex flex-col gap-0.5">
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `mx-2 flex items-center gap-2 rounded-lg text-sm transition-colors ${
                isCollapsed ? 'size-10 justify-center' : 'px-3 py-1.5'
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

      {/* Permanently visible: while the nav is folded the header carries it. */}
      {!isCollapsed && (
        <div className="mt-auto px-5">
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
