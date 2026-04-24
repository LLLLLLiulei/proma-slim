---
name: brainstorming
description: "Use only when the user explicitly asks to brainstorm, compare options, or discuss a design before implementation. Do not override workspace-specific controller flows."
---

# Brainstorming Ideas

## Overview

Use this skill only when the user explicitly wants exploration before execution: brainstorm options, compare directions, clarify trade-offs, or discuss a design before implementation.

This skill is clarification-first. It helps narrow the problem, not replace a workspace-specific controller or implementation flow.

Keep the output lightweight by default. Do not turn brainstorming into a long design review, a large architecture write-up, or a code proposal unless the user explicitly asks for that depth.

## When to Use

Use this skill when one of these is true:

- the user explicitly says they want to brainstorm first
- the user asks to compare multiple approaches before deciding
- the current task needs option analysis, trade-off discussion, or requirement clarification before execution

Do not use this skill when:

- the current workspace already has a dedicated controller for the active task and the user did not explicitly ask to brainstorm
- the user is already inside a concrete execution flow such as ordinary `page-builder` generation or iteration
- the task is already clear enough to implement directly

## Workflow

### Understand the decision

- Check out the current project state first (files, docs, recent commits)
- Use `AskUserQuestion` for user choices, confirmations, and clarification whenever the host supports it
- Ask questions one at a time to refine the idea
- Prefer multiple choice questions when possible, but open-ended is fine only when fixed options would distort the user's intent
- Only one question per message - if a topic needs more exploration, break it into multiple questions
- Focus on understanding: purpose, constraints, success criteria

### Explore options

- Propose 2-3 different approaches with trade-offs
- Present options briefly with your recommendation and reasoning
- Lead with your recommended option and explain why
- Do not dump detailed implementation plans, long component trees, or code unless the user explicitly asks for them

### Converge the discussion

- Once you understand the decision, present a short recommendation or summary
- Keep the conclusion compact and decision-oriented
- Ask for confirmation with `AskUserQuestion` when the next step depends on user approval
- Expand into architecture, components, data flow, testing, or code only if the user explicitly asks for that level of detail
- Be ready to go back and clarify if something doesn't make sense

### Hand back to the active controller

- If this discussion happens inside a workspace with a dedicated controller, return control to that controller after the discussion.
- In `page-builder`, use brainstorming only for explicit discussion. Keep user confirmation, page generation, ordinary iteration, and CMS apply ownership out of this skill.
- Do not require documentation, git worktrees, or implementation planning as mandatory follow-up steps.

## Key Principles

- **Explicit entry only** - Never claim that all creative work must start here
- **AskUserQuestion first** - Use `AskUserQuestion` for clarification and confirmation whenever it is available
- **One question at a time** - Don't overwhelm with multiple questions
- **Multiple choice preferred** - Easier to answer than open-ended when possible
- **Keep output light** - Default to concise options and a short recommendation, not a long design document
- **YAGNI ruthlessly** - Remove unnecessary features from all designs
- **Explore alternatives** - Always propose 2-3 approaches before settling
- **Incremental validation** - Validate the decision with the user before expanding depth
- **Be flexible** - Go back and clarify when something doesn't make sense
- **Yield to workspace controllers** - Do not override a dedicated flow such as `page-builder-guided-generation`
