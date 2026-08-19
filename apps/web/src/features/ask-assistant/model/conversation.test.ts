import type { AssistantProposalResponse } from '@fin/contracts';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EMPTY_CONVERSATION,
  loadConversation,
  saveConversation,
  withApplied,
  withoutProposal,
  type Conversation,
} from './conversation.js';

const proposal = (id: string): AssistantProposalResponse => ({
  id,
  kind: 'ADD_ENTRY',
  summary: `Add “Dentist ${id}” to the 2026-09 cycle.`,
  proposedAt: '2026-08-18T10:00:00.000Z',
});

const answered = (): Conversation => ({
  conversationId: 'c1',
  entries: [
    { kind: 'question', text: 'Can I afford a dentist?' },
    {
      kind: 'answer',
      text: 'Yes — September closes at R$ 3.556,00.',
      reads: [{ tool: 'read_cycle', failure: null }],
      proposals: [
        { proposal: proposal('p1'), isApplied: false },
        { proposal: proposal('p2'), isApplied: false },
      ],
      wasRefused: false,
      hitReadLimit: false,
    },
  ],
});

afterEach(() => {
  localStorage.clear();
});

describe('conversation', () => {
  /** A question asked yesterday is still there today — the panel is not a session. */
  it('survives a reload', () => {
    saveConversation(answered());

    expect(loadConversation()).toEqual(answered());
  });

  it('starts empty when nothing has been asked', () => {
    expect(loadConversation()).toEqual(EMPTY_CONVERSATION);
  });

  it('starts empty rather than throwing on something it cannot read', () => {
    localStorage.setItem('fin.assistant', 'not json');

    expect(loadConversation()).toEqual(EMPTY_CONVERSATION);
  });

  it('drops a dismissed proposal', () => {
    const after = withoutProposal(answered(), 'p1');

    expect(proposalIds(after)).toEqual(['p2']);
  });

  it('keeps an applied proposal, marked as applied', () => {
    const after = withApplied(answered(), 'p1');
    const [first] = openProposals(after);

    expect(proposalIds(after)).toEqual(['p1', 'p2']);
    expect(first?.isApplied).toBe(true);
  });
});

function openProposals(conversation: Conversation) {
  return conversation.entries.flatMap((entry) =>
    entry.kind === 'answer' ? entry.proposals : [],
  );
}

function proposalIds(conversation: Conversation): string[] {
  return openProposals(conversation).map((offered) => offered.proposal.id);
}
