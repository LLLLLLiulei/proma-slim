---
name: taste-skill
description: Execute-only visual worker for page-builder first-pass page creation and first-pass major block redesign. Not a briefing or routing controller.
---

# Taste Skill

## PageBuilder Role

In `page-builder`, this skill is an execute-only visual worker and an HTML-first static visual worker.

- Use it after `page-builder-guided-generation` has already finished the needed user-facing clarification or confirmation.
- Use it for the first full-page visual pass.
- Use it for the first-pass major redesign of a selected block or section when the task is not merely polish.
- Do not use it as the turn owner, briefing controller, CMS decision maker, or ordinary conversation router.
- Do not use it for second-stage polish of an already accepted direction; use `redesign-skill` for that stage.
- Default to implementation, not presentation. Do not output long design essays, large audit summaries, or code walkthroughs to the user unless the user explicitly asks for them.

## PageBuilder Static Contract

When this skill is used inside `page-builder`, the following rules are mandatory for PageBuilder work.

- Treat the current target as the existing preview under `workspace-files/`.
- Always write the page entry to `workspace-files/index.html`.
- Always write first-party CSS to `workspace-files/assets/styles.css`.
- Always write first-party JavaScript to `workspace-files/assets/script.js`.
- Use relative paths from `index.html`, such as `./assets/styles.css` and `./assets/script.js`.
- Default to plain HTML/CSS/JS authoring and edit the existing preview files directly.
- Do not create a package-based frontend project.
- Do not create package manifests, lockfiles, build configs, framework routes, or component trees.
- Do not output package-manager install commands.
- Do not start with dependency checks, install commands, framework migration advice, or component-library assumptions in a plain PageBuilder workspace.
- Keep user-facing output product-level. After writing files, summarize visible page changes only; do not list file paths, CSS selectors, class names, color tokens, or implementation details unless the user asks.
- For minor fixes, reply with one concise result sentence and skip technical implementation notes.
- Do not expose internal file safety analysis. Inspect files silently and continue the page task.

## External Dependency Policy

- Default to zero external dependencies.
- Prefer native HTML, CSS, and browser JavaScript.
- If an optional browser-side JS or CSS dependency is truly needed, load it only from `https://unpkg.com/`.
- Pin a concrete version in every unpkg URL. Do not use `@latest`.
- Prefer direct browser assets that work without a build step.
- If an optional CDN dependency fails, keep the page usable with first-party HTML/CSS/JS fallback behavior.
- Do not introduce dependencies for basic layout, icons, tabs, accordions, counters, scroll reveal, or simple animation.

## CMS Boundaries

- Existing `cms-catalog` / `cms-content` regions are host-managed CMS source tags.
- Keep CMS source tags intact unless the user specifically asks to redesign that CMS-owned region and the routing skill has selected the CMS flow.
- Vue template syntax only inside the current CMS source tag slot templates.
- Do not add page-wide Vue runtime, CDN/importmap bootstrap, app mounting code, or framework runtime.
- Keep ordinary page regions in plain HTML/CSS/JS.
- Do not convert CMS islands into static placeholders unless the task explicitly asks for a static, non-CMS redesign.

## Design Operating Mode

Silently infer the page kind, audience, content density, and desired emotional tone from the user's request and the current page.

- Do not print a design read.
- Do not ask the user to choose visual tokens when the brief already gives enough direction.
- Do not narrate internal scoring, routing, or style heuristics.
- Use the inferred page kind to choose layout, typography, motion, and density.
- If the user gave a concrete brand direction, obey it even when it conflicts with the defaults below.

Baseline dials:

- DESIGN_VARIANCE: 8
- MOTION_INTENSITY: 6
- VISUAL_DENSITY: 4

Use these dials as internal defaults, not user-facing output. Adjust them silently when the user's request clearly implies another direction.

## Visual Quality Rules

You must avoid common AI-default patterns. Build pages that feel specific to the user's brief.

- Prefer one strong layout idea over many generic sections.
- Choose a clear typographic voice. Avoid default font stacks unless the existing page already depends on them.
- Use color deliberately. Avoid generic purple/blue AI gradients unless the user explicitly asks for that style.
- Use spacing as composition, not filler.
- Use cards only when containers communicate hierarchy. Do not wrap every piece of content in identical cards.
- Make mobile layout deliberate. Large desktop asymmetry must collapse safely to a single-column mobile flow.
- Use motion only when it clarifies attention or adds polish. Prefer CSS transitions, keyframes, and intersection-free load reveals.
- Do not animate layout properties that cause jank. Prefer transform and opacity.
- Keep images, icons, and decorative shapes cohesive with the page concept.
- Include accessible text, semantic landmarks, usable focus states, and sensible alt text.

## Layout Hard Rules

- Eyebrow restraint: at most 1 eyebrow per 3 sections. The maximum eyebrow count is `ceil(sectionCount / 3)`.
- Hero stack discipline: do not stack eyebrow, badge, announcement pill, huge headline, subhead, CTA pair, metrics row, and image all in the same centered column.
- Zigzag alternation cap: avoid repeating left-image/right-copy blocks more than twice in a row.
- Bento cell count rule: use fewer, more purposeful cells instead of a dense wall of identical tiles.
- No duplicate CTA intent: do not place multiple buttons with the same meaning in the same viewport.
- Split-header ban: do not split a normal heading across multiple decorative lines unless that split is core to the concept.
- Do not use generic three-equal-card feature rows as the default.
- Do not use oversized hero text to compensate for weak composition.

## Production-Test AI Tells To Avoid

Avoid these tells unless the user explicitly requests them:

- Version labels in the hero.
- Section-number eyebrows.
- middle-dot separators used as decorative filler.
- Div-based fake product UI that cannot plausibly exist.
- Quietly in use at or similar empty social-proof lines.
- Weather or locale strips unrelated to the product.
- Scroll cues that do not support the user's task.
- credit captions used as decoration.
- Version footers on marketing pages.
- Generic fake names, generic fake avatars, and perfectly round fake numbers.
- Placeholder brands like Acme, Nexus, SmartFlow, or similar startup slop names.
- Copywriting cliches such as "Elevate", "Seamless", "Unleash", and "Next-Gen" unless present in user-provided copy.

## Copy Self-Audit

Run a Copy self-audit before finishing.

- Replace vague claims with concrete, page-specific language.
- Remove filler labels that only decorate the layout.
- Keep headings short and sharp.
- Do not introduce em-dashes.
- User-provided brand copy that already contains an em-dash may be kept.
- Prefer commas, colons, semicolons, parentheses, or short sentences instead of newly generated em-dashes.

## Implementation Rules

- Preserve existing user content unless the task asks for a rewrite or the text is clearly placeholder content.
- Preserve working links, images, CMS tags, exported assets, and integration markers unless changing them is part of the task.
- Keep first-party assets under `workspace-files/assets/`.
- Make the final page work by opening `workspace-files/index.html` directly through the PageBuilder preview.
- Prefer progressive enhancement. The page should remain readable if JavaScript is disabled.
- Keep JavaScript small and purposeful. Use it for menus, tabs, sliders, counters, subtle reveal, and interaction state only when needed.
- Avoid hidden network dependencies for core content.
- Never leave TODO labels, lorem ipsum, placeholder badges, or unfinished debug text in the final page.

## Lightweight Preflight

Run this lightweight preflight before handing control back:

- `workspace-files/index.html` links to `./assets/styles.css`.
- `workspace-files/index.html` links to `./assets/script.js` when JavaScript is needed.
- The page still renders meaningful content without optional CDN assets.
- External dependencies, if any, use pinned `https://unpkg.com/` URLs.
- No package-based project files were created.
- CMS source tags remain valid and Vue syntax appears only inside CMS slots.
- Eyebrow count is at most `ceil(sectionCount / 3)`.
- No freshly generated em-dash.
- Desktop and mobile layouts are both intentional.
- Motion uses transform and opacity where possible.
- Final user-facing reply focuses on visible outcome, not implementation internals.
