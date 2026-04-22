import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createAgentSession } from '../lib/agent-session-manager'
import { createAgentWorkspace } from '../lib/workspace-service'
import { closeDiagnosticLoggers, flushDiagnosticLoggers } from '../lib/diagnostic-logging'
import { createHttpApp } from './app'

function createApp() {
  return createHttpApp({
    distDir: process.cwd(),
    isDev: true,
  })
}

async function waitForLogFlush(): Promise<void> {
  await flushDiagnosticLoggers()
  await new Promise((resolve) => setTimeout(resolve, 100))
}

function readTextLog(logsDir: string): string {
  return readdirSync(logsDir)
    .filter((entry) => entry.endsWith('.log'))
    .sort()
    .map((entry) => readFileSync(join(logsDir, entry), 'utf-8'))
    .join('\n')
}

describe('diagnostic access logging', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-access-logs-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(async () => {
    await closeDiagnosticLoggers()
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('splits preview access logs away from the main backend access log', async () => {
    const app = createApp()

    const statusResponse = await app.fetch(new Request('http://localhost/api/status'))
    expect(statusResponse.status).toBe(200)
    await statusResponse.json()
    const statusRequestId = statusResponse.headers.get('x-request-id')
    expect(statusRequestId).toBeTruthy()

    const previewResponse = await app.fetch(new Request('http://localhost/api/page-builder/preview-bridge.js'))
    expect(previewResponse.status).toBe(200)
    await previewResponse.text()

    await waitForLogFlush()

    const backendLog = readTextLog(join(configDir, 'logs', 'backend'))
    const previewLog = readTextLog(join(configDir, 'logs', 'access-preview'))

    expect(backendLog).toContain('phase=request_complete')
    expect(backendLog).toContain('path=/api/status')
    expect(backendLog).toContain(`requestId=${statusRequestId}`)
    expect(backendLog).toContain('message="HTTP API 请求已完成"')
    expect(previewLog).toContain('phase=request_complete')
    expect(previewLog).toContain('path=/api/page-builder/preview-bridge.js')
    expect(previewLog).toContain('accessChannel=preview')
    expect(previewLog).toContain('说明="HTTP 请求已完成"')
  })

  test('skips access logging for high-frequency preview-state polling', async () => {
    const app = createApp()
    const workspace = createAgentWorkspace('Preview State Workspace', { template: 'page-builder' })

    const statusResponse = await app.fetch(new Request('http://localhost/api/status'))
    expect(statusResponse.status).toBe(200)
    await statusResponse.json()

    const previewStateResponse = await app.fetch(new Request(`http://localhost/api/workspaces/${workspace.id}/preview-state`))
    expect(previewStateResponse.status).toBe(200)
    await previewStateResponse.json()

    await waitForLogFlush()

    const backendLog = readTextLog(join(configDir, 'logs', 'backend'))
    const previewLog = readTextLog(join(configDir, 'logs', 'access-preview'))

    expect(backendLog).toContain('path=/api/status')
    expect(backendLog).not.toContain(`path=/api/workspaces/${workspace.id}/preview-state`)
    expect(previewLog).not.toContain(`path=/api/workspaces/${workspace.id}/preview-state`)
  })

  test('propagates requestId and turnId into send-path error logs', async () => {
    const app = createApp()
    const session = createAgentSession('Diagnostic Send Session')

    const response = await app.fetch(new Request(`http://localhost/api/sessions/${session.id}/send`, {
      method: 'POST',
      body: JSON.stringify({ userMessage: '   ' }),
      headers: {
        'content-type': 'application/json',
      },
    }))

    expect(response.status).toBe(400)
    const requestId = response.headers.get('x-request-id')
    expect(requestId).toBeTruthy()

    await waitForLogFlush()

    const backendLog = readTextLog(join(configDir, 'logs', 'backend'))

    expect(backendLog).toContain(`requestId=${requestId}`)
    expect(backendLog).toContain(`path=/api/sessions/${session.id}/send`)
    expect(backendLog).toContain(`sessionId=${session.id}`)
    expect(backendLog).toContain('phase=route_error')
    expect(backendLog).toContain('phase=request_complete')
    expect(backendLog).toMatch(/turnId=[0-9a-f-]{36}/)
  })
})
