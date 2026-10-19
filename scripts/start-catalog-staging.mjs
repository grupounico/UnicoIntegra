import { spawn } from 'node:child_process';

const backend = 'http://127.0.0.1:4199';
try {
  const response = await fetch(`${backend}/health/catalog-local`, { signal: AbortSignal.timeout(5000) });
  const health = await response.json();
  if (!response.ok || health.environment !== 'staging' || health.mode !== 'real' || health.productionPromotionEnabled !== false) throw new Error();
} catch {
  console.error('Inicie primeiro o backend isolado: npm run catalog:local:staging em unicoIntegra_backend.');
  process.exit(1);
}

const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4173', '--strictPort', '--mode', 'catalog-staging'], {
  stdio: 'inherit',
  env: { ...process.env, VITE_CATALOG_MOCK: 'false', VITE_URLBASE: backend, VITE_CATALOG_ENVIRONMENT: 'staging' },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => server.kill(signal));
server.once('exit', (code) => { process.exitCode = code ?? 1; });
