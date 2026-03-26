import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { WorkspaceMcpConfig } from '@proma/shared'
import { getWorkspaceMcpPath } from './config-paths'
import { initializePageBuilderWorkspace } from './page-builder-workspace-bootstrap'

describe('page-builder workspace bootstrap', () => {
  let configDir: string
  let templatesDir: string
  let originalTemplatesDir: string | undefined

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-bootstrap-config-'))
    templatesDir = mkdtempSync(join(tmpdir(), 'proma-page-builder-bootstrap-templates-'))
    originalTemplatesDir = process.env.PROMA_WORKSPACE_TEMPLATES_DIR
    process.env.PROMA_CONFIG_DIR = configDir
    process.env.PROMA_WORKSPACE_TEMPLATES_DIR = templatesDir

    mkdirSync(templatesDir, { recursive: true })
    writeFileSync(join(templatesDir, 'page-builder-workspace-claude.md'), '# Builder Template\n', 'utf-8')
    writeFileSync(join(templatesDir, 'page-builder-workspace-mcp.json'), JSON.stringify({
      servers: {
        playwright: {
          type: 'stdio',
          command: 'bunx',
          args: ['playwright-template'],
          enabled: true,
          timeout: 31,
        },
        'server-sequential-thinking': {
          type: 'stdio',
          command: 'bunx',
          args: ['sequential-template'],
          enabled: true,
          timeout: 67,
        },
      },
    }, null, 2), 'utf-8')
  })

  afterEach(() => {
    delete process.env.PROMA_CONFIG_DIR
    if (originalTemplatesDir === undefined) {
      delete process.env.PROMA_WORKSPACE_TEMPLATES_DIR
    } else {
      process.env.PROMA_WORKSPACE_TEMPLATES_DIR = originalTemplatesDir
    }
    rmSync(configDir, { recursive: true, force: true })
    rmSync(templatesDir, { recursive: true, force: true })
  })

  test('fills missing default MCP servers without overwriting existing same-name config', () => {
    const workspaceSlug = 'builder-merge'
    const mcpPath = getWorkspaceMcpPath(workspaceSlug)

    mkdirSync(join(configDir, 'agent-workspaces', workspaceSlug), { recursive: true })
    writeFileSync(mcpPath, JSON.stringify({
      servers: {
        playwright: {
          type: 'stdio',
          command: 'node',
          args: ['custom-playwright.js'],
          enabled: true,
          timeout: 99,
        },
        custom: {
          type: 'http',
          url: 'https://example.com/custom',
          enabled: true,
        },
      },
    }, null, 2), 'utf-8')

    initializePageBuilderWorkspace(workspaceSlug)

    const config = JSON.parse(readFileSync(mcpPath, 'utf-8')) as WorkspaceMcpConfig

    expect(config.servers.playwright).toEqual({
      type: 'stdio',
      command: 'node',
      args: ['custom-playwright.js'],
      enabled: true,
      timeout: 99,
    })
    expect(config.servers.custom).toEqual({
      type: 'http',
      url: 'https://example.com/custom',
      enabled: true,
    })
    expect(config.servers['server-sequential-thinking']).toEqual({
      type: 'stdio',
      command: 'bunx',
      args: ['sequential-template'],
      enabled: true,
      timeout: 67,
    })
  })
})
