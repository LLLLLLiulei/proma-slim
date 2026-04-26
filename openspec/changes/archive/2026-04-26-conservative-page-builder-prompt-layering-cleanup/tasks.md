## 1. Prompt Layer Cleanup

- [x] 1.1 Update `apps/app/src/main/lib/agent-prompt-builder.ts` so page-builder system prompt, dynamic context, and workspace capability summary each keep only their intended layer responsibilities instead of repeating the same global rules.
- [x] 1.2 Keep the existing page-builder owner routing, bootstrapped skill surfacing, and confirmed CMS apply handoff behavior unchanged while adjusting the prompt text around them.
- [x] 1.3 Add or update prompt-builder and orchestrator tests so runtime-factual dynamic context, capability-summary discoverability, and turn-scoped owner contracts are all verified after the copy cleanup.

## 2. Shared Workspace And Owner Surface Cleanup

- [x] 2.1 Slim `apps/app/resources/templates/page-builder-workspace-claude.md` so it keeps only shared workspace laws, ordinary user interaction boundaries, shared AskUserQuestion boundary, and high-level CMS safety boundaries.
- [x] 2.2 Update `apps/app/default-skills/page-builder-guided-generation/` so the owner skill focuses on ordinary clarification, confirmation, overwrite control, worker dispatch, and lightweight CMS boundaries without re-explaining the full workspace manual.
- [x] 2.3 Add or update template and skill tests so the new `CLAUDE.md` and `page-builder-guided-generation` texts stay aligned and do not regress into duplicated prompt responsibilities.

## 3. Visual Worker Overrides And Workspace Rollout

- [x] 3.1 Update `apps/app/default-skills/taste-skill/` and `apps/app/default-skills/redesign-skill/` with an explicit page-builder override that defaults to `workspace-files/index.html`, plain HTML/CSS/JS authoring, and existing CMS high-level boundaries.
- [x] 3.2 Add or update tests so page-builder visual workers no longer default to React, Next.js, Tailwind, `package.json`, or package-manager assumptions when the current page-builder workspace does not provide that context.
- [x] 3.3 Sync the updated default page-builder skills and workspace `CLAUDE.md` template into existing page-builder workspaces, then run the relevant prompt, skill, template, and owner-routing test suites to confirm the conservative cleanup is stable.
