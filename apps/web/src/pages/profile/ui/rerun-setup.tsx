import { Link } from 'react-router';

import { unskipSetup } from '@/shared/model';

/**
 * UC-1.5 — the way back into the setup conversation, at any time.
 *
 * `unskipSetup` clears the flag that lets the app past first run, so the
 * conversation is entered rather than bounced straight back to Main.
 */
export function RerunSetup() {
  return (
    <div className="flex justify-start">
      <Link
        to="/onboarding"
        onClick={unskipSetup}
        className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-50 hover:text-zinc-900"
      >
        Refazer a configuração
      </Link>
    </div>
  );
}
