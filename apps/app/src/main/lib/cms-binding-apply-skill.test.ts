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
    expect(skill).toContain('`catalog-list`')
    expect(skill).toContain('one short structured question')
    expect(skill).toContain('contents` favor `content-list`')
  })

  test('documents that ready decisions should call the formal apply tool', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('`ready`')
    expect(skill).toContain('`mcp__cms__apply_cms_binding`')
    expect(skill).not.toContain('update the preview source files directly')
  })

  test('includes contract examples for catalog-list, missing blockTypeHint, malformed payload, and short clarification', () => {
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(examples).toContain('## Catalogs to catalog-list')
    expect(examples).toContain('## Fixed contents to content-list')
    expect(examples).toContain('## Missing blockTypeHint fallback')
    expect(examples).toContain('## Clarification example')
    expect(examples).toContain('## Malformed payload example')
    expect(examples).toContain('"sourceType": "contents-by-ids"')
    expect(examples).toContain('"reasonCode": "malformed-payload"')
    expect(examples).toContain('"scope": "target-selection-only"')
    expect(examples).toContain('"targetSelection"')
    expect(examples).not.toContain('Fixed content selection is incompatible')
  })

  test('documents slot-first cms structure guidance and anti-pattern examples', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(skill).toContain('`cms-catalog` / `cms-content` as the source root')
    expect(skill).toContain('major HTML containers inside the slot')
    expect(skill).toContain('slot inner content only')
    expect(skill).toContain('`{ items, loading, error, empty }`')
    expect(examples).toContain('## Recommended authoring shape')
    expect(examples).toContain('## Recommended apply tool payload shape')
    expect(examples).toContain('## Anti-pattern: major container outside the CMS slot')
    expect(examples).toContain('## Anti-pattern: outer slot wrapper inside templateBody')
    expect(examples).toContain('<cms-catalog')
    expect(examples).toContain('<ul class="nav-list">')
    expect(examples).not.toContain('item.link || item.url || item.path')
    expect(examples).not.toContain('items[0]?.link || items[0]?.url')
    expect(examples).toContain(':href="item.path"')
    expect(examples).toContain(':href="items[0]?.publishUrl')
    expect(examples).toContain('itemFieldMeta')
  })

  test('documents the canonical authoring contract fields instead of guessed aliases', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('authoring contract')
    expect(skill).toContain('`authoringContext.itemFieldMeta`')
    expect(skill).toContain('`item.path`')
    expect(skill).toContain('`item.publishUrl`')
    expect(skill).toContain('`item.listLogoUrl`')
    expect(skill).not.toContain('`item.link`')
    expect(skill).not.toContain('`item.url`')
    expect(examples).toContain('`site-id`')
    expect(examples).toContain('`catalog-id`')
    expect(examples).toContain('optional image field, guard before rendering')
    expect(downstream).toContain('canonical authoring contract')
  })

  test('documents optional field guards and stable v-for keys for cms templates', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(skill).toContain('When using `v-for`, always provide a stable `:key`')
    expect(skill).toContain('If `itemFieldMeta` marks a field as optional, guard it before rendering')
    expect(examples).toContain('<img v-if="items[0]?.listLogoUrl"')
    expect(examples).toContain(':key="item.id"')
  })

  test('documents explicit siteId requirements and controlled CMS creation boundaries', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('`selection.siteId` is missing or blank')
    expect(skill).toContain('Do not guess `siteId = 1`')
    expect(skill).toContain('Only the confirmed CMS browser selection flow may create a new `cms-catalog` / `cms-content`')
    expect(examples).toContain('"siteId": "14"')
    expect(examples).toContain('site-id="14"')
    expect(examples).toContain('## Controlled creation boundary')
    expect(downstream).toContain('only `ready` with an explicit `selection.siteId` may proceed')
    expect(downstream).toContain('`catalog-list`')
  })

  test('documents that browser pagination must not become a default pageSize binding', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('Do not infer `source.pageSize` from the CMS browser pagination state')
    expect(skill).toContain('omit `source.pageSize` unless the user explicitly requested a count')
    expect(skill).toContain('For `contents-by-ids`, never pass `source.pageSize`')
    expect(skill).toContain('For `catalog-nav`, never pass `source.pageSize`; use `source.take` instead')
  })

  test('documents in-place replacement and preserving the selected target shell during cms apply', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(skill).toContain('inspect the current target block in the workspace source')
    expect(skill).toContain('preserve the existing outer shell, classes, and major layout structure')
    expect(skill).toContain('in-place replacement of the selected target')
    expect(skill).toContain('Do not append a sibling `cms-catalog` / `cms-content`')
    expect(skill).toContain('If preserving the current structure is not safely compatible')
    expect(examples).toContain('## Recommended: preserve the current target shell when compatible')
    expect(examples).toContain('## Anti-pattern: append a new CMS block beside the selected target')
    expect(examples).toContain('<a class="hero-card"')
  })
})
