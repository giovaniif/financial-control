import Anthropic from '@anthropic-ai/sdk';

export const client = (): unknown => new Anthropic();
