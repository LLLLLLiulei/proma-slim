import { describe, expect, test } from 'bun:test'
import { DEFAULT_MOCK_CMS_DELAY_MIN_MS, createMockServerCmsClient } from './server-cms-client'

describe('createMockServerCmsClient', () => {
  test('applies artificial delay to requests by default', async () => {
    const client = createMockServerCmsClient({
      delay: {
        random: () => 0,
      },
    })

    const startedAt = Date.now()
    await client.listCatalogs({ level: 'root' })
    const elapsedMs = Date.now() - startedAt

    expect(elapsedMs).toBeGreaterThanOrEqual(DEFAULT_MOCK_CMS_DELAY_MIN_MS - 20)
    expect(elapsedMs).toBeLessThan(DEFAULT_MOCK_CMS_DELAY_MIN_MS + 200)
  })
})
