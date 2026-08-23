import { describe, expect, it } from 'vitest';

import { ApiError } from '@/shared/api';

import { explainApplyFailure } from './apply-failure.js';

describe('explainApplyFailure', () => {
  /** The state refused a well-formed change — the proposal is still worth retrying. */
  it('reads a 409 as the app refusing the change', () => {
    const reason = explainApplyFailure(
      new ApiError(
        409,
        '/assistant/proposals/p1/apply',
        'The cycle is closed.',
      ),
    );

    expect(reason).toContain('The cycle is closed.');
    expect(reason).toContain('refused');
  });

  it('reads a 404 as the proposal no longer being on the server', () => {
    expect(
      explainApplyFailure(new ApiError(404, '/x', 'No such proposal.')),
    ).toContain('no longer');
  });

  it('reads a 503 as the assistant being switched off', () => {
    expect(explainApplyFailure(new ApiError(503, '/x'))).toContain(
      'switched off',
    );
  });

  it('reads a 502 as the assistant having failed, not the change', () => {
    expect(explainApplyFailure(new ApiError(502, '/x'))).toContain(
      'could not be reached',
    );
  });

  it('says nothing was written when the request never arrived', () => {
    expect(explainApplyFailure(new Error('Failed to fetch'))).toContain(
      'Nothing was written',
    );
  });
});
