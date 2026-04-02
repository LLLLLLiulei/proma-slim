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

  test('documents fallback when blockTypeHint is missing', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('If `blockTypeHint` is missing')
    expect(skill).toContain('catalogs` favor `nav`')
    expect(skill).toContain('contents` favor `content-list`')
  })

  test('includes contract examples for missing blockTypeHint and malformed payload', () => {
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(examples).toContain('## Missing blockTypeHint fallback')
    expect(examples).toContain('## Malformed payload example')
    expect(examples).toContain('"reasonCode": "malformed-payload"')
  })
})
