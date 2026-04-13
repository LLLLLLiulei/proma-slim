import { expect, test } from 'bun:test'

test('server-safe root entry can be imported without browser globals', async () => {
  const module = await import(new URL(`./index.ts?test=${Date.now()}-${Math.random()}`, import.meta.url).href)

  expect(typeof module.createBrowserCmsClient).toBe('function')
  expect(typeof module.detectCmsRenderingUsage).toBe('function')
  expect('CMS_RENDERING_READY_EVENT' in module).toBe(false)
})
