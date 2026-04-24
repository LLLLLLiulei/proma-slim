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
- Keep user-visible replies concise by default. Do not expose internal skill routing, MCP choreography, or long technical reasoning unless the user explicitly asks or a retry/error needs that detail.
- When presenting a confirmation or clarification, summarize only the current decision in plain language instead of giving a large design or implementation dump.

## Scene Routing

- Treat the host-injected `<page_builder_turn_routing>` payload as the authoritative scene and owner metadata for the current turn.
- Route ordinary page creation and ordinary follow-up iteration to the workspace-local `page-builder-guided-generation` skill.
- Keep ordinary briefing, clarification, final brief confirmation, and overwrite confirmation inside `page-builder-guided-generation`.
- Treat `taste-skill` and `redesign-skill` as execute-only workers, not as owner controllers.
- Use `taste-skill` for the first full-page visual pass and the first-pass major redesign of an existing block or section.
- Use `redesign-skill` only for second-stage polish or upgrade work on an existing accepted direction.
- Do not treat `soft-skill` as part of the default page-builder routing surface.
- Do not switch out of the ordinary flow just because the current page already contains CMS regions.
- When the current target is already an existing host-managed CMS construct, consult the canonical CMS guidance surfaced for that turn before editing it.
- Treat existing-region CMS guidance as consult-only specialist guidance. It informs the ordinary controller and does not replace it as the turn owner.
- When the workflow already has a confirmed CMS selection result, target selection context, and Phase 1A apply boundary, route that turn to the workspace-local `cms-binding-apply` skill and keep the turn inside the host-controlled confirmed CMS apply flow.
- If the user explicitly wants brainstorming first, keep that as discussion only and return to `page-builder-guided-generation` for the actual confirmation and page authoring flow.

## CMS Global Boundaries

- Keep page-builder authoring HTML-first. Treat `cms-catalog` / `cms-content` as host-managed CMS source tags, not as permission to turn the whole page into a Vue app.
- Vue template syntax belongs only inside the slot authoring of an existing or newly applied `cms-catalog` / `cms-content` source tag. Keep non-CMS page regions in plain HTML/CSS/JS.
- Treat “this area should use CMS data” without a confirmed selection result as a CMS pre-selection scene, not as permission to handwrite new `cms-*` tags.
- Only the confirmed CMS selection flow may create a new `cms-catalog` / `cms-content` tag or rebind an existing one.
- Confirmed CMS apply must stay inside the host-controlled `cms-binding-apply` flow instead of falling back to ordinary page generation.
- Do not bypass that confirmed CMS flow by editing `workspace-files/index.html` directly or handwriting `cms-*` tags after a failed CMS tool call.
- Ordinary page generation and ordinary iteration may refine an existing CMS region only when its current binding query props remain unchanged.
- When touching an existing CMS region, treat the existing source CMS tag as the authoring boundary and follow the canonical CMS guidance surfaced for the current turn before editing rendered structure.
- Do not self-manage Vue runtime for CMS rendering. Do not add Vue CDN/importmap/bootstrap assets, and do not use page-wide `createApp` / `mount` to make the whole page a single Vue root.

## Working Notes

- The current session directory is a scratch working directory, not the published preview root.
- If the user asks to continue iterating on the current page, treat the existing files in `workspace-files/` as the source of truth for the preview.
