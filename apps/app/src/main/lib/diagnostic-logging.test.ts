import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  DEFAULT_DIAGNOSTIC_LOG_LEVEL,
  DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES,
  DEFAULT_DIAGNOSTIC_RETENTION,
  buildStructuredRequestPayload,
  closeDiagnosticLoggers,
  createRequestTraceContext,
  createSseConnectionTraceContext,
  createTurnTraceContext,
  flushDiagnosticLoggers,
  getDiagnosticBackendLogger,
  getHttpAccessLogger,
  resolveDiagnosticLoggingRuntime,
} from './diagnostic-logging'
import { updateSettings } from './settings-service'

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

describe('diagnostic logging runtime', () => {
  let configDir: string

  beforeEach(() => {
    configDir = mkdtempSync(join(tmpdir(), 'proma-diagnostic-logging-'))
    process.env.PROMA_CONFIG_DIR = configDir
  })

  afterEach(async () => {
    await closeDiagnosticLoggers()
    delete process.env.PROMA_CONFIG_DIR
    rmSync(configDir, { recursive: true, force: true })
  })

  test('uses trace logging, 10MB rotation, and dedicated backend / preview / turns folders by default', () => {
    const runtime = resolveDiagnosticLoggingRuntime()

    expect(runtime.level).toBe(DEFAULT_DIAGNOSTIC_LOG_LEVEL)
    expect(runtime.maxFileSizeBytes).toBe(DEFAULT_DIAGNOSTIC_MAX_FILE_SIZE_BYTES)
    expect(runtime.retention).toEqual(DEFAULT_DIAGNOSTIC_RETENTION)
    expect(runtime.backendLogFilePath).toBe(join(configDir, 'logs', 'backend', 'backend'))
    expect(runtime.previewAccessLogFilePath).toBe(join(configDir, 'logs', 'access-preview', 'access-preview'))
    expect(runtime.turnsDir).toBe(join(configDir, 'logs', 'turns'))
    expect(existsSync(join(configDir, 'logs', 'backend'))).toBe(true)
    expect(existsSync(join(configDir, 'logs', 'access-preview'))).toBe(true)
    expect(existsSync(runtime.turnsDir)).toBe(true)
  })

  test('writes backend and preview access logs into separate rolling files', async () => {
    getDiagnosticBackendLogger({
      component: 'diagnostic_logging_test',
      category: 'turn_trace',
    }).info({
      phase: 'backend_test',
    }, 'backend test entry')

    getHttpAccessLogger('/api/page-builder/preview-bridge.js').info({
      phase: 'request_complete',
      path: '/api/page-builder/preview-bridge.js',
      status: 200,
    }, 'preview access entry')

    await waitForLogFlush()

    const backendLog = readTextLog(join(configDir, 'logs', 'backend'))
    const previewLog = readTextLog(join(configDir, 'logs', 'access-preview'))

    expect(backendLog).toContain('phase=backend_test')
    expect(backendLog).toContain('INFO diagnostic_logging_test turn_trace')
    expect(previewLog).toContain('path=/api/page-builder/preview-bridge.js')
    expect(previewLog).toContain('accessChannel=preview')
    expect(previewLog).toContain('说明="HTTP 请求已完成"')
  })

  test('rotates backend logs when the configured max file size is exceeded', async () => {
    updateSettings({
      diagnosticLogging: {
        level: 'trace',
        maxFileSizeBytes: 256,
        retention: {
          maxArchiveFiles: 5,
          maxTurnDirectories: DEFAULT_DIAGNOSTIC_RETENTION.maxTurnDirectories,
          maxAgeDays: DEFAULT_DIAGNOSTIC_RETENTION.maxAgeDays,
        },
      },
    })
    await closeDiagnosticLoggers()

    const logger = getDiagnosticBackendLogger({
      component: 'rotation_test',
      category: 'turn_trace',
    })

    for (let index = 0; index < 12; index += 1) {
      logger.info({
        phase: 'rotation_test',
        chunk: 'x'.repeat(180),
        index,
      }, `rotation entry ${index}`)
    }

    await waitForLogFlush()

    const rolledFiles = readdirSync(join(configDir, 'logs', 'backend'))
      .filter((entry) => entry.endsWith('.log'))

    expect(rolledFiles.length).toBeGreaterThan(1)
  })

  test('archives the previous active backend log file on restart and starts a fresh active file', async () => {
    const backendLogsDir = join(configDir, 'logs', 'backend')

    getDiagnosticBackendLogger({
      component: 'restart_rotation_test',
      category: 'turn_trace',
    }).info({
      phase: 'first_run',
    }, 'first backend run entry')

    await waitForLogFlush()
    await closeDiagnosticLoggers()

    getDiagnosticBackendLogger({
      component: 'restart_rotation_test',
      category: 'turn_trace',
    }).info({
      phase: 'second_run',
    }, 'second backend run entry')

    await waitForLogFlush()

    const rolledFiles = readdirSync(backendLogsDir)
      .filter((entry) => entry.endsWith('.log'))
      .sort()
    const activeFileName = 'backend.current.log'
    const archiveFiles = rolledFiles.filter((entry) => entry !== activeFileName)

    expect(rolledFiles).toContain(activeFileName)
    expect(archiveFiles.length).toBe(1)
    expect(archiveFiles[0]).toMatch(/^backend\.\d{8}-\d{6}-\d{3}(?:-\d+)?\.log$/)

    const archivedContent = readFileSync(join(backendLogsDir, archiveFiles[0]!), 'utf-8')
    const activeContent = readFileSync(join(backendLogsDir, activeFileName), 'utf-8')

    expect(archivedContent).toContain('first backend run entry')
    expect(archivedContent).not.toContain('second backend run entry')
    expect(activeContent).toContain('second backend run entry')
    expect(activeContent).not.toContain('first backend run entry')
  })

  test('archives the previous active preview access log file on restart and starts a fresh active file', async () => {
    const previewLogsDir = join(configDir, 'logs', 'access-preview')

    getHttpAccessLogger('/api/page-builder/preview-bridge.js').info({
      phase: 'request_complete',
      path: '/api/page-builder/preview-bridge.js',
      status: 200,
    }, 'first preview access entry')

    await waitForLogFlush()
    await closeDiagnosticLoggers()

    getHttpAccessLogger('/api/page-builder/preview-bridge.js').info({
      phase: 'request_complete',
      path: '/api/page-builder/preview-bridge.js',
      status: 204,
    }, 'second preview access entry')

    await waitForLogFlush()

    const rolledFiles = readdirSync(previewLogsDir)
      .filter((entry) => entry.endsWith('.log'))
      .sort()
    const activeFileName = 'access-preview.current.log'
    const archiveFiles = rolledFiles.filter((entry) => entry !== activeFileName)

    expect(rolledFiles).toContain(activeFileName)
    expect(archiveFiles.length).toBe(1)
    expect(archiveFiles[0]).toMatch(/^access-preview\.\d{8}-\d{6}-\d{3}(?:-\d+)?\.log$/)

    const archivedContent = readFileSync(join(previewLogsDir, archiveFiles[0]!), 'utf-8')
    const activeContent = readFileSync(join(previewLogsDir, activeFileName), 'utf-8')

    expect(archivedContent).toContain('first preview access entry')
    expect(archivedContent).not.toContain('second preview access entry')
    expect(activeContent).toContain('second preview access entry')
    expect(activeContent).not.toContain('first preview access entry')
  })

  test('keeps only the configured number of backend archive files after repeated rotations', async () => {
    updateSettings({
      diagnosticLogging: {
        level: 'trace',
        maxFileSizeBytes: 256,
        retention: {
          maxArchiveFiles: 2,
          maxTurnDirectories: DEFAULT_DIAGNOSTIC_RETENTION.maxTurnDirectories,
          maxAgeDays: DEFAULT_DIAGNOSTIC_RETENTION.maxAgeDays,
        },
      },
    })
    await closeDiagnosticLoggers()

    const backendLogsDir = join(configDir, 'logs', 'backend')
    const logger = getDiagnosticBackendLogger({
      component: 'archive_retention_test',
      category: 'turn_trace',
    })

    for (let index = 0; index < 16; index += 1) {
      logger.info({
        phase: 'archive_retention_test',
        chunk: 'x'.repeat(180),
        index,
      }, `archive retention entry ${index}`)
    }

    await waitForLogFlush()

    const rolledFiles = readdirSync(backendLogsDir)
      .filter((entry) => entry.endsWith('.log'))
      .sort()
    const archiveFiles = rolledFiles.filter((entry) => entry !== 'backend.current.log')

    expect(rolledFiles).toContain('backend.current.log')
    expect(archiveFiles.length).toBeLessThanOrEqual(2)
  })

  test('formats main log entries as single-line summaries with Chinese descriptions', async () => {
    getHttpAccessLogger('/api/status').info({
      phase: 'request_complete',
      method: 'GET',
      path: '/api/status',
      status: 200,
      requestId: 'request-1',
    }, 'HTTP API request completed')

    await waitForLogFlush()

    const activeContent = readFileSync(join(configDir, 'logs', 'backend', 'backend.current.log'), 'utf-8').trim()
    const lines = activeContent.split('\n')

    expect(lines.length).toBe(1)
    expect(lines[0]).toContain('说明=')
    expect(lines[0]).toContain('HTTP 请求已完成')
    expect(lines[0]).toContain('message=')
    expect(lines[0]).toContain('phase=request_complete')
    expect(lines[0]).toContain('path=/api/status')
  })
})

describe('diagnostic trace context', () => {
  test('links request, turn, and sse connection ids together', () => {
    const requestTrace = createRequestTraceContext({
      method: 'POST',
      path: '/api/sessions/session-1/send',
    })
    const turnTrace = createTurnTraceContext({
      requestId: requestTrace.requestId,
      sessionId: 'session-1',
      workspaceId: 'workspace-1',
    })
    const sseTrace = createSseConnectionTraceContext({
      requestId: requestTrace.requestId,
      sessionId: 'session-1',
      turnId: turnTrace.turnId,
    })

    expect(requestTrace.requestId).toBeTruthy()
    expect(turnTrace.requestId).toBe(requestTrace.requestId)
    expect(turnTrace.sessionId).toBe('session-1')
    expect(turnTrace.workspaceId).toBe('workspace-1')
    expect(turnTrace.turnId).toBeTruthy()
    expect(sseTrace.requestId).toBe(requestTrace.requestId)
    expect(sseTrace.turnId).toBe(turnTrace.turnId)
    expect(sseTrace.sessionId).toBe('session-1')
    expect(sseTrace.sseConnectionId).toBeTruthy()
  })
})

describe('structured diagnostic request payloads', () => {
  test('keeps parsed body fields and file metadata without embedding binary data', () => {
    const payload = buildStructuredRequestPayload({
      contentType: 'multipart/form-data; boundary=abc123',
      body: {
        userMessage: '请根据附件修改页面',
        workspaceId: 'workspace-1',
      },
      files: [{
        fieldName: 'attachments',
        filename: 'reference.png',
        mediaType: 'image/png',
        size: 128,
        localPath: 'attachments/reference.png',
      }],
    })

    expect(payload).toEqual({
      contentType: 'multipart/form-data; boundary=abc123',
      body: {
        userMessage: '请根据附件修改页面',
        workspaceId: 'workspace-1',
      },
      files: [{
        fieldName: 'attachments',
        filename: 'reference.png',
        mediaType: 'image/png',
        size: 128,
        localPath: 'attachments/reference.png',
      }],
    })
  })
})
