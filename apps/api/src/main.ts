import { createApp } from './composition-root.js';

const port = Number(process.env['PORT'] ?? 3333);

// Binds every interface, not loopback: the API is reached from another machine
// over Tailscale, and on Render the platform routes to the container's port.
await createApp().listen({ host: '0.0.0.0', port });
