---
name: page-builder-guided-generation
description: Use when a page-builder conversation with an ordinary user needs guided creation or guided iteration of a single-page special webpage from a vague or partially defined request.
---

# Page Builder Guided Generation

## Overview

Use this skill as the default controller for ordinary `page-builder` conversations. Guide 普通用户 with clear language, collect only the information needed to produce a strong result, confirm the brief, then generate or iterate on the current preview page.

## When to Use

Use this skill when all of the following are true:

- The conversation is happening inside `page-builder`.
- The user wants to create a webpage, special webpage, event page, campaign page, landing page, or a similar single-page experience.
- The default v1 target is a 单页专题页 unless the user clearly asks for another page type.
- The request is an ordinary user flow, not a specialized programmatic handoff such as CMS apply.

Do not use this skill when:

- A programmatic send already has explicit skill ownership, for example `cms-binding-apply`.
- The task is unrelated to webpage generation or iteration.
- The user explicitly wants a different, specialized workflow.

## Mode Detection

Decide the current mode from the current preview files, the ongoing conversation, and the user's latest request.

- **Create mode**: use when the user is starting from a vague idea or wants a new single-page webpage.
- **Iterate mode**: use when `workspace-files/index.html` already represents a generated page and the user is asking for local refinements.
- **Redo mode**: use when a non-empty page already exists and the user clearly asks to restart, remake the whole page, or change direction completely.

If `workspace-files/index.html` already has non-trivial content, do not assume a blank-start flow.

## Interaction Rules

### This skill keeps control of briefing

This skill owns the user-facing briefing flow end to end.

- Keep requirement collection, clarification, final brief confirmation, and overwrite confirmation inside this skill.
- Do not hand off user-facing briefing or confirmation to `brainstorming` or any other meta-planning or orchestration skill.
- Use downstream skills only after the brief is confirmed, and only for production work such as page generation or polish.

### AskUserQuestion first

For any user choice, confirmation, preference, or missing critical information, use `AskUserQuestion` instead of asking the user to answer in free-form chat.

### One question at a time

- 一次只问一个问题。
- Ask one question at a time.
- Each question should focus on the single most important missing decision.
- Default to 2 to 4 options plus a custom answer path.
- Use multi-select only for naturally multi-value topics such as key sections or nav items.

### Clear language, but keep necessary terms

The user is a normal user. Keep the conversation easy to understand, but do not over-translate everything into casual wording. 保留必要的专业词汇 when they carry precise meaning in webpage work, especially terms such as Hero, CTA, 响应式, section, card, banner, and navigation.

If a term may be unfamiliar, keep it and explain it briefly in the same sentence instead of replacing it with an imprecise paraphrase.

Good examples:

- "这个页面主要是手机上看，还是电脑上看？"
- "页面最上面你更想先放大图，还是先放一句重点介绍？"
- "你更希望别人打开页面后先注意到什么？"
- "这个页面要不要做响应式，也就是手机和电脑都能比较自然地显示？"
- "Hero 区就是页面最上面的第一屏主视觉，你更想先突出标题还是先突出大图？"
- "CTA 就是希望用户点击的主要按钮，你更希望它写成“立即报名”还是“了解详情”？"

Bad examples:

- "请定义 Hero、CTA、信息架构、视觉层级、交互密度之间的优先级。"
- "请给出完整的响应式布局策略、栅格规范和组件层级约束。"

## Briefing Threshold

Work toward a stable brief, not a fixed questionnaire. See [references/briefing-thresholds.md](references/briefing-thresholds.md).

This is not a rigid script, but it is also not a free-form interview. Keep the flow dynamic while still following the questioning contract below.

### 必问项

Before generation, make sure these items are explicit or already unambiguous from the user's request:

- page goal
- target audience
- major content blocks

If one of these is still unclear and would affect the page structure or first-screen direction, ask about it with `AskUserQuestion`.

### 条件必问项

Ask these only when they are still unresolved and would materially affect the result, or when they cannot be safely defaulted:

- tone or style direction
- device priority
- must-have or must-avoid constraints
- whether an existing non-empty page should be iterated or fully redone

These are not mandatory on every turn if the user has already stated them clearly, or if a safe default is enough to proceed.

### 强制确认项

These confirmations are required and should not be skipped:

- final brief confirmation before the first full-page generation
- overwrite confirmation before replacing a non-empty page

If the user says "你帮我决定", you may fill in non-critical details with reasonable defaults, but you still must keep these confirmation steps.

If only non-critical details remain, stop asking more questions and move to confirmation.

## Clarification Rules

- Use short clarification only when one unresolved ambiguity would materially affect structure, major visual direction, or content priority.
- Do not ask multiple unrelated questions at once.
- Do not restart broad discovery once the brief is already mostly clear.

## Confirmation Rules

Before writing the page, provide a short summary of your current understanding, then ask for confirmation with `AskUserQuestion`.

The summary should usually cover:

- page goal
- target audience
- major content blocks
- tone or style direction
- device priority
- must-have or must-avoid constraints

Do not start generating the page before that confirmation is complete.

## Overwrite Rules

If `workspace-files/index.html` already contains non-trivial content and the user clearly wants a full redo, treat it as a 整页覆盖确认 flow:

1. ask for overwrite confirmation through `AskUserQuestion`
2. wait for a positive confirmation
3. only then replace the whole page

If the user does not confirm overwrite, keep the current page and continue from there.

## Generation Rules

After confirmation:

1. Treat the default target as a **single-page special webpage**.
2. Write the preview entry to `workspace-files/index.html`.
3. Write any supporting assets under `workspace-files/`, typically `workspace-files/assets/`.
4. Explicitly use `design-taste-frontend` to generate the first full page.
5. Use `redesign-existing-projects` only if the first result still needs a meaningful polish pass.

Default navigation should point to sections within the same page instead of introducing multi-page routing.

For factual content:

- preserve user-provided facts
- generate reasonable draft copy for missing soft content
- do not invent hard facts such as exact prices, dates, phone numbers, certifications, or metrics
- if hard facts are still missing, use clearly marked draft placeholders or pending labels instead of presenting invented final facts

## Iteration Rules

Once a page has already been generated, default to lightweight iteration mode.

- Modify the current preview page directly.
- Ask new `AskUserQuestion` prompts only when a critical ambiguity blocks the requested change.
- Do not restart the full briefing flow for small refinements such as color, ordering, section emphasis, or tone adjustments.

If the user clearly asks to redo everything, switch back to redo mode and use overwrite confirmation.

## Output Discipline

- Keep the process conversational but controlled.
- Do not explain internal workflow machinery unless needed.
- Do not ask the user to choose between `taste-skill` and `redesign-skill`.
- Do not present yourself as a template-only skill.
- Once confirmation is done, move forward and generate the page.
