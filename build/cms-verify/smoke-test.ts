#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

interface Binding {
  projectId: string
  workspaceId: string
  primarySessionId: string
}

interface WorkspaceEntry {
  id: string
  slug: string
}

const repoRoot = resolve(import.meta.dir, '..', '..')
const defaultConfigDir = join(repoRoot, 'build', '.cms-verify-data')
const origin = trimTrailingSlash(process.env.CMS_VERIFY_ORIGIN || 'http://localhost:8088')
const basePath = normalizeBasePath(process.env.CMS_VERIFY_BASE_PATH || '/pagebuilder')
const secret = process.env.AI_PAGE_BUILDER_INTEGRATION_SECRET || 'cms-verify-secret'
const cmsCookie = process.env.CMS_VERIFY_COOKIE || 'CurrentSite=1; ZUSID=cms-verify'
const configDir = resolve(process.env.AI_PAGE_BUILDER_CMS_VERIFY_CONFIG_DIR || defaultConfigDir)
const externalRecordId = process.env.CMS_VERIFY_EXTERNAL_RECORD_ID || `cms-verify-${Date.now()}`
const internalCmsAssetUrl = process.env.CMS_VERIFY_INTERNAL_CMS_ASSET_URL
  || 'http://nginx:8080/manager/assets/banner.txt'

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '')
}

function normalizeBasePath(value: string): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '/') return ''
  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withLeadingSlash.replace(/\/+$/, '')
}

function url(pathname: string): string {
  const path = pathname.startsWith('/') ? pathname : `/${pathname}`
  return `${origin}${basePath}${path}`
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message)
  }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new Error(`Expected JSON response, got ${response.status}: ${text}`)
  }
}

async function requestJson<T>(input: string, init?: RequestInit): Promise<{ response: Response; body: T }> {
  const response = await fetch(input, init)
  const body = await readJson<T>(response)
  return { response, body }
}

function integrationHeaders(extra: HeadersInit = {}): Headers {
  const headers = new Headers(extra)
  headers.set('authorization', `Bearer ${secret}`)
  headers.set('x-cms-cookie', cmsCookie)
  return headers
}

async function createProject(): Promise<string> {
  const headers = integrationHeaders({ 'content-type': 'application/json' })
  const { response, body } = await requestJson<{ projectId: string }>(url('/api/integrations/cms/projects'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      externalRecordId,
      projectName: 'CMS Verify Docker Project',
      siteId: '1',
    }),
  })

  assert(response.status === 201 || response.status === 200, `create project failed: ${response.status}`)
  assert(body.projectId?.startsWith('pbp_'), `invalid projectId: ${body.projectId}`)
  return body.projectId
}

function readBinding(projectId: string): Binding {
  const bindingPath = join(configDir, 'integrations', 'cms', 'projects.json')
  assert(existsSync(bindingPath), `project binding file not found: ${bindingPath}`)
  const parsed = JSON.parse(readFileSync(bindingPath, 'utf-8')) as { projects?: Binding[] }
  const binding = parsed.projects?.find((entry) => entry.projectId === projectId)
  assert(binding, `project binding not found for ${projectId}`)
  assert(binding.workspaceId, 'binding missing workspaceId')
  assert(binding.primarySessionId, 'binding missing primarySessionId')
  return binding
}

function readWorkspaceSlug(workspaceId: string): string {
  const indexPath = join(configDir, 'agent-workspaces.json')
  assert(existsSync(indexPath), `workspace index not found: ${indexPath}`)
  const parsed = JSON.parse(readFileSync(indexPath, 'utf-8')) as { workspaces?: WorkspaceEntry[] }
  const workspace = parsed.workspaces?.find((entry) => entry.id === workspaceId)
  assert(workspace?.slug, `workspace slug not found for ${workspaceId}`)
  return workspace.slug
}

function writePreviewFixture(binding: Binding): void {
  const slug = readWorkspaceSlug(binding.workspaceId)
  const workspaceFilesDir = join(configDir, 'agent-workspaces', slug, 'workspace-files')
  const assetsDir = join(workspaceFilesDir, 'assets')
  mkdirSync(assetsDir, { recursive: true })
  writeFileSync(
    join(workspaceFilesDir, 'index.html'),
    `<!doctype html><html><head><title>CMS Verify Preview</title></head><body><h1>CMS Verify Preview</h1><img id="cms-asset" src="${basePath}/api/workspaces/${binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent(internalCmsAssetUrl)}"><script src="./assets/app.js"></script></body></html>`,
    'utf-8',
  )
  writeFileSync(join(assetsDir, 'app.js'), 'window.__cmsVerifyPreviewLoaded = true;', 'utf-8')
}

async function createHandoff(projectId: string, target: 'builder' | 'preview', openMode: 'iframe' | 'window') {
  const headers = integrationHeaders({ 'content-type': 'application/json' })
  const { response, body } = await requestJson<{
    openUrl: string
    target: string
    openMode: string
  }>(url(`/api/integrations/cms/projects/${encodeURIComponent(projectId)}/handoffs`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ target, openMode }),
  })

  assert(response.status === 200, `create ${target}/${openMode} handoff failed: ${response.status}`)
  assert(body.openUrl.startsWith(`${origin}${basePath}/api/integrations/cms/handoffs/`), `handoff openUrl is not base-path scoped: ${body.openUrl}`)
  assert(body.target === target, `handoff target mismatch: ${body.target}`)
  assert(body.openMode === openMode, `handoff openMode mismatch: ${body.openMode}`)
  return body.openUrl
}

async function consumeHandoff(openUrl: string, expectedLocationPrefix: string): Promise<{ location: string; cookie: string }> {
  const response = await fetch(openUrl, { redirect: 'manual' })
  assert(response.status === 302, `handoff open expected 302, got ${response.status}`)
  const location = response.headers.get('location') || ''
  const cookie = response.headers.get('set-cookie') || ''
  assert(location.startsWith(expectedLocationPrefix), `unexpected handoff location: ${location}`)
  assert(location.startsWith(basePath || '/'), `handoff location lost base path: ${location}`)
  assert(/(?:^|;\s*)ai_page_builder_access_[^=]+=/.test(cookie), 'handoff did not set workspace-scoped access cookie')
  assert(cookie.includes(`Path=${basePath || '/'}`), `access cookie Path mismatch: ${cookie}`)
  assert(!cookie.includes('Secure'), `HTTP verification cookie must not be Secure: ${cookie}`)
  return { location, cookie }
}

async function verifyBuilder(projectId: string, binding: Binding, openMode: 'iframe' | 'window') {
  const openUrl = await createHandoff(projectId, 'builder', openMode)
  const { location, cookie } = await consumeHandoff(
    openUrl,
    `${basePath}/builder/${binding.workspaceId}/${binding.primarySessionId}`,
  )
  const shell = await fetch(`${origin}${location}`, { headers: { cookie } })
  assert(shell.status === 200, `builder shell failed: ${shell.status}`)
  assert(shell.headers.get('content-security-policy') === "frame-ancestors 'self'", 'builder shell CSP mismatch')
  assert(shell.headers.get('x-frame-options') !== 'DENY', 'builder shell must not set X-Frame-Options DENY')
  const context = await fetch(url(`/api/integrations/cms/builder-context?workspaceId=${binding.workspaceId}&sessionId=${binding.primarySessionId}`), {
    headers: { cookie },
  })
  assert(context.status === 200, `builder context failed: ${context.status}`)
}

async function verifyPreview(projectId: string, binding: Binding, openMode: 'iframe' | 'window'): Promise<string> {
  const openUrl = await createHandoff(projectId, 'preview', openMode)
  const { location, cookie } = await consumeHandoff(
    openUrl,
    `${basePath}/api/workspaces/${binding.workspaceId}/preview/`,
  )
  const preview = await fetch(`${origin}${location}`, { headers: { cookie } })
  assert(preview.status === 200, `preview failed: ${preview.status}`)
  assert(preview.headers.get('content-security-policy') === "frame-ancestors 'self'", 'preview CSP mismatch')
  assert(preview.headers.get('x-frame-options') !== 'DENY', 'preview must not set X-Frame-Options DENY')
  const html = await preview.text()
  assert(html.includes('CMS Verify Preview'), 'preview fixture missing from HTML')
  assert(html.includes(`${basePath}/api/workspaces/${binding.workspaceId}/page-builder/cms/assets?url=`), 'workspace-scoped CMS asset proxy missing')

  const staticAsset = await fetch(url(`/api/workspaces/${binding.workspaceId}/preview/assets/app.js`), { headers: { cookie } })
  assert(staticAsset.status === 200, `preview static asset failed: ${staticAsset.status}`)

  const cmsAsset = await fetch(url(`/api/workspaces/${binding.workspaceId}/page-builder/cms/assets?url=${encodeURIComponent(internalCmsAssetUrl)}`), {
    headers: { cookie },
  })
  assert(cmsAsset.status === 200, `workspace-scoped CMS asset proxy failed: ${cmsAsset.status}`)
  assert(await cmsAsset.text() === 'cms-verify-asset', 'workspace-scoped CMS asset response mismatch')
  return cookie
}

async function verifyDirectUrlBypass(binding: Binding) {
  const context = await fetch(url(`/api/integrations/cms/builder-context?workspaceId=${binding.workspaceId}&sessionId=${binding.primarySessionId}`))
  assert(context.status === 401, `builder context without access cookie should be 401, got ${context.status}`)

  const messages = await fetch(url(`/api/sessions/${binding.primarySessionId}/messages`))
  assert(messages.status === 401, `session messages without access cookie should be 401, got ${messages.status}`)

  const preview = await fetch(url(`/api/workspaces/${binding.workspaceId}/preview/`))
  assert(preview.status === 401, `workspace preview without access cookie should be 401, got ${preview.status}`)
}

async function verifyExport(projectId: string) {
  const headers = integrationHeaders({ 'content-type': 'application/json' })
  const response = await fetch(url(`/api/integrations/cms/projects/${encodeURIComponent(projectId)}/export`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ downloadCmsRemoteAssets: false }),
  })
  if (response.status !== 200) {
    throw new Error(`sync export failed: ${response.status} ${await response.text()}`)
  }
  assert(response.headers.get('content-type')?.includes('application/zip'), `export content-type mismatch: ${response.headers.get('content-type')}`)
  const zipBytes = new Uint8Array(await response.arrayBuffer())
  const zipText = new TextDecoder('latin1').decode(zipBytes)
  assert(zipText.includes('index.html'), 'export ZIP missing index.html entry name')
}

async function waitForOrigin(): Promise<void> {
  const deadline = Date.now() + 60_000
  let lastError: unknown
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/cms-mock/`)
      if (response.ok) return
      lastError = new Error(`status ${response.status}`)
    } catch (error) {
      lastError = error
    }
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  throw new Error(`CMS verify origin not ready at ${origin}: ${lastError instanceof Error ? lastError.message : String(lastError)}`)
}

async function main() {
  mkdirSync(dirname(join(configDir, '.keep')), { recursive: true })
  await waitForOrigin()
  console.log(`[cms-verify] origin ready: ${origin}`)

  const projectId = await createProject()
  const binding = readBinding(projectId)
  console.log(`[cms-verify] project=${projectId} workspace=${binding.workspaceId} session=${binding.primarySessionId}`)

  writePreviewFixture(binding)
  console.log('[cms-verify] preview fixture written')

  await verifyBuilder(projectId, binding, 'iframe')
  await verifyBuilder(projectId, binding, 'window')
  console.log('[cms-verify] builder handoff verified for iframe/window')

  await verifyPreview(projectId, binding, 'iframe')
  await verifyPreview(projectId, binding, 'window')
  console.log('[cms-verify] preview handoff and workspace-scoped CMS asset proxy verified for iframe/window')

  await verifyDirectUrlBypass(binding)
  console.log('[cms-verify] direct URL bypass checks verified')

  await verifyExport(projectId)
  console.log('[cms-verify] sync export ZIP verified')

  console.log('[cms-verify] smoke test passed')
}

main().catch((error) => {
  console.error('[cms-verify] smoke test failed')
  console.error(error)
  process.exit(1)
})
