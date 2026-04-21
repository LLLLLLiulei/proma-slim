---
name: page-builder-guided-generation
description: Use when a page-builder conversation needs ordinary-user briefing, confirmation, generation, or lightweight iteration of a single-page special webpage.
---

# Page Builder Guided Generation

## Overview

Use this skill as the default controller for ordinary `page-builder` conversations. Guide 普通用户 with clear language, collect only the information needed to produce a strong result, confirm the brief, then generate or iterate on the current preview page.

## When to Use

Use this skill when all of the following are true:

- The conversation is happening inside `page-builder`.
- The user wants to create or revise a webpage, campaign page, landing page, special webpage, or a similar single-page experience.
- The default v1 target is a 单页专题页 unless the user clearly asks for another page type.
- The request is an ordinary user flow, not a specialized programmatic handoff such as confirmed CMS apply.

Do not use this skill when:

- A programmatic send already has explicit skill ownership, for example `cms-binding-apply`.
- The task is unrelated to webpage generation or iteration.
- The workflow already has a confirmed CMS selection result and is entering the controlled CMS apply path.

## Mode Detection

Decide the current mode from the current preview files, the ongoing conversation, and the user's latest request.

- **Create mode**: start from a vague idea or a blank page.
- **Iterate mode**: refine an existing generated page.
- **Redo mode**: replace a non-empty page after the user clearly asks to restart or change direction completely.

If `workspace-files/index.html` already has non-trivial content, do not assume a blank-start flow.

## Interaction Contract

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
- Each question should focus on the single highest-priority missing decision.
- Default to 2 to 4 options plus a custom answer path.
- Use multi-select only for naturally multi-value topics such as key sections or nav items.

### Clear language, but keep necessary terms

The user is a normal user. Keep the conversation easy to understand, but 保留必要的专业词汇 when they carry precise meaning in webpage work, especially Hero, CTA, 响应式, section, card, banner, and navigation.

If a term may be unfamiliar, keep it and explain it briefly in the same sentence instead of replacing it with an imprecise paraphrase.

## Briefing Contract

Work toward a stable brief, not a fixed questionnaire. See [references/briefing-thresholds.md](references/briefing-thresholds.md).

### 必问项

Before generation, make sure these items are explicit or already unambiguous from the user's request:

- page goal
- target audience
- major content blocks

If one of these is still unclear and would materially affect the result, ask about that single gap with `AskUserQuestion`.

### 条件必问项

Ask these only when they are still unresolved and would materially affect the result, or when they cannot be safely defaulted:

- tone or style direction
- device priority
- must-have or must-avoid constraints
- whether an existing non-empty page should be iterated or fully redone

### 强制确认项

These confirmations are required and should not be skipped:

- final brief confirmation before the first full-page generation
- overwrite confirmation before replacing a non-empty page

If the user says "你帮我决定", you may fill in non-critical details with reasonable defaults, but you still must keep these confirmation steps.

If only non-critical details remain, stop asking more questions and move to confirmation.

## Confirmation And Overwrite Rules

Before writing the page, provide a short summary of your current understanding, then ask for confirmation with `AskUserQuestion`.

The summary should usually cover:

- page goal
- target audience
- major content blocks
- tone or style direction
- device priority
- must-have or must-avoid constraints

If `workspace-files/index.html` already contains non-trivial content and the user clearly wants a full redo:

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

## CMS Boundaries In Ordinary Flow

Ordinary page generation and ordinary iteration are not allowed to invent new `cms-catalog` / `cms-content` tags. New CMS source tags, or rebinding an existing CMS source tag to different query props, must go through the controlled CMS browser selection flow plus `cms-binding-apply`, `mcp__cms__decide_cms_binding`, and `mcp__cms__apply_cms_binding`.

If that controlled CMS chain fails, stop and retry the CMS flow with corrected tool payloads. Do not fall back to directly editing `workspace-files/index.html` to simulate a successful CMS binding.

Keep page-builder authoring HTML-first. Existing or newly applied `cms-catalog` / `cms-content` tags are host-managed CMS islands, not a signal to convert the whole page into a Vue app.

If the page already contains CMS tags, ordinary iteration may adjust slot templates, internal structure, and styles inside the existing CMS region, but it must not silently change query props such as `site-id`, `catalog-id`, `ids`, or `page-size`.

When the selected target is already a CMS-driven region, treat the existing `cms-catalog` / `cms-content` source tag as source-atomic. Edit the source CMS region as one unit, not the rendered child nodes one by one, and do not cross into sibling blocks or sibling CMS tags.

When touching an existing CMS region:

- use the canonical CMS authoring contract as the source of truth for supported props, slot scope, item fields, and forbidden structures
- keep Vue template syntax inside the current CMS source tag's slot templates only
- keep non-CMS regions in plain HTML/CSS/JS instead of adding `v-*`, `@*`, `:` bindings, or `{{ ... }}`
- do not self-manage Vue runtime or bootstrap for CMS rendering, and do not use `createApp`, `Vue.createApp`, or page-wide `mount`
- do not guess link aliases such as `item.link` or `item.url`
- do not handwrite or preserve runtime-only locator attrs such as `data-proma-cms-source-id` or `data-proma-cms-island-*`
- if stable authoring information is missing, use one short clarification or stop the CMS rewrite path instead of guessing

If the user wants a non-CMS section to feel more dynamic, solve that with plain HTML/CSS/JS or route the request into the controlled CMS flow. Do not simulate a page-wide Vue solution in ordinary flow.

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
