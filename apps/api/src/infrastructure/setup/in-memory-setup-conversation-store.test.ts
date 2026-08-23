import { describe, expect, it } from 'vitest';

import { InMemorySetupConversationStore } from './in-memory-setup-conversation-store.js';

const conversation = (id: string, state: string) => ({
  id,
  transcript: [{ role: 'user' as const, text: 'I am paid on the 5th' }],
  state,
  records: [],
});

describe('InMemorySetupConversationStore', () => {
  it('hands back the conversation it was given', async () => {
    const store = new InMemorySetupConversationStore<string, never>();
    await store.save(conversation('conv-1', 'ANCHOR'));

    expect((await store.load('conv-1'))?.state).toBe('ANCHOR');
  });

  it('replaces a conversation when its next turn is saved', async () => {
    const store = new InMemorySetupConversationStore<string, never>();
    await store.save(conversation('conv-1', 'ANCHOR'));
    await store.save(conversation('conv-1', 'ACCOUNTS'));

    expect((await store.load('conv-1'))?.state).toBe('ACCOUNTS');
  });

  it('holds nothing for a conversation it never saw', async () => {
    const store = new InMemorySetupConversationStore<string, never>();

    expect(await store.load('conv-9')).toBeUndefined();
  });
});
