import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { closeDiagnosticLoggers, flushDiagnosticLoggers } from './diagnostic-logging'

function readBackendLog(configDir: string): string {
  const logsDir = join(configDir, 'logs', 'backend')
  return readdirSync(logsDir)
    .filter((entry) => entry.endsWith('.log'))
    .sort()
    .map((entry) => readFileSync(join(logsDir, entry), 'utf-8'))
    .join('\n')
}

describe('cms upstream diagnostics', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-cms-upstream-diagnostics-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(async () => {
    await closeDiagnosticLoggers()
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('writes raw cms headers, request body, and response body without redaction', async () => {
    const {
      logCmsUpstreamRequestStart,
      logCmsUpstreamResponse,
    } = await import('./cms-upstream-diagnostics')
    const requestHeaders = {
      Authorization: 'Bearer raw-cms-token',
      Cookie: 'JSESSIONID=raw-cookie',
      'Content-Type': 'application/json',
    }
    const requestBody = JSON.stringify({
      username: 'cms-user',
      password: 'cms-password',
    })
    const response = new Response(JSON.stringify({
      status: 0,
      message: 'login failed',
      access_token: 'raw-access-token',
    }), {
      status: 401,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'CMSSESSION=raw-response-cookie',
      },
    })

    logCmsUpstreamRequestStart({
      operation: 'token_refresh',
      method: 'POST',
      url: 'https://cms.example.com/manager/api/token',
      requestHeaders,
      requestBody,
      startedAt: Date.now(),
    })
    logCmsUpstreamResponse({
      operation: 'token_refresh',
      method: 'POST',
      url: 'https://cms.example.com/manager/api/token',
      requestHeaders,
      requestBody,
      startedAt: Date.now(),
      response,
      responseBody: await response.text(),
    })

    await flushDiagnosticLoggers()

    const backendLog = readBackendLog(configDir)
    expect(backendLog).toContain('raw-cms-token')
    expect(backendLog).toContain('JSESSIONID=raw-cookie')
    expect(backendLog).toContain('cms-user')
    expect(backendLog).toContain('cms-password')
    expect(backendLog).toContain('raw-access-token')
    expect(backendLog).toContain('CMSSESSION=raw-response-cookie')
    expect(backendLog).not.toContain('[REDACTED]')
  })
})
