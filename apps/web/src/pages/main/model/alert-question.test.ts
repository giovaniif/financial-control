import type { AlertResponse } from '@fin/contracts';
import { describe, expect, it } from 'vitest';

import { questionFor } from './alert-question.js';

describe('questionFor', () => {
  // UC-4.7 with UC-8: an alert is the thing most worth asking about, so the
  // question is written for the user rather than left for them to type.
  it('asks about the alert in the alert’s own words', () => {
    const alert: AlertResponse = {
      severity: 'CRITICAL',
      title: 'Projected negative balance on 2026-09-28',
      body: 'September 2026 runs to -R$ 2.013,22 after Contractor Costs.',
    };

    expect(questionFor(alert)).toBe(
      'Sobre “Projected negative balance on 2026-09-28”: September 2026 ' +
        'runs to -R$ 2.013,22 after Contractor Costs. Por que isso acontece, ' +
        'e o que mudaria isso?',
    );
  });
});
