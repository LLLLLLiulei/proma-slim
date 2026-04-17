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
    expect(skill).toContain('整页覆盖确认')
  })

  test('keeps threshold and confirmation rules in references', () => {
    const references = readRelativeText('../../../default-skills/page-builder-guided-generation/references/briefing-thresholds.md')

    expect(references).toContain('可稳定成稿阈值')
    expect(references).toContain('最终确认')
    expect(references).toContain('你帮我决定')
  })

  test('aligns workspace templates with the guided generation contract', () => {
    const zhTemplate = readRelativeText('../../../resources/templates/page-builder-workspace-claude.zh-CN.md')
    const enTemplate = readRelativeText('../../../resources/templates/page-builder-workspace-claude.md')

    expect(zhTemplate).toContain('必问项 / 条件必问项 / 强制确认项')
    expect(zhTemplate).toContain('不要把这些步骤转交给其他元流程 skill')
    expect(zhTemplate).toContain('design-taste-frontend')
    expect(zhTemplate).toContain('redesign-existing-projects')
    expect(zhTemplate).toContain('当前工作台')
    expect(zhTemplate).not.toContain('Proma')

    expect(enTemplate).toContain('must ask / conditional ask / mandatory confirmation')
    expect(enTemplate).toContain('Do not hand that flow off to another meta-planning skill')
    expect(enTemplate).toContain('design-taste-frontend')
    expect(enTemplate).toContain('redesign-existing-projects')
    expect(enTemplate).toContain('current workspace')
    expect(enTemplate).not.toContain('Proma')
  })

  test('documents cms slot-structured authoring guidance in the skill and workspace templates', () => {
    const skill = readRelativeText('../../../default-skills/page-builder-guided-generation/SKILL.md')
    const zhTemplate = readRelativeText('../../../resources/templates/page-builder-workspace-claude.zh-CN.md')
    const enTemplate = readRelativeText('../../../resources/templates/page-builder-workspace-claude.md')

    expect(skill).toContain('`cms-catalog` / `cms-content` should wrap the whole dynamic region')
    expect(skill).toContain('put major HTML containers such as `ul`, `section`, and `article` inside the slot')
    expect(zhTemplate).toContain('`cms-catalog` / `cms-content` 尽量作为动态区域源码根节点')
    expect(zhTemplate).toContain('`ul`、`section`、`article` 等主要动态容器尽量写在 slot 中')
    expect(enTemplate).toContain('prefer `cms-catalog` / `cms-content` as the source root of a dynamic region')
    expect(enTemplate).toContain('keep major dynamic containers inside the CMS slot')
    expect(zhTemplate).toContain('优先保留这些现有样式结构，只替换为 CMS 数据绑定')
    expect(zhTemplate).toContain('不要在它旁边追加一个新的 `cms-catalog` / `cms-content`')
    expect(zhTemplate).toContain('优先使用 `AskUserQuestion` 做一次简短澄清')
    expect(enTemplate).toContain('preserve its existing shell, classes, and major layout structure')
    expect(enTemplate).toContain('Do not append a new `cms-catalog` / `cms-content` beside the selected block')
    expect(enTemplate).toContain('use `AskUserQuestion` for one short clarification')
  })
})
