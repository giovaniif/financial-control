import { describe, expect, it } from 'vitest';

import type { StoredAssistantConversation } from '../../domain/ports/assistant-conversation-store.js';
import { Principal } from '../../domain/shared/principal.js';

import { InMemoryAssistantConversationStore } from './in-memory-assistant-conversation-store.js';

const conversation = (
  id: string,
  question: string,
): StoredAssistantConversation => ({
  id,
  principal: Principal.sole(),
  transcript: [{ role: 'user', text: question }],
});

describe('InMemoryAssistantConversationStore', () => {
  it('hands back the conversation it was given', async () => {
    const store = new InMemoryAssistantConversationStore();
    await store.save(conversation('conv-1', 'How much is left?'));

    expect((await store.load('conv-1'))?.transcript).toEqual([
      { role: 'user', text: 'How much is left?' },
    ]);
  });

  it('replaces a conversation when its next turn is saved', async () => {
    const store = new InMemoryAssistantConversationStore();
    await store.save(conversation('conv-1', 'How much is left?'));
    await store.save(conversation('conv-1', 'And in November?'));

    expect((await store.load('conv-1'))?.transcript).toEqual([
      { role: 'user', text: 'And in November?' },
    ]);
  });

  it('holds nothing for a conversation it never saw', async () => {
    const store = new InMemoryAssistantConversationStore();

    expect(await store.load('conv-9')).toBeUndefined();
  });
});
