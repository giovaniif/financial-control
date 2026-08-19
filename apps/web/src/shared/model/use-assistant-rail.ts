import { use } from 'react';

import type { AssistantRailContextValue } from './assistant-rail-context.js';
import { AssistantRailContext } from './assistant-rail-context.js';

export function useAssistantRail(): AssistantRailContextValue {
  const context = use(AssistantRailContext);
  if (context === undefined) {
    throw new Error(
      'useAssistantRail must be used inside an AssistantRailProvider',
    );
  }
  return context;
}
