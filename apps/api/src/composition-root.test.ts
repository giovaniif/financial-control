import { describe, expect, it } from 'vitest';

import { createApp } from './composition-root.js';

describe('createApp', () => {
  it('wires a server that answers the health check', async () => {
    const response = await createApp().inject({
      method: 'GET',
      url: '/health',
    });

    expect(response.statusCode).toBe(200);
  });
});
