import { afterEach, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

async function importPreviewBridgeModule() {
  const url = new URL(`./page-builder-preview-bridge.ts?test=${Date.now()}-${Math.random()}`, import.meta.url)
  return import(url.href)
}

afterEach(() => {
  delete process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH
})

test('page-builder preview bridge reads the latest script content and asset version without restarting', async () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'proma-preview-bridge-'))
  const bridgePath = join(tempDir, 'page-builder-preview-bridge.js')

  try {
    writeFileSync(bridgePath, 'console.info("bridge-version-a")', 'utf-8')
    process.env.PROMA_PAGE_BUILDER_PREVIEW_BRIDGE_PATH = bridgePath

    const module = await importPreviewBridgeModule()

    const firstScript = module.readPageBuilderPreviewBridgeScript()
    const firstAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    writeFileSync(bridgePath, 'console.info("bridge-version-b")', 'utf-8')

    const secondScript = module.readPageBuilderPreviewBridgeScript()
    const secondAssetUrl = module.getPageBuilderPreviewBridgeAssetUrl()

    expect(firstScript).toContain('bridge-version-a')
    expect(firstScript).not.toContain('bridge-version-b')
    expect(secondScript).toContain('bridge-version-b')
    expect(secondScript).not.toContain('bridge-version-a')
    expect(secondAssetUrl).not.toBe(firstAssetUrl)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('page-builder preview bridge bundled script includes selected rect syncing behavior', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain("type: 'selected'")
  expect(script).toContain('rect,')
  expect(script).toContain('const postSelectedRect = () => {')
  expect(script).toContain('clearAll(true)')
})

test('page-builder preview bridge filters mutation observer events triggered by its own overlays', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const isBridgeOverlayNode = (node) => {')
  expect(script).toContain('const shouldSyncFromMutations = (mutations) => {')
  expect(script).toContain('if (!shouldSyncFromMutations(mutations)) {')
})

test('page-builder preview bridge uses dashed hover borders and solid selected borders', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain("? '2px solid rgba(37, 99, 235, 0.92)'")
  expect(script).toContain(": '2px dashed rgba(59, 130, 246, 0.65)'")
})

test('page-builder preview bridge bundled script includes inline text editing save protocol hooks', async () => {
  const module = await importPreviewBridgeModule()

  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain("'DIV'")
  expect(script).toContain("type: 'inline-text-save-request'")
  expect(script).toContain("inline-text-save-result")
  expect(script).toContain('contenteditable')
  expect(script).toContain('const resolveEditableTextTargetDescriptor = (root, element) => {')
  expect(script).toContain('function handleInlineTextBlur(event) {')
})

test('page-builder preview bridge bundled script includes nested child selection retargeting before inline editing', async () => {
  const module = await importPreviewBridgeModule()
  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const shouldRetargetSelection = (target) => {')
  expect(script).toContain('if (shouldRetargetSelection(target)) {')
})

test('page-builder preview bridge bundled script includes replace-image capability discovery in selected payloads', async () => {
  const module = await importPreviewBridgeModule()
  const script = module.readPageBuilderPreviewBridgeScript()

  expect(script).toContain('const resolveReplaceImageCapability = (element) => {')
  expect(script).toContain('replaceImage')
  expect(script).toContain('targetDescriptor')
  expect(script).toContain("querySelectorAll('img')")
})
