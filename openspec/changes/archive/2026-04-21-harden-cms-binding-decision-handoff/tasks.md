## 1. Decision Contract And Runtime Surface

- [x] 1.1 Add shared CMS binding decision/apply-plan types, including `decisionId`, normalized apply plan fields, and the revision/snapshot binding metadata needed for staleness checks.
- [x] 1.2 Implement the host-managed `mcp__cms__decide_cms_binding` runtime tool and expose it from the page-builder CMS MCP bundle together with the existing list/apply tools.
- [x] 1.3 Add unit coverage for ready/non-ready decision results, persisted decision records, and decision invalidation inputs.

## 2. Confirmed Handoff Orchestration

- [x] 2.1 Wire CMS browser confirm to the production programmatic handoff path so it preserves confirmed selection context, authoringContext, targetSnapshot, and the current authoring revision/digest.
- [x] 2.2 Update the confirmed CMS apply orchestration so the same turn explicitly runs `cms-binding-apply`, then `mcp__cms__decide_cms_binding`, and only then `mcp__cms__apply_cms_binding`.
- [x] 2.3 Add integration coverage for successful same-turn handoff, non-ready decision outcomes, and busy/failure preservation of the CMS browser state.

## 3. Formal Apply Gating

- [x] 3.1 Refactor `mcp__cms__apply_cms_binding` to require `decisionId` plus template fields, and load target/source identity from the persisted apply plan instead of trusting raw caller binding inputs.
- [x] 3.2 Enforce fail-closed checks for missing, stale, conflicting, or replayed decisions, and implement the decision consumption/retry lifecycle after apply attempts.
- [x] 3.3 Expand apply-tool tests to cover missing decision rejection, stale decision rejection, retry-after-template-failure, and successful decision consumption.

## 4. Prompting, Skills, And Regression Coverage

- [x] 4.1 Update `cms-binding-apply` skill docs and related prompt-layer guidance so the `ready` path requires the decision tool and never falls back to direct workspace file edits.
- [x] 4.2 Update CMS runtime tool-surface docs/tests and any enumerations of allowed CMS tools to include `mcp__cms__decide_cms_binding`.
- [x] 4.3 Add regression coverage that confirmed CMS apply cannot fall back to page-wide Vue runtime/bootstrap or direct file-edit authoring outside the controlled decision/apply chain.

## 5. Hard Bootstrap, Follow-up Routing, And Structure Guardrails

- [x] 5.1 Replace prompt-only CMS auto handoff skill mention with a host-controlled `cms-binding-apply` bootstrap path, while retaining explicit skill mention for transparency and telemetry.
- [x] 5.2 Add selected `cms-island` follow-up routing so style/slot iteration stays in `page-builder-guided-generation`, but data-source or query-prop rebind requests return to CMS browser confirm and the decision/apply chain.
- [x] 5.3 Extend persisted apply plans with shell-preservation / major-container-ownership guardrails derived from `targetSnapshot`, and make `mcp__cms__apply_cms_binding` fail closed when `templateBody` conflicts with those guardrails.
- [x] 5.4 Add regression coverage for skipped-skill prevention, `cms-island` rebind routing, duplicate-major-container rejection, and actionable retry-oriented structure errors.
