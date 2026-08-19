import { render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { handToAssistant } from './hand-to-assistant.js';

/** Stands in for the panel: it holds its own draft, as the real one does. */
function Panel() {
  const [draft, setDraft] = useState('');

  return (
    <div data-testid="panel">
      <label htmlFor="q">Ask about your money</label>
      <textarea
        id="q"
        value={draft}
        onChange={(event) => {
          setDraft(event.target.value);
        }}
      />
    </div>
  );
}

describe('handToAssistant', () => {
  it('writes the question into the panel’s own box', () => {
    render(<Panel />);

    handToAssistant(screen.getByTestId('panel'), 'Why is September lower?');

    expect(screen.getByLabelText('Ask about your money')).toHaveValue(
      'Why is September lower?',
    );
  });

  it('puts the cursor where the question can be sent or edited', () => {
    render(<Panel />);

    handToAssistant(screen.getByTestId('panel'), 'Why?');

    expect(screen.getByLabelText('Ask about your money')).toHaveFocus();
  });

  it('does nothing when the panel is not on screen', () => {
    expect(() => {
      handToAssistant(null, 'Why?');
    }).not.toThrow();
  });
});
