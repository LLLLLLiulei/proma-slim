import { defineConfig, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { normalizePageBuilderPublicBasePath } from '../../packages/shared/src/utils/page-builder-public-path'
import pkg from './package.json' with { type: 'json' }

export const pageBuilderViteBase = './'
const pageBuilderDevApiTarget = 'http://127.0.0.1:3000'

export function createPageBuilderDevProxy(basePath = process.env.AI_PAGE_BUILDER_BASE_PATH): Record<string, ProxyOptions> {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(basePath)
  const proxy: Record<string, ProxyOptions> = {
    '/api': {
      target: pageBuilderDevApiTarget,
      changeOrigin: true,
    },
  }

  if (normalizedBasePath) {
    proxy[`${normalizedBasePath}/api`] = {
      target: pageBuilderDevApiTarget,
      changeOrigin: true,
      rewrite: (pathname) => pathname.slice(normalizedBasePath.length),
    }
  }

  return proxy
}

export default defineConfig({
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  root: resolve(__dirname, 'src/renderer'),
  base: pageBuilderViteBase,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../app/src/renderer'),
      '@page-builder': resolve(__dirname, 'src/renderer'),
    },
  },
  server: {
    port: 5174,
    strictPort: true,
    open: false,
    proxy: createPageBuilderDevProxy(),
  },
})
