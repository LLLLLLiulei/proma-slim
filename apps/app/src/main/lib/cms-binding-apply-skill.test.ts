import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRelativeText(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('cms-binding-apply skill contract docs', () => {
  test('defines malformed payload as an incompatible reason', () => {
    const contract = readRelativeText('../../../../../packages/shared/src/types/page-builder-cms-apply.ts')

    expect(contract).toContain("'malformed-payload'")
  })

  test('aligns mapping kinds to catalog-driven runtime bindings instead of fixed content ids', () => {
    const contract = readRelativeText('../../../../../packages/shared/src/types/page-builder-cms-apply.ts')

    expect(contract).toContain("'catalog-nav'")
    expect(contract).toContain("'catalog-content-list'")
    expect(contract).not.toContain("'fixed-contents-list'")
  })

  test('documents fallback when blockTypeHint is missing', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('If `blockTypeHint` is missing')
    expect(skill).toContain('`targetSelection`')
    expect(skill).toContain('catalogs` favor `nav`')
    expect(skill).toContain('contents` favor `content-list`')
  })

  test('documents that ready decisions should call the formal apply tool', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('`ready`')
    expect(skill).toContain('`mcp__cms__apply_cms_binding`')
    expect(skill).not.toContain('update the preview source files directly')
  })

  test('includes contract examples for missing blockTypeHint, malformed payload, and fixed-content incompatibility', () => {
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(examples).toContain('## Missing blockTypeHint fallback')
    expect(examples).toContain('## Malformed payload example')
    expect(examples).toContain('fixed content')
    expect(examples).toContain('"reasonCode": "malformed-payload"')
    expect(examples).toContain('"scope": "target-selection-only"')
    expect(examples).toContain('"targetSelection"')
  })
})
