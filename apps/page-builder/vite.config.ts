import { defineConfig, type Plugin, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { normalizePageBuilderPublicBasePath } from '../../packages/shared/src/utils/page-builder-public-path'
import pkg from './package.json' with { type: 'json' }

export const pageBuilderViteBase = './'
const pageBuilderDevApiTarget = 'http://127.0.0.1:3000'

const requireFromViteConfig = createRequire(import.meta.url)
const monacoAssetsOutputDirectory = 'monaco/vs'
const monacoAssetsRouteSuffix = '/monaco/vs'

function getPageBuilderMonacoMinVsDirectory(): string {
  return dirname(requireFromViteConfig.resolve('monaco-editor/min/vs/loader.js'))
}

function listFilesRecursively(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry)
    return statSync(filePath).isDirectory() ? listFilesRecursively(filePath) : [filePath]
  })
}

function toMonacoAssetRoutePrefix(publicBasePath?: string | null): string {
  const normalizedBasePath = normalizePageBuilderPublicBasePath(publicBasePath)
  return `${normalizedBasePath}${monacoAssetsRouteSuffix}`.replace(/^\/\//, '/')
}

function stripMonacoAssetRoutePrefix(pathname: string, publicBasePath?: string | null): string | null {
  const prefixes = new Set([
    monacoAssetsRouteSuffix,
    toMonacoAssetRoutePrefix(publicBasePath),
  ])

  for (const prefix of prefixes) {
    if (pathname === prefix) {
      return ''
    }
    if (pathname.startsWith(`${prefix}/`)) {
      return pathname.slice(prefix.length + 1)
    }
  }

  return null
}

function isSafeMonacoAssetPath(rootDirectory: string, filePath: string): boolean {
  const normalizedRoot = resolve(rootDirectory)
  const normalizedFile = resolve(filePath)
  return normalizedFile === normalizedRoot || normalizedFile.startsWith(`${normalizedRoot}${sep}`)
}

function contentTypeForMonacoAsset(filePath: string): string {
  if (filePath.endsWith('.js')) return 'application/javascript;charset=utf-8'
  if (filePath.endsWith('.css')) return 'text/css;charset=utf-8'
  if (filePath.endsWith('.html')) return 'text/html;charset=utf-8'
  if (filePath.endsWith('.json') || filePath.endsWith('.map')) return 'application/json;charset=utf-8'
  if (filePath.endsWith('.ttf')) return 'font/ttf'
  return 'application/octet-stream'
}

export function createPageBuilderMonacoAssetsPlugin(): Plugin {
  return {
    name: 'page-builder-monaco-amd-assets',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const requestUrl = new URL(request.url ?? '/', 'http://localhost')
        const relativeAssetPath = stripMonacoAssetRoutePrefix(
          decodeURIComponent(requestUrl.pathname),
          process.env.AI_PAGE_BUILDER_BASE_PATH,
        )

        if (relativeAssetPath === null) {
          next()
          return
        }

        const monacoAssetsDirectory = getPageBuilderMonacoMinVsDirectory()
        const filePath = resolve(monacoAssetsDirectory, relativeAssetPath)

        if (!isSafeMonacoAssetPath(monacoAssetsDirectory, filePath) || !existsSync(filePath) || !statSync(filePath).isFile()) {
          next()
          return
        }

        response.statusCode = 200
        response.setHeader('content-type', contentTypeForMonacoAsset(filePath))
        response.end(readFileSync(filePath))
      })
    },
    generateBundle() {
      const monacoAssetsDirectory = getPageBuilderMonacoMinVsDirectory()

      for (const filePath of listFilesRecursively(monacoAssetsDirectory)) {
        const fileName = relative(monacoAssetsDirectory, filePath).split(sep).join('/')
        this.emitFile({
          type: 'asset',
          fileName: `${monacoAssetsOutputDirectory}/${fileName}`,
          source: readFileSync(filePath),
        })
      }
    },
  }
}

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
  plugins: [createPageBuilderMonacoAssetsPlugin(), react()],
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
