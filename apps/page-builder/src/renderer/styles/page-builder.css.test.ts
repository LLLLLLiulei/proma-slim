import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('./page-builder.css', import.meta.url), 'utf8')

describe('page-builder CMS content card density', () => {
  test('uses the medium-density compact spacing for CMS content cards', () => {
    expect(css).toContain('.page-builder-cms-content-list {\n  display: flex;\n  flex-direction: column;\n  gap: 0.5rem;\n}')
    expect(css).toContain('.page-builder-cms-content-card .ant-card-body {\n  padding: 0.625rem;\n}')
    expect(css).toContain('.page-builder-cms-content-card-body {\n  display: grid;\n  grid-template-columns: auto 88px minmax(0, 1fr);\n  gap: 0.5rem;\n  align-items: start;\n}')
    expect(css).toContain('.page-builder-cms-content-title.ant-typography {\n  margin-bottom: 0 !important;\n  font-size: 0.9rem;\n  line-height: 1.35;\n}')
    expect(css).toContain('.page-builder-cms-content-meta {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 0.375rem;\n  margin-top: 0.25rem;\n}')
    expect(css).toContain('.page-builder-cms-content-summary.ant-typography {\n  margin-top: 0.25rem;\n  margin-bottom: 0 !important;\n  color: hsl(var(--muted-foreground));\n  font-size: 0.8125rem;\n  line-height: 1.4;\n}')
  })
})
