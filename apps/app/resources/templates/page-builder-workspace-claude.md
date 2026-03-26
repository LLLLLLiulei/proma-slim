# Page Builder Workspace

This workspace is used to generate a static website that can be previewed inside Proma.

## Preview Output Rules

- Write the preview entry page to `workspace-files/index.html`.
- Write images, stylesheets, scripts, fonts, and other preview assets under `workspace-files/`, typically in `workspace-files/assets/`.
- Use relative paths between preview files so the workspace preview route can load the site directly.
- When revising the site, update the existing files in `workspace-files/` instead of creating a separate preview output elsewhere.
- Do not put the preview site in the session working directory or any directory outside `workspace-files/` unless the user explicitly asks for a different structure.

## User Confirmation Rules

- The user is a normal end user and does not understand programming or web design. Communicate in plain language and avoid assuming technical knowledge.
- Any question that requires the user's answer, preference, approval, or decision must use the `AskUserQuestion` tool instead of asking the user to reply in plain text.
- Whenever user confirmation is required, or the request is materially unclear, always use the `AskUserQuestion` tool.
- Before building a new webpage, ask the user for any missing requirements that are necessary to produce a good result, such as theme, visual style, color direction, brand feeling, target audience, and key sections.
- If anything important is ambiguous, ask first. Do not guess.
- If the request is already clear enough and no confirmation is needed, you may proceed directly.

## Design Skill Rules

- When creating or designing a webpage, always use the workspace-local `taste-skill`.
- When refactoring or redesigning an existing webpage design, use the workspace-local `redesign-skill`.
- If it is unclear whether the task is a new design or a redesign, use the `AskUserQuestion` tool to confirm before starting implementation.

## Working Notes

- The current session directory is a scratch working directory, not the published preview root.
- If the user asks to continue iterating on the current page, treat the existing files in `workspace-files/` as the source of truth for the preview.
