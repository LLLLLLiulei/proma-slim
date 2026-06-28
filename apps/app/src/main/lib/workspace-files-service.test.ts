import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAgentWorkspace } from './workspace-service'
import {
  listWorkspaceFiles,
  readWorkspaceFile,
  resolveWorkspaceFilePath,
  saveWorkspaceFile,
} from './workspace-files-service'
import { HttpError } from '../http/errors'

const originalConfigDir = process.env.PROMA_CONFIG_DIR
let testConfigDir = ''

beforeEach(() => {
  testConfigDir = mkdtempSync(join(tmpdir(), 'workspace-files-service-'))
  process.env.PROMA_CONFIG_DIR = testConfigDir
})

afterEach(() => {
  if (originalConfigDir === undefined) {
    delete process.env.PROMA_CONFIG_DIR
  } else {
    process.env.PROMA_CONFIG_DIR = originalConfigDir
  }
  rmSync(testConfigDir, { recursive: true, force: true })
  testConfigDir = ''
})

function createTestWorkspace(name: string) {
  return createAgentWorkspace(name, { template: 'page-builder' })
}

function workspaceFilesRoot(slug: string): string {
  return join(testConfigDir, 'agent-workspaces', slug, 'workspace-files')
}

function writeWorkspaceFile(slug: string, relativePath: string, content: string): void {
  const fullPath = join(workspaceFilesRoot(slug), relativePath)
  mkdirSync(dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, 'utf-8')
}

describe('workspace-files-service', () => {
  test('listWorkspaceFiles 递归返回文件树并跳过 .proma 派生目录', () => {
    const workspace = createTestWorkspace('Files List Tree')
    writeWorkspaceFile(workspace.slug, 'index.html', '<html></html>')
    writeWorkspaceFile(workspace.slug, 'assets/style.css', 'body {}')
    writeWorkspaceFile(workspace.slug, 'assets/scripts/app.js', 'console.log(1)')
    mkdirSync(join(workspaceFilesRoot(workspace.slug), '.proma'), { recursive: true })
    writeFileSync(join(workspaceFilesRoot(workspace.slug), '.proma', 'cms-rendering-manifest.json'), '{}', 'utf-8')

    const tree = listWorkspaceFiles(workspace)
    const paths = tree.entries.map((entry) => entry.path).sort()

    expect(paths).toEqual([
      'assets',
      'assets/scripts',
      'assets/scripts/app.js',
      'assets/style.css',
      'index.html',
    ])
    expect(paths).not.toContain('.proma/cms-rendering-manifest.json')
  })

  test('readWorkspaceFile 返回原始内容，不注入预览脚本或运行时转换', () => {
    const workspace = createTestWorkspace('Files Read Raw')
    writeWorkspaceFile(workspace.slug, 'index.html', '<!doctype html><html><body><h1>原始</h1></body></html>')

    const file = readWorkspaceFile(workspace, 'index.html')

    expect(file.content).toBe('<!doctype html><html><body><h1>原始</h1></body></html>')
    expect(file.version).toEqual(expect.any(String))
    expect(file.version.length).toBeGreaterThan(0)
    expect(file.content).not.toContain('preview-bridge')
  })

  test('readWorkspaceFile 文件不存在时抛 404', () => {
    const workspace = createTestWorkspace('Files Read Missing')

    expect(() => readWorkspaceFile(workspace, 'missing.html')).toThrow(HttpError)
  })

  test('readWorkspaceFile 二进制文件抛错且不返回文本', () => {
    const workspace = createTestWorkspace('Files Read Binary')
    writeFileSync(
      join(workspaceFilesRoot(workspace.slug), 'blob.bin'),
      Buffer.from([0x00, 0x01, 0x02, 0x00, 0x03]),
    )

    expect(() => readWorkspaceFile(workspace, 'blob.bin')).toThrow(/二进制/)
  })

  test('saveWorkspaceFile 直接保存 HTML 原文且不返回 validator 诊断', () => {
    const workspace = createTestWorkspace('Files Save HTML Verbatim')
    writeWorkspaceFile(workspace.slug, 'index.html', '<!doctype html><html><body><h1>旧</h1></body></html>')

    const html = '<!doctype html><html><body><cms-catalog data-proma-cms-source-id="runtime" level="root"></cms-catalog><script src="https://unpkg.com/vue@3/dist/vue.global.js"></script><h1>新</h1></body></html>'
    const result = saveWorkspaceFile(
      workspace,
      'index.html',
      html,
    )

    expect(result.changed).toBe(true)
    expect(result.manifestUpdated).toBe(true)
    expect('validation' in result).toBe(false)

    const reread = readWorkspaceFile(workspace, 'index.html')
    expect(reread.content).toBe(html)
  })

  test('saveWorkspaceFile 非 HTML 直接写盘且不更新 manifest', () => {
    const workspace = createTestWorkspace('Files Save CSS Direct')
    writeWorkspaceFile(workspace.slug, 'style.css', 'body { color: red; }')

    const result = saveWorkspaceFile(workspace, 'style.css', 'body { color: blue; }')

    expect(result.changed).toBe(true)
    expect(result.manifestUpdated).toBe(false)
    expect('validation' in result).toBe(false)

    expect(readWorkspaceFile(workspace, 'style.css').content).toBe('body { color: blue; }')
  })

  test('saveWorkspaceFile 内容未变化时标记 changed 为 false', () => {
    const workspace = createTestWorkspace('Files Save Noop')
    writeWorkspaceFile(workspace.slug, 'a.txt', 'hello')

    const result = saveWorkspaceFile(workspace, 'a.txt', 'hello')

    expect(result.changed).toBe(false)
  })

  test('saveWorkspaceFile 通过 baseVersion 防止覆盖外部更新', () => {
    const workspace = createTestWorkspace('Files Save Conflict')
    writeWorkspaceFile(workspace.slug, 'a.txt', 'hello')
    const original = readWorkspaceFile(workspace, 'a.txt')
    writeWorkspaceFile(workspace.slug, 'a.txt', 'agent changed')

    expect(() => saveWorkspaceFile(workspace, 'a.txt', 'user changed', {
      baseVersion: original.version,
    })).toThrow(HttpError)
    expect(readWorkspaceFile(workspace, 'a.txt').content).toBe('agent changed')
  })

  test('saveWorkspaceFile 文件不存在时抛 404', () => {
    const workspace = createTestWorkspace('Files Save Missing')

    expect(() => saveWorkspaceFile(workspace, 'missing.txt', 'x')).toThrow(HttpError)
  })

  test('resolveWorkspaceFilePath 拒绝任何路径穿越片段和派生元数据目录', () => {
    const workspace = createTestWorkspace('Files Traversal')

    expect(() => resolveWorkspaceFilePath(workspace, '../secret.txt')).toThrow(HttpError)
    expect(() => resolveWorkspaceFilePath(workspace, 'safe/../index.html')).toThrow(HttpError)
    expect(() => resolveWorkspaceFilePath(workspace, '.proma/cms-rendering-manifest.json')).toThrow(HttpError)
    expect(() => resolveWorkspaceFilePath(workspace, '')).toThrow(HttpError)
  })

  test('saveWorkspaceFile 通过路径穿越防护拒绝越界写入', () => {
    const workspace = createTestWorkspace('Files Save Traversal')

    expect(() => saveWorkspaceFile(workspace, '../escape.txt', 'x')).toThrow(HttpError)
  })

  test('saveWorkspaceFile 保存包含空格和中文的已有文件', () => {
    const workspace = createTestWorkspace('Files Save Unicode Path')
    writeWorkspaceFile(workspace.slug, 'assets/中文 file.css', 'body { color: red; }')

    const result = saveWorkspaceFile(workspace, 'assets/中文 file.css', 'body { color: green; }')

    expect(result.path).toBe('assets/中文 file.css')
    expect(readFileSync(join(workspaceFilesRoot(workspace.slug), 'assets/中文 file.css'), 'utf-8'))
      .toBe('body { color: green; }')
  })

  test('saveWorkspaceFile 不允许创建不存在的文件', () => {
    const workspace = createTestWorkspace('Files Save Existing Only')

    expect(() => saveWorkspaceFile(workspace, 'new-file.txt', 'x')).toThrow(HttpError)
    expect(existsSync(join(workspaceFilesRoot(workspace.slug), 'new-file.txt'))).toBe(false)
  })
})
