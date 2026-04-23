## 1. Guidance Structure

- [x] 1.1 Add a new lightweight workspace-local existing CMS region guidance skill and split any supporting guidance into component/shared references instead of rebuilding one heavy CMS skill.
- [x] 1.2 Update page-builder workspace initialization so the new CMS region guidance skill is copied into page-builder workspaces alongside the existing default skills.
- [x] 1.3 Refine the page-builder root `CLAUDE.md` template so it keeps only global CMS boundaries, routing rules, and the “consult canonical guidance before editing existing CMS constructs” rule.

## 2. Contract-Derived Ordinary CMS Guidance

- [x] 2.1 Extend the canonical CMS authoring contract types/helpers to derive a minimal ordinary authoring digest for existing `cms-catalog` / `cms-content` targets.
- [x] 2.2 Add prompt assembly support so ordinary page-builder turns that explicitly target an existing CMS region receive the new digest and the dedicated CMS region guidance skill via host-controlled surfacing rather than passive workspace presence alone, and so pages that already contain CMS regions can receive a lightweight page-level guidance notice even when no target-scoped digest is available.
- [x] 2.3 Ensure confirmed CMS apply turns still bootstrap `cms-binding-apply` without being replaced by the new ordinary CMS guidance path.

## 3. Skill Boundary Refactor

- [x] 3.1 Trim `page-builder-guided-generation` so its CMS section remains boundary-level and defers detailed existing-region CMS literacy to the new guidance layer.
- [x] 3.2 Trim `cms-binding-apply` so it stays focused on confirmed selection, Phase 1A decisioning, and same-turn `decide -> apply`, without reabsorbing ordinary CMS guidance.
- [x] 3.3 Align any CMS references or supporting docs so ordinary CMS guidance, confirmed apply guidance, and contract-derived examples no longer duplicate or contradict each other.

## 4. Verification

- [x] 4.1 Add or update tests for workspace skill copying and root prompt/template content after introducing the new guidance layer.
- [x] 4.2 Add or update tests for ordinary page-builder prompt injection so existing CMS region turns receive the new digest and dedicated guidance via explicit host surfacing, pages that already contain CMS regions receive a lightweight page-level notice, and unrelated non-CMS ordinary turns do not receive target-scoped CMS guidance noise.
- [x] 4.3 Add or update tests to confirm confirmed CMS apply turns still use `cms-binding-apply` and that contract-derived ordinary guidance stays aligned with the canonical CMS authoring contract.
