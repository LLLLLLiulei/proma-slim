import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRelativeText(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('page-builder-guided-generation skill docs', () => {
  test('documents AskUserQuestion-driven guided generation for normal users', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-guided-generation/SKILL.md')

    expect(skill).toContain('AskUserQuestion')
    expect(skill).toContain('普通用户')
    expect(skill).toContain('一次只问一个')
    expect(skill).toContain('单页专题页')
    expect(skill).toContain('保留必要的专业词汇')
    expect(skill).toContain('Hero')
    expect(skill).toContain('CTA')
    expect(skill).toContain('响应式')
    expect(skill).toContain('必问项')
    expect(skill).toContain('条件必问项')
    expect(skill).toContain('强制确认项')
    expect(skill).toContain('Do not hand off user-facing briefing or confirmation to `brainstorming`')
    expect(skill).toContain('draft placeholders or pending labels')
  })

  test('documents downstream design skill orchestration', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-guided-generation/SKILL.md')

    expect(skill).toContain('design-taste-frontend')
    expect(skill).toContain('redesign-existing-projects')
    expect(skill).toContain('overwrite confirmation')
  })

  test('keeps threshold and confirmation rules in references', () => {
    const references = readRelativeText('../../../default-skills/page-builder-guided-generation/references/briefing-thresholds.md')

    expect(references).toContain('必问项')
    expect(references).toContain('条件必问项')
    expect(references).toContain('进入最终确认的条件')
    expect(references).toContain('最终确认')
    expect(references).toContain('你帮我决定')
  })

  test('keeps the root template at the routing layer instead of repeating skill internals', () => {
    const enTemplate = readRelativeText('../../../resources/templates/page-builder-workspace-claude.md')

    expect(enTemplate).toContain('page-builder-guided-generation')
    expect(enTemplate).toContain('cms-binding-apply')
    expect(enTemplate).toContain('AskUserQuestion')
    expect(enTemplate).toContain('current workspace')
    expect(enTemplate).not.toContain('must ask / conditional ask / mandatory confirmation')
    expect(enTemplate).not.toContain('redesign-existing-projects')
    expect(enTemplate).not.toContain('slot inner content only')
    expect(enTemplate).not.toContain('source.pageSize')
    expect(enTemplate).not.toContain('Proma')
  })

  test('documents ordinary-flow CMS boundaries for existing regions', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-guided-generation/SKILL.md')

    expect(skill).toContain('must go through the controlled CMS browser selection flow')
    expect(skill).toContain('it must not silently change query props such as `site-id`, `catalog-id`, `ids`, or `page-size`')
    expect(skill).toContain('treat the existing `cms-catalog` / `cms-content` source tag as source-atomic')
    expect(skill).toContain('not the rendered child nodes one by one')
    expect(skill).toContain('do not cross into sibling blocks or sibling CMS tags')
    expect(skill).toContain('do not guess link aliases such as `item.link` or `item.url`')
    expect(skill).toContain('do not handwrite or preserve runtime-only locator attrs')
  })
})
