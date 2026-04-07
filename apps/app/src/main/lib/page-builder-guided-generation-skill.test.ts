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
})
