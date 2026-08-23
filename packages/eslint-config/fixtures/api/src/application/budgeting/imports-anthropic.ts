import Anthropic from '@anthropic-ai/sdk';

export const brokenModel = (): unknown => new Anthropic();
