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

  test('documents that ready decisions must create a decision before the formal apply tool', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('`ready`')
    expect(skill).toContain('`mcp__cms__decide_cms_binding`')
    expect(skill).toContain('`decisionId`')
    expect(skill).toContain('`mcp__cms__apply_cms_binding`')
    expect(skill).not.toContain('update the preview source files directly')
  })

  test('routes readers through layered references before component authoring details', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('Read [references/contract-examples.md](references/contract-examples.md) first')
    expect(skill).toContain('If `selection.selectionKind = catalogs` or `authoringContext.component = cms-catalog`')
    expect(skill).toContain('If `selection.selectionKind = contents` or `authoringContext.component = cms-content`')
    expect(skill).toContain('[references/cms-catalog-authoring.md](references/cms-catalog-authoring.md)')
    expect(skill).toContain('[references/cms-content-authoring.md](references/cms-content-authoring.md)')
    expect(skill).toContain('[references/shared-authoring-rules.md](references/shared-authoring-rules.md)')
    expect(skill).toContain('host-side handoff and write-pipeline notes only')
  })

  test('keeps contract examples as a lightweight decision entry instead of a mixed authoring handbook', () => {
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(examples).toContain('Keep this file lightweight')
    expect(examples).toContain('`authoringContext` and `targetSnapshot`')
    expect(examples).toContain('## Routing')
    expect(examples).toContain('## Catalog decision example')
    expect(examples).toContain('## Content decision example')
    expect(examples).toContain('## Clarification example')
    expect(examples).toContain('## Missing blockTypeHint fallback')
    expect(examples).toContain('## Incompatible example')
    expect(examples).toContain('## Malformed payload example')
    expect(examples).toMatch(/"selection":\s*\{\s*"version": 6,/)
    expect(examples).not.toContain('"version": 5')
    expect(examples).toContain('"sourceType": "contents-by-ids"')
    expect(examples).toContain('"reasonCode": "malformed-payload"')
    expect(examples).toContain('"scope": "target-selection-only"')
    expect(examples).not.toContain('## Recommended authoring shape')
    expect(examples).not.toContain('## Event binding guardrails')
    expect(examples).not.toContain('## Item field semantics to respect')
    expect(examples).not.toContain('## Anti-pattern: self-managed Vue runtime or page-wide mount')
  })

  test('keeps catalog-nav canonical examples aligned on targetBlockKind nav across docs and typecheck fixtures', () => {
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')
    const typecheck = readRelativeText('../../../../../packages/shared/src/types/page-builder-cms-apply.contract-typecheck.ts')

    expect(examples).toContain('"toolKind": "catalog-nav"')
    expect(examples).toContain('"targetBlockKind": "nav"')
    expect(typecheck).toContain("toolKind: 'catalog-nav'")
    expect(typecheck).toContain("targetBlockKind: 'nav'")
  })

  test('moves shared slot, html-first, and anti-pattern guidance into shared authoring rules', () => {
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')

    expect(shared).toContain('Prefer slot inner content directly')
    expect(shared).toContain('single outer `<template v-slot:...>` or `<template #...>` wrapper is tolerated')
    expect(shared).toContain('major HTML containers inside the slot')
    expect(shared).toContain('`{ items, loading, error, empty }`')
    expect(shared).toContain('Do not nest a second `cms-catalog` / `cms-content` inside CMS slot content')
    expect(shared).toContain('Keep page-builder authoring HTML-first')
    expect(shared).toContain('host-managed source tags')
    expect(shared).toContain('Do not author Vue runtime/importmap/bootstrap assets')
    expect(shared).toContain('Do not write raw HTML inline event attributes')
    expect(shared).toContain('## Apply payload boundary')
    expect(shared).toContain('in-place replacement of the selected target')
    expect(shared).toContain('Do not append a sibling `cms-catalog` / `cms-content`')
    expect(shared).toContain('## Anti-pattern: nested CMS islands')
    expect(shared).toContain('## Anti-pattern: self-managed Vue runtime or page-wide mount')
  })

  test('keeps the main skill focused on the decision path and leaves layered details in references', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('## Input Preconditions')
    expect(skill).toContain('## Decision Algorithm')
    expect(skill).toContain('## Ready Checklist')
    expect(skill).toContain('## Clarification Boundary')
    expect(skill).not.toContain('## Recipe: nav')
    expect(skill).not.toContain('## Recipe: content list')
    expect(shared).toContain('## Shared slot contract')
    expect(downstream).toContain('host-side handoff and write-pipeline notes')
  })

  test('documents canonical authoring contract fields without guessed aliases', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const catalog = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-catalog-authoring.md')
    const content = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-content-authoring.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('authoring contract')
    expect(skill).toContain('`authoringContext.itemFieldMeta`')
    expect(catalog).toContain('`item.path`')
    expect(content).toContain('`item.publishUrl`')
    expect(content).toContain('`item.listLogoUrl`')
    expect(catalog).not.toContain('`item.link`')
    expect(content).not.toContain('`item.url`')
    expect(downstream).toContain('canonical authoring contract')
  })

  test('documents canonical cms field usage without exposing upstream source priority', () => {
    const catalog = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-catalog-authoring.md')
    const content = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-content-authoring.md')
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')

    expect(catalog).toContain('`item.path`: catalog navigation URL; use `:href="item.path"` for catalog links')
    expect(catalog).toContain('`item.logoUrl`: optional catalog image URL; guard before rendering')
    expect(content).toContain('`item.publishUrl`: content detail URL; use `:href="item.publishUrl"` for content links')
    expect(content).toContain('`item.listLogoUrl`: optional content list image URL; guard before rendering')
    expect(shared).toContain('Prefer declarative `<a :href>` links')
    expect(shared).toContain('target="_blank"')
    expect(shared).toContain('rel="noopener noreferrer"')
    expect(catalog).not.toContain('normalized from CMS')
    expect(catalog).not.toContain('`listLink`')
    expect(catalog).not.toContain('`logoFile`')
    expect(content).not.toContain('normalized from CMS')
    expect(content).not.toContain('`logoFile`')
    expect(shared).not.toContain('`item.logoFile`')
  })

  test('documents optional field guards and stable v-for keys in the component references', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const catalog = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-catalog-authoring.md')
    const content = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-content-authoring.md')

    expect(skill).toContain('use a stable `:key`, normally `:key="item.id"`')
    expect(skill).toContain('When a field is marked optional in `itemFieldMeta`, guard it before rendering image, URL, or metadata UI')
    expect(catalog).toContain(':key="item.id"')
    expect(content).toContain('<img v-if="item.listLogoUrl"')
  })

  test('documents explicit siteId requirements and controlled CMS creation boundaries', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('`selection.siteId` is missing or blank')
    expect(skill).toContain('Do not guess `siteId = 1`')
    expect(shared).toContain('Only the confirmed CMS browser selection flow may create a new `cms-catalog` / `cms-content`')
    expect(downstream).toContain('Only a `ready` outcome with an explicit `selection.siteId` and a returned `decisionId` may proceed')
    expect(downstream).toContain('`catalog-list`')
  })

  test('documents that browser pagination must not become a default pageSize binding', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')

    expect(skill).toContain('Do not infer `source.pageSize` from the CMS browser pagination state')
    expect(skill).toContain('omit `source.pageSize` unless the user explicitly requested a count')
    expect(skill).toContain('For `contents-by-ids`, never pass `source.pageSize`')
    expect(skill).toContain('For `catalog-nav`, never pass `source.pageSize`; use `source.take` instead')
  })

  test('documents authoritative source precedence for contents-by-catalog and does not treat zero-content catalogs as malformed', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const content = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-content-authoring.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('authoritative source context')
    expect(skill).toContain('Do not treat `selection.snapshot.catalog.total` as authoritative content availability')
    expect(skill).toContain('A zero-result contents probe is still a valid `contents-by-catalog` source')
    expect(content).toContain('current empty state does not invalidate the binding source')
    expect(downstream).toContain('authoritative source context')
  })

  test('documents structure-only compatibility and forbids semantic content-fit gating', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')
    const examples = readRelativeText('../../../default-skills/cms-binding-apply/references/contract-examples.md')

    expect(skill).toContain('Judge compatibility by structure, supported fields, and runtime boundaries only')
    expect(skill).toContain('Do not judge whether the selected content topic, industry, tone, or literal copy matches the current module')
    expect(skill).toContain('Do not return `needs-clarification` or `incompatible` only because the current placeholder copy and the selected CMS content talk about different subjects')
    expect(shared).toContain('content-topic mismatch alone is not a structural incompatibility')
    expect(examples).toContain('## Structure-first compatibility example')
    expect(examples).toContain('A topic mismatch alone does not require `needs-clarification` or `incompatible`')
    expect(examples).toContain('"status": "ready"')
  })

  test('documents in-place replacement and preserving the selected target shell during cms apply', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')

    expect(skill).toContain('Inspect the current target block in the workspace source')
    expect(skill).toContain('Preserve the existing outer shell, classes, and major layout structure')
    expect(shared).toContain('## Preserve the current target shell when compatible')
    expect(shared).toContain('<a class="hero-card"')
    expect(shared).toContain('## Anti-pattern: append a new CMS block beside the selected target')
  })

  test('documents html-first cms apply boundaries and rejects self-managed Vue runtime patterns', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const shared = readRelativeText('../../../default-skills/cms-binding-apply/references/shared-authoring-rules.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('Keep page-builder authoring HTML-first')
    expect(skill).toContain('host-managed source tags')
    expect(skill).toContain('Do not author Vue runtime/importmap/bootstrap assets')
    expect(skill).toContain('Do not propose self-managed Vue runtime or page-wide Vue mount')
    expect(skill).toContain('Do not add `v-*`, `@*`, `:` bindings, or `{{ ... }}` to surrounding non-CMS shell HTML')
    expect(shared).toContain('app.mount(document.body)')
    expect(downstream).toContain('keep page-builder authoring HTML-first')
    expect(downstream).toContain('reject author-managed Vue runtime/importmap/bootstrap')
  })

  test('documents the decision-backed downstream chain and no-decision-no-write boundary', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('Call `mcp__cms__decide_cms_binding` in the same turn with the current `handoffId`')
    expect(skill).toContain('Pass only `decisionId`, `templateBody`, `emptyTemplate`, and `errorTemplate`')
    expect(skill).toContain('single outer `<template v-slot:...>` or `<template #...>` wrapper is tolerated and will be unwrapped automatically')
    expect(downstream).toContain('must first materialize a persisted decision through `mcp__cms__decide_cms_binding`')
    expect(downstream).toContain('`mcp__cms__apply_cms_binding` must now consume `decisionId` plus template fields only')
    expect(downstream).toContain('fail closed on missing, stale, conflicting, replayed, or non-unique decisions')
  })

  test('documents object-shaped decide payloads and forbids bypassing the decision chain after failure', () => {
    const skill = readRelativeText('../../../default-skills/cms-binding-apply/SKILL.md')
    const downstream = readRelativeText('../../../default-skills/cms-binding-apply/references/downstream-integration.md')

    expect(skill).toContain('Pass `decision` as a nested object')
    expect(skill).toContain('Do not JSON-stringify `decision`')
    expect(skill).toContain('If `mcp__cms__decide_cms_binding` fails')
    expect(skill).toContain('Do not edit `workspace-files/index.html`')
    expect(downstream).toContain('If the caller sends `decision` as a JSON string')
    expect(downstream).toContain('retry with an object-shaped `decision` payload')
  })

  test('keeps cms-catalog guidance limited to catalog props, source modes, fields, and recipes', () => {
    const catalog = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-catalog-authoring.md')

    expect(catalog).toContain('## When to use `cms-catalog`')
    expect(catalog).toContain('`catalogs-by-parent`')
    expect(catalog).toContain('`catalogs-by-ids`')
    expect(catalog).toContain('`site-id`')
    expect(catalog).toContain('`level`')
    expect(catalog).toContain('`parent-id`')
    expect(catalog).toContain('`take`')
    expect(catalog).toContain('`item.path`')
    expect(catalog).toContain('`item.logoUrl`')
    expect(catalog).toContain('`item.children`')
    expect(catalog).toContain('Only set `take` when the user explicitly requested a catalog count')
    expect(catalog).toContain('## Recipe: nav')
    expect(catalog).toContain('## Recipe: catalog-list')
    expect(catalog).not.toContain('take="3"')
    expect(catalog).not.toContain('`item.publishUrl`')
    expect(catalog).not.toContain('`item.listLogoUrl`')
    expect(catalog).not.toContain('`contents-by-catalog`')
  })

  test('keeps cms-content guidance limited to content props, source modes, fields, and recipes', () => {
    const content = readRelativeText('../../../default-skills/cms-binding-apply/references/cms-content-authoring.md')

    expect(content).toContain('## When to use `cms-content`')
    expect(content).toContain('`contents-by-catalog`')
    expect(content).toContain('`contents-by-ids`')
    expect(content).toContain('`catalog-id`')
    expect(content).toContain('`page-size`')
    expect(content).toContain('`item.publishUrl`')
    expect(content).toContain('`item.listLogoUrl`')
    expect(content).toContain('`item.addedAt`')
    expect(content).toContain('## Recipe: content-list')
    expect(content).toContain('## Recipe: featured card')
    expect(content).not.toContain('page-size="6"')
    expect(content).not.toContain('`item.path`')
    expect(content).not.toContain('`item.children`')
    expect(content).not.toContain('`catalogs-by-parent`')
  })
})
