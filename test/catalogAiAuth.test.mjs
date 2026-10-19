import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';

test('AI creation requires and forwards the current Integra session', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-ai-auth-'));
  const originalFetch = globalThis.fetch;
  const originalDocument = globalThis.document;
  const calls = [];
  const server = await createServer({
    configFile: false,
    envFile: false,
    cacheDir: join(directory, 'vite'),
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    define: {
      'import.meta.env.VITE_CATALOG_MOCK': JSON.stringify('false'),
      'import.meta.env.VITE_URLBASE': JSON.stringify('https://api.example.invalid'),
    },
  });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ status: 'creating' }), { status: 202 });
  };
  try {
    const service = await server.ssrLoadModule('/src/services/catalogDeployment.service.ts');
    assert.equal(service.CATALOG_DEMO_MODE, false);
    const input = { modality: 'venda', name: 'Test assistant', signatureName: 'Test store' };

    await context.test('sends the login token in the Authorization header', async () => {
      globalThis.document = { cookie: 'authToken=test-session-token; authUsername=operator; authPassword=test-session-password; username=Test%20Operator' };
      const result = await service.createDeploymentAi('deployment-test', 'unit-test', input, 'Test Operator');
      assert.equal(result.status, 'creating');
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://api.example.invalid/api/v1/deployments/deployment-test/units/unit-test/ai');
      assert.equal(calls[0].options.method, 'POST');
      assert.equal(calls[0].options.headers.Authorization, 'Bearer test-session-token');
      assert.deepEqual(JSON.parse(calls[0].options.body), { ...input, requestedBy: 'Test Operator' });
      assert.equal(calls[0].options.body.includes('test-session-token'), false);
      assert.equal(calls[0].options.body.includes('test-session-password'), false);
    });

    await context.test('rejects a missing session before sending any request', async () => {
      globalThis.document = { cookie: '' };
      await assert.rejects(() => service.createDeploymentAi('deployment-test', 'unit-test', input, 'Test Operator'), /Sessao expirada.*login novamente/);
      assert.equal(calls.length, 1);
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalDocument === undefined) delete globalThis.document;
    else globalThis.document = originalDocument;
    await server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
