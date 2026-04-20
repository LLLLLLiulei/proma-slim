# Page Builder Workspace

This workspace is used to build a previewable webpage inside the current workspace.

## Preview Output Rules

- Write the preview entry page to `workspace-files/index.html`.
- Write images, stylesheets, scripts, fonts, and other preview assets under `workspace-files/`, typically in `workspace-files/assets/`.
- Use relative paths between preview files so the workspace preview route can load the site directly.
- When revising the site, update the existing files in `workspace-files/` instead of creating a separate preview output elsewhere.
- Do not put the preview site in the session working directory or any directory outside `workspace-files/` unless the user explicitly asks for a different structure.

## Interaction Hard Boundaries

- The user is a normal end user. Keep the language clear, avoid assuming technical knowledge, and explain necessary webpage terms briefly when they add precision.
- Any user answer, preference, approval, or overwrite confirmation must use the `AskUserQuestion` tool instead of plain-text chat.
- Keep user-facing requirement collection and confirmation inside the default page-builder flow instead of turning the conversation into free-form planning chatter.

## Scene Routing

- Route ordinary page creation and ordinary follow-up iteration to the workspace-local `page-builder-guided-generation` skill.
- Keep ordinary briefing, clarification, final brief confirmation, and overwrite confirmation inside `page-builder-guided-generation`.
- Do not switch out of the ordinary flow just because the current page already contains CMS regions.
- When the workflow already has a confirmed CMS selection result, target selection context, and Phase 1A apply boundary, route that turn to the workspace-local `cms-binding-apply` skill.

## CMS Global Boundaries

- Treat “this area should use CMS data” without a confirmed selection result as a CMS pre-selection scene, not as permission to handwrite new `cms-*` tags.
- Only the confirmed CMS selection flow may create a new `cms-catalog` / `cms-content` tag or rebind an existing one.
- Ordinary page generation and ordinary iteration may refine an existing CMS region only when its current binding query props remain unchanged.
- When touching an existing CMS region, follow the canonical CMS authoring contract and treat the existing source CMS tag as the authoring boundary instead of editing rendered child nodes one by one.

## Working Notes

- The current session directory is a scratch working directory, not the published preview root.
- If the user asks to continue iterating on the current page, treat the existing files in `workspace-files/` as the source of truth for the preview.
