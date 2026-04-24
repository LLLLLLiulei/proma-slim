import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function readRelativeText(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf-8')
}

describe('brainstorming skill docs', () => {
  test('positions brainstorming as explicit-entry guidance instead of a universal gate', () => {
    const skill = readRelativeText('../../../default-skills/brainstorming/SKILL.md')

    expect(skill).toContain('Use this skill only when the user explicitly wants exploration before execution')
    expect(skill).toContain('Explicit entry only')
    expect(skill).not.toContain('You MUST use this before any creative work')
  })

  test('requires brainstorming to yield to workspace-specific controllers', () => {
    const skill = readRelativeText('../../../default-skills/brainstorming/SKILL.md')

    expect(skill).toContain('If this discussion happens inside a workspace with a dedicated controller, return control to that controller after the discussion.')
    expect(skill).toContain('Keep user confirmation, page generation, ordinary iteration, and CMS apply ownership out of this skill.')
    expect(skill).toContain('Do not override a dedicated flow such as `page-builder-guided-generation`')
  })

  test('prefers AskUserQuestion and keeps brainstorming output lightweight', () => {
    const skill = readRelativeText('../../../default-skills/brainstorming/SKILL.md')

    expect(skill).toContain('Use `AskUserQuestion` for user choices, confirmations, and clarification whenever the host supports it')
    expect(skill).toContain('Do not dump detailed implementation plans, long component trees, or code unless the user explicitly asks for them')
    expect(skill).toContain('Keep the conclusion compact and decision-oriented')
  })
})
