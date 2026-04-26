## 1. Owner Skill Escalation

- [x] 1.1 Update `apps/app/default-skills/page-builder-guided-generation/SKILL.md` so ordinary repair, ordinary follow-up, and selected-block follow-up flows stay static-first, escalate to Playwright when page issues still cannot be stably explained or the user reports the page is still broken after a prior fix, and explicitly close Playwright after diagnosis.
- [x] 1.2 Update the guided-generation skill tests to lock the new escalation rule in place across ordinary repair, ordinary follow-up, and selected-block follow-up without duplicating the rule into root `CLAUDE.md` or visual worker skills.

## 2. Browser Debug Runtime Context

- [x] 2.1 Plumb a browser-usable page-builder app origin into the agent runtime for non-Docker turns, while preserving the existing Docker internal origin path for sidecar Playwright.
- [x] 2.2 Update the page-builder dynamic context and runtime Playwright helpers to inject one stable browser preview debug URL plus minimal runtime instructions when Playwright access and preview state are both available.
- [x] 2.3 Keep the current page-builder first-turn MCP suppression behavior unchanged and omit the browser debug preview URL when the runtime cannot resolve a stable browser-accessible preview address.

## 3. Verification

- [x] 3.1 Add or update prompt-builder and orchestrator runtime tests to cover Docker internal preview URLs, local/dev absolute preview URLs, omission behavior when no stable browser debug entry is available, and the expected Playwright close-after-use guidance.
- [x] 3.2 Run the relevant page-builder guided-generation, prompt-builder, and orchestrator workspace tests to confirm the Playwright escalation guidance stays lightweight and the existing MCP mounting policy does not regress.
