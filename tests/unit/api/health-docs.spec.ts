import { afterEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildTestApp, countedPorts } from './support';

// Spec: api-foundation → "Liveness route" and "OpenAPI document at /docs" (DIS-76 design U5).

let app: FastifyInstance | undefined;

afterEach(async () => {
  await app?.close();
  app = undefined;
});

describe('liveness route', () => {
  it('Health answers ok without touching the store', async () => {
    // Arrange
    const ports = countedPorts();
    ({ app } = await buildTestApp({ deps: { store: ports.store.port, llm: ports.llm.port, source: ports.source.port } }));

    // Act
    const response = await app.inject({ method: 'GET', url: '/health' });

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(ports.store.calls()).toBe(0);
    expect(ports.llm.calls()).toBe(0);
    expect(ports.source.calls()).toBe(0);
  });
});

describe('OpenAPI document at /docs', () => {
  it("The document lists health, the error schema and a route's body schema", async () => {
    // Arrange
    ({ app } = await buildTestApp());

    // Act
    const response = await app.inject({ method: 'GET', url: '/docs/json' });

    // Assert
    expect(response.statusCode).toBe(200);
    const document = response.json();
    expect(document.openapi).toBe('3.0.3');
    expect(document.info.title).toBe('CODEMIND API');
    expect(document.info.version).toBe('1.0.0');
    expect(document.servers[0].url).toBe('http://localhost:3000');
    const paths = Object.keys(document.paths);
    expect(paths).toContain('/health');
    expect(paths).toContain('/api/test-only');
    expect(paths.filter((path) => path.startsWith('/docs'))).toEqual([]);
    const body = document.paths['/api/test-only'].post.requestBody.content['application/json'].schema;
    expect(body.properties.question).toMatchObject({ type: 'string', minLength: 5 });
    const error = document.components.schemas.Error;
    expect(Object.keys(error.properties.error.properties).sort()).toEqual(['code', 'details', 'message']);
  });

  it('The viewer is served as HTML', async () => {
    // Arrange
    ({ app } = await buildTestApp());

    // Act
    let response = await app.inject({ method: 'GET', url: '/docs' });
    if (response.statusCode >= 300 && response.statusCode < 400) {
      response = await app.inject({ method: 'GET', url: new URL(String(response.headers.location), 'http://localhost/docs').pathname });
    }

    // Assert
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toMatch(/^text\/html/);
  });
});

// Below the spec scenarios (added after the step 12 mutation run): /health documents its response.
describe('health in the OpenAPI document', () => {
  it('documents the 200 response of /health', async () => {
    // Arrange
    ({ app } = await buildTestApp());

    // Act
    const document = (await app.inject({ method: 'GET', url: '/docs/json' })).json();

    // Assert
    const schema = document.paths['/health'].get.responses['200'].content['application/json'].schema;
    expect(schema).toMatchObject({ type: 'object', properties: { status: { type: 'string', enum: ['ok'] } }, required: ['status'] });
  });
});
