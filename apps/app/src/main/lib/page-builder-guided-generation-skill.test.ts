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
    expect(skill).toContain('<page_builder_turn_routing>')
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
    expect(skill).toContain('Keep this confirmation summary short and user-facing')
    expect(skill).toContain('Do not narrate internal routing')
  })

  test('documents downstream design skill orchestration', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-guided-generation/SKILL.md')
    const tasteSkill = readRelativeText('../../../default-skills/taste-skill/SKILL.md')
    const redesignSkill = readRelativeText('../../../default-skills/redesign-skill/SKILL.md')

    expect(skill).toContain('taste-skill')
    expect(skill).toContain('redesign-skill')
    expect(skill).toContain('first-pass major visual redesign')
    expect(skill).toContain('second-stage polish, upgrade, or refinement pass')
    expect(tasteSkill).toContain('name: taste-skill')
    expect(tasteSkill).toContain('execute-only visual worker')
    expect(tasteSkill).toContain('first full-page visual pass')
    expect(tasteSkill).toContain('first-pass major redesign of a selected block or section')
    expect(tasteSkill).toContain('Default to implementation, not presentation')
    expect(redesignSkill).toContain('name: redesign-skill')
    expect(redesignSkill).toContain('execute-only refinement worker')
    expect(redesignSkill).toContain('second-stage polish pass')
    expect(redesignSkill).toContain('Do not use it as the first-pass full-page generator')
    expect(redesignSkill).toContain('Default to implementation, not presentation')
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
    expect(enTemplate).toContain('taste-skill')
    expect(enTemplate).toContain('redesign-skill')
    expect(enTemplate).toContain('soft-skill')
    expect(enTemplate).toContain('AskUserQuestion')
    expect(enTemplate).toContain('<page_builder_turn_routing>')
    expect(enTemplate).toContain('current workspace')
    expect(enTemplate).toContain('Keep user-visible replies concise by default')
    expect(enTemplate).toContain('HTML-first')
    expect(enTemplate).toContain('host-managed CMS source tags')
    expect(enTemplate).toContain('consult the canonical CMS guidance surfaced for that turn before editing it')
    expect(enTemplate).toContain('Do not self-manage Vue runtime')
    expect(enTemplate).toContain('page-wide `createApp` / `mount`')
    expect(enTemplate).toContain('host-controlled confirmed CMS apply flow')
    expect(enTemplate).toContain('Do not bypass that confirmed CMS flow by editing `workspace-files/index.html` directly')
    expect(enTemplate).toContain('execute-only workers')
    expect(enTemplate).toContain('first full-page visual pass')
    expect(enTemplate).toContain('second-stage polish or upgrade work')
    expect(enTemplate).toContain('Do not treat `soft-skill` as part of the default page-builder routing surface')
    expect(enTemplate).not.toContain('must ask / conditional ask / mandatory confirmation')
    expect(enTemplate).not.toContain('redesign-existing-projects')
    expect(enTemplate).not.toContain('slot inner content only')
    expect(enTemplate).not.toContain('source.pageSize')
    expect(enTemplate).not.toContain('mcp__cms__decide_cms_binding')
    expect(enTemplate).not.toContain('decisionId')
    expect(enTemplate).not.toContain('Do not JSON-stringify the `decision` payload')
    expect(enTemplate).not.toContain('Proma')
  })

  test('documents ordinary-flow CMS boundaries for existing regions', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-guided-generation/SKILL.md')

    expect(skill).toContain('must go through the controlled CMS browser selection flow')
    expect(skill).toContain('`mcp__cms__decide_cms_binding`')
    expect(skill).toContain('Keep page-builder authoring HTML-first')
    expect(skill).toContain('host-managed CMS islands')
    expect(skill).toContain('it must not silently change query props such as `site-id`, `catalog-id`, `ids`, or `page-size`')
    expect(skill).toContain('When the host surfaces a CMS guidance notice or the selected target is already a CMS-driven region')
    expect(skill).toContain('Treat `page-builder-cms-region-authoring-guidance` as consult-only specialist guidance')
    expect(skill).toContain('treat the existing `cms-catalog` / `cms-content` source tag as source-atomic')
    expect(skill).toContain('instead of editing rendered child nodes one by one')
    expect(skill).toContain('Keep non-CMS regions in plain HTML/CSS/JS')
    expect(skill).toContain('Do not self-manage Vue runtime or bootstrap for CMS rendering')
    expect(skill).toContain('Do not simulate a page-wide Vue solution in ordinary flow')
    expect(skill).toContain('If the guidance for the current target still does not provide enough stable authoring information')
  })
})
