import { describe, expect, it } from 'vitest';
import webConfig from '../../../packages/web/vite.config';

// DIS-58 design D22: the same-origin proxy of the web's development and preview servers, read as
// configuration. The live behaviour is checked in the manual interface test.

const API_ORIGIN = 'http://127.0.0.1:3000';

describe('Same-origin access to the API in local development', () => {
  it('Both servers forward the API paths', () => {
    // Arrange
    const servers = { server: webConfig.server, preview: webConfig.preview };

    // Act
    const forwarding = Object.fromEntries(
      Object.entries(servers).map(([name, options]) => [name, options?.proxy]),
    );

    // Assert
    expect(forwarding).toEqual({
      server: { '/api': API_ORIGIN, '/health': API_ORIGIN },
      preview: { '/api': API_ORIGIN, '/health': API_ORIGIN },
    });
  });
});
