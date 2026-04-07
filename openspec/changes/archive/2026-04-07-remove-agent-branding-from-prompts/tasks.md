## 1. Runtime Prompt Neutralization

- [x] 1.1 Update `apps/app/src/main/lib/agent-prompt-builder.ts` so the assistant identity, workspace semantics, scratch-mode wording, and reply constraints all use neutral host/task language and explicitly forbid branded self-identification.
- [x] 1.2 Update runtime prompt-related tests to assert the model-visible system prompt and dynamic context no longer encourage product/model/CLI/SDK/provider self-identity.

## 2. Workspace Template Neutralization

- [x] 2.1 Update `apps/app/resources/templates/page-builder-workspace-claude.md` and `apps/app/resources/templates/page-builder-workspace-claude.zh-CN.md` to use neutral workspace/workbench wording without branded identity cues.
- [x] 2.2 Keep the existing “do not overwrite an existing root CLAUDE.md” behavior intact and adjust template tests to verify the refreshed neutral template content.

## 3. Verification

- [x] 3.1 Add or refresh targeted tests that cover identity-question guidance and neutral model-visible prompt surfaces for both runtime injection and page-builder workspace bootstrap.
- [x] 3.2 Run the relevant test suites for prompt/template changes and confirm the OpenSpec change is ready for implementation.
