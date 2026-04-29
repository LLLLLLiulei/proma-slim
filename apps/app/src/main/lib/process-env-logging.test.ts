import { describe, expect, mock, test } from 'bun:test'
import { logCurrentProcessEnvironment } from './process-env-logging'

describe('process env logging', () => {
  test('prints every environment variable without masking values', () => {
    const logger = mock((_message: string) => {})

    logCurrentProcessEnvironment({
      ANTHROPIC_API_KEY: 'sk-raw-value',
      ANTHROPIC_BASE_URL: 'https://api.example.com/anthropic',
      PROMA_CMS_PASSWORD: 'plain-password',
    }, logger)

    expect(logger.mock.calls).toEqual([
      ['[HTTP] 当前环境变量开始'],
      ['[HTTP] ANTHROPIC_API_KEY=sk-raw-value'],
      ['[HTTP] ANTHROPIC_BASE_URL=https://api.example.com/anthropic'],
      ['[HTTP] PROMA_CMS_PASSWORD=plain-password'],
      ['[HTTP] 当前环境变量结束'],
    ])
  })
})
