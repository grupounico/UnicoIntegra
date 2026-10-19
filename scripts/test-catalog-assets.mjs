import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { createServer } from 'vite';

test('catalog image uploads and recovery in demo mode', async (context) => {
  const directory = await mkdtemp(join(tmpdir(), 'catalog-assets-'));
  const memory = new Map();
  const previousStorage = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (key) => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
  };
  const server = await createServer({
    configFile: false,
    envFile: false,
    cacheDir: join(directory, 'vite'),
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true, include: [], entries: [] },
    server: { middlewareMode: true, watch: null },
    appType: 'custom',
    define: { 'import.meta.env.VITE_CATALOG_MOCK': JSON.stringify('true') },
  });
  try {
    const service = await server.ssrLoadModule('/src/services/catalogDeployment.service.ts');
    assert.equal(service.CATALOG_DEMO_MODE, true);
    const payload = {
      requestedBy: 'QA',
      flowMode: 'full',
      group: { cnpj: '11222333000181', nome: 'QA images', username: 'qa-images' },
      units: [{ codigo: 'MATRIZ', nome: 'QA images', cnpj: '11222333000181', erpId: 2, orderWebhookUrl: 'https://example.invalid/orders' }],
    };
    const file = new File(['image fixture'], 'sample.png', { type: 'image/png' });
    let draft;
    let uploaded;
    let original;

    await context.test('creates all eight desktop/mobile image slots', async () => {
      draft = await service.createDeployment(payload);
      assert.equal(service.CATALOG_ASSET_DEFINITIONS.length, 8);
      assert.equal(draft.assets.length, 8);
      assert.equal(draft.assets.every((asset) => asset.status === 'pending'), true);
    });

    await context.test('confirms concurrent uploads without losing other images', async () => {
      await Promise.all(service.CATALOG_ASSET_DEFINITIONS.map(({ type }) => service.uploadDeploymentAsset(draft.id, type, file)));
      uploaded = await service.getDeployment(draft.id);
      assert.equal(uploaded.assets.filter((asset) => asset.status === 'confirmed').length, 8);
      assert.equal(new Set(uploaded.assets.map((asset) => asset.type)).size, 8);
      assert.equal(uploaded.assets.every((asset) => asset.mimeType === file.type && asset.sizeBytes === file.size && /^[a-f0-9]{64}$/.test(asset.checksumSha256)), true);
      original = uploaded.assets.find((asset) => asset.type === 'banner_1');
    });

    await context.test('recovers a saved five-image draft while preserving uploaded metadata', async () => {
      const legacy = { ...uploaded, assets: uploaded.assets.filter((asset) => !asset.type.startsWith('banner_mobile_')) };
      memory.set('unico-catalog-deployments-v2', JSON.stringify([legacy]));
      const restored = await service.getDeployment(legacy.id);
      assert.equal(restored.assets.length, 8);
      assert.deepEqual(restored.assets.find((asset) => asset.type === 'banner_1'), original);
      assert.equal(restored.assets.filter((asset) => asset.type.startsWith('banner_mobile_') && asset.status === 'pending').length, 3);
    });

    await context.test('retries and replaces a mobile image without duplicating slots', async () => {
      await service.uploadDeploymentAsset(draft.id, 'banner_mobile_1', file);
      const replacement = new File(['replacement fixture'], 'replacement.png', { type: 'image/png' });
      const replaced = await service.uploadDeploymentAsset(draft.id, 'banner_mobile_1', replacement);
      assert.equal(replaced.assets.length, 8);
      assert.equal(replaced.assets.filter((asset) => asset.type === 'banner_mobile_1').length, 1);
      assert.equal(replaced.assets.find((asset) => asset.type === 'banner_mobile_1').status, 'confirmed');
      assert.equal(replaced.assets.find((asset) => asset.type === 'banner_mobile_1').sizeBytes, replacement.size);
      assert.deepEqual(replaced.assets.find((asset) => asset.type === 'banner_1'), original);
    });

    await context.test('keeps catalog-only deployments without image slots', async () => {
      const hubOnly = await service.createDeployment({ ...payload, flowMode: 'hub_banco_only' });
      assert.equal(hubOnly.assets.length, 0);
      await assert.rejects(() => service.uploadDeploymentAsset(hubOnly.id, 'banner_1', file), /não utiliza imagens/);
      assert.equal((await service.getDeployment(hubOnly.id)).assets.length, 0);
    });
  } finally {
    await server.close();
    await rm(directory, { recursive: true, force: true });
    if (previousStorage === undefined) delete globalThis.localStorage;
    else globalThis.localStorage = previousStorage;
  }
});
