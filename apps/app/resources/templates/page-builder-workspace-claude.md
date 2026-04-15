# Page Builder Workspace

This workspace is used to generate a static website that can be previewed inside the current workspace.

## Preview Output Rules

- Write the preview entry page to `workspace-files/index.html`.
- Write images, stylesheets, scripts, fonts, and other preview assets under `workspace-files/`, typically in `workspace-files/assets/`.
- Use relative paths between preview files so the workspace preview route can load the site directly.
- When revising the site, update the existing files in `workspace-files/` instead of creating a separate preview output elsewhere.
- Do not put the preview site in the session working directory or any directory outside `workspace-files/` unless the user explicitly asks for a different structure.

## User Confirmation Rules

- The user is a normal end user and does not understand programming or web design. Keep the language clear and easy to follow, avoid assuming technical knowledge, and keep only the necessary webpage terms when they add precision. If you keep a term, explain it briefly in the same sentence.
- Any question that requires the user's answer, preference, approval, or decision must use the `AskUserQuestion` tool instead of asking the user to reply in plain text.
- Whenever user confirmation is required, or the request is materially unclear, always use the `AskUserQuestion` tool.
- Before building a new webpage, ask the user for any missing requirements that are necessary to produce a good result, such as theme, visual style, color direction, brand feeling, target audience, and key sections.
- If anything important is ambiguous, ask first. Do not guess.
- If the request is already clear enough and no confirmation is needed, you may proceed directly.

## Guided Page Generation Rules

- For ordinary page-builder creation and follow-up iteration flows, prefer the workspace-local `page-builder-guided-generation` skill.
- Keep user-facing requirement collection, clarification, brief confirmation, and overwrite confirmation inside `page-builder-guided-generation`. Do not hand that flow off to another meta-planning skill.
- Treat the default target as a single-page special webpage, and follow the skill's `must ask / conditional ask / mandatory confirmation` contract instead of a fixed questionnaire.
- Once the brief reaches a stable threshold, summarize it and ask for confirmation before generating the page.
- If the current preview already contains non-trivial content and the user clearly wants a full restart, use `AskUserQuestion` to confirm overwrite before replacing the whole page.
- After a page has already been generated, continue iterating on the current preview by default instead of restarting the full questioning flow, unless the user explicitly asks to redo everything.
- Do not invent hard facts such as exact dates, prices, phone numbers, or metrics. If the page still needs that slot, use clearly marked draft placeholders or pending labels.

## Design Skill Rules

- After the brief is confirmed, prefer the workspace-local `taste-skill` (skill name `design-taste-frontend`) to generate the first full page.
- Use the workspace-local `redesign-skill` (skill name `redesign-existing-projects`) only when the first result still needs an extra upgrade pass in quality or polish.
- If it is unclear whether the task is a new design or a redesign, use the `AskUserQuestion` tool to confirm before starting implementation.

## CMS Apply Skill Rules

- When a page-builder workflow already has a confirmed CMS selection and a target block selector, use the workspace-local `cms-binding-apply` skill to decide whether Phase 1A can apply the data.
- Use `cms-binding-apply` only after CMS browsing and selection are already complete. Do not use it to browse CMS data or to replace the CMS picker.
- Limit Phase 1A decisions to `ready`, `needs-clarification`, or `incompatible`.
- Treat Phase 1A as `replace-current` only and keep any proposed changes scoped to the current target block.
- If `selection.siteId` is missing or blank, stop and report an error. Do not invent `site-id="1"` for new writes and do not recover the site from host static config.
- If `cms-binding-apply` reaches `ready`, continue in the same turn by calling `mcp__cms__apply_cms_binding` instead of editing workspace files directly.
- Only pass the current block selector and the supported binding/query fields required by `mcp__cms__apply_cms_binding`. Do not bypass the formal tool with ad-hoc file writes.
- For `templateBody`, `emptyTemplate`, and `errorTemplate`, pass slot inner content only. Do not include an outer `<template v-slot:...>` wrapper or an outer `cms-*` tag.
- The generated `default`, `empty`, and `error` slots all expose the unified scope `{ items, loading, error, empty }`; use that scope inside the slot content directly.
- Only the confirmed CMS selection flow may create a new `cms-catalog` / `cms-content` or rebind an existing one.
- Ordinary page generation or ordinary iteration must not invent new `cms-*` tags. Existing CMS tags may have their slot templates, internal structure, and styles refined, but their binding query props should stay under the controlled CMS apply flow.
- When producing CMS-driven HTML, prefer `cms-catalog` / `cms-content` as the source root of a dynamic region, and keep major dynamic containers inside the CMS slot.
- Put `ul`, `section`, `article`, grid/list wrappers, and empty/error shells into `templateBody`, `emptyTemplate`, or `errorTemplate` when they belong to the same CMS-backed region.

## Working Notes

- The current session directory is a scratch working directory, not the published preview root.
- If the user asks to continue iterating on the current page, treat the existing files in `workspace-files/` as the source of truth for the preview.
