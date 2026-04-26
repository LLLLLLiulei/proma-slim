import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRelativeText(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('page-builder cms region authoring guidance skill docs', () => {
  test('keeps the main skill lightweight and focused on ordinary existing-region routing', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-cms-region-authoring-guidance/SKILL.md')

    expect(skill).toContain('existing `cms-catalog` / `cms-content` region')
    expect(skill).toContain('This skill is consult-only guidance')
    expect(skill).toContain('not the ordinary turn owner')
    expect(skill).toContain('Read in this order')
    expect(skill).toContain('<page_builder_turn_routing>')
    expect(skill).toContain('<page_builder_selection>')
    expect(skill).toContain('<page_builder_cms_guidance_notice>')
    expect(skill).toContain('<page_builder_cms_region_authoring>')
    expect(skill).toContain('It does not take over user-facing briefing')
    expect(skill).toContain('Do not invent new `cms-*` tags')
    expect(skill).toContain('authoring source, not the final preview/export runtime response')
    expect(skill).toContain('Do not infer a missing runtime')
    expect(skill).toContain('escalate to the confirmed CMS flow')
    expect(skill).not.toContain('decisionId')
    expect(skill).not.toContain('mcp__cms__apply_cms_binding')
  })

  test('splits ordinary cms-region references into shared, catalog, and content guidance', () => {
    const shared = readRelativeText('../../../default-skills/page-builder-cms-region-authoring-guidance/references/shared-boundaries.md')
    const catalog = readRelativeText('../../../default-skills/page-builder-cms-region-authoring-guidance/references/cms-catalog-existing-region.md')
    const content = readRelativeText('../../../default-skills/page-builder-cms-region-authoring-guidance/references/cms-content-existing-region.md')

    expect(shared).toContain('Keep Vue syntax inside the current CMS source tag only')
    expect(shared).toContain('Do not write or preserve runtime-only attrs')
    expect(shared).toContain('preview/export runtime is host-managed')
    expect(shared).toContain('absence of page-wide Vue bootstrap code in `workspace-files/index.html`')
    expect(catalog).toContain('Use `item.path` for catalog links')
    expect(catalog).toContain('Do not guess aliases such as `item.url` or `item.link`')
    expect(content).toContain('Use `item.publishUrl` for links')
    expect(content).toContain('Guard `item.listLogoUrl` before rendering an image')
  })
})
