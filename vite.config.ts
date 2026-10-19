// vite.config.ts
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import mdx from '@mdx-js/rollup'
import tailwindcss from '@tailwindcss/vite'

const packageJsonPath = path.resolve(__dirname, 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, __dirname, '');
  const productionBuild = env.VERCEL_ENV === 'production'
    || (command === 'build' && mode !== 'catalog-staging' && env.VERCEL_ENV !== 'preview');
  if (productionBuild) {
    if (env.VITE_CATALOG_MOCK?.trim().toLowerCase() === 'true' || env.VITE_CATALOG_ENVIRONMENT?.trim().toLowerCase() === 'staging') {
      throw new Error('Production builds require the real production catalog configuration.');
    }
    const rawApiBase = env.VITE_URLBASE || 'https://unicocontato.tech';
    let apiBase: URL;
    let apiPath: string;
    try { apiBase = new URL(rawApiBase); apiPath = decodeURIComponent(apiBase.pathname); }
    catch { throw new Error('Production builds require a valid HTTPS VITE_URLBASE.'); }
    const hostname = apiBase.hostname.replace(/^\[|\]$|\.$/g, '');
    if (rawApiBase !== rawApiBase.trim() || apiBase.protocol !== 'https:' || apiBase.username || apiBase.password || apiBase.search || apiBase.hash
      || /(^|\.)localhost$|^127\.|^0\.0\.0\.0$|^::(?:1)?$|^::(?:ffff:)?7f[\da-f]{2}:/i.test(hostname)
      || /staging/i.test(`${hostname}${apiPath}`)) {
      throw new Error('Production builds cannot point VITE_URLBASE at a local or staging API.');
    }
  }
  const aiServicesProxyTarget = (
    env.VITE_AI_SERVICES_PROXY_TARGET || 'http://localhost:3100'
  ).replace(/\/+$/, '');

  return {
    define: {
      __APP_VERSION__: JSON.stringify(packageJson.version),
    },
    plugins: [
      { enforce: 'pre', ...mdx() },
      react({
        include: /\.(mdx|js|jsx|ts|tsx)$/,
      }),
      tailwindcss(),
    ],
    server: {
      proxy: {
        '/ai-services': {
          target: aiServicesProxyTarget,
          changeOrigin: true,
          secure: aiServicesProxyTarget.startsWith('https://'),
          rewrite: (requestPath) => requestPath.replace(/^\/ai-services/, ''),
        },
      },
      fs: {
        allow: [
          path.resolve(__dirname, 'src'),
          path.resolve(__dirname, 'src/templates'),
          path.resolve(__dirname),
        ],
      },
    },
  };
});
