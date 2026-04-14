## 1. Shared Target Selection Contracts

- [x] 1.1 Define the shared `targetSelection` model with `kind: 'block' | 'cms-island'`, `selector`, `parentBlockSelector`, `editBoundary`, and CMS component metadata across page-builder selection payloads.
- [x] 1.2 Update CMS dialog, hidden selection decoration, auto handoff, and apply-skill/tool type contracts to carry selection-scoped targets without dropping block compatibility fields.

## 2. Preview CMS Island Detection And Selection

- [x] 2.1 Emit stable CMS island metadata from the CMS rendering preview bootstrap so rendered output can be mapped back to the source `cms-catalog` / `cms-content` tag without reintroducing wrapper nodes.
- [x] 2.2 Update the preview bridge hit-testing pipeline to promote any rendered CMS child hit into a single `cms-island` target, preserve ordinary static block selection, and prevent drill-down inside a selected CMS island.
- [x] 2.3 Render CMS-island hover and selected overlays as a dashed grouped boundary with the component name label anchored at the island boundary, including multi-root bounding-box support.
- [x] 2.4 Keep selection readiness behavior correct for both non-CMS pages and CMS-rendering pages so CMS island targets become selectable only after the preview bridge has stable metadata.

## 3. Builder Selection State And Toolbar Integration

- [x] 3.1 Refactor Builder-side selection state to store the new `targetSelection` shape and keep toolbar anchoring aligned to either a static block or a CMS island target.
- [x] 3.2 Update the block toolbar capability logic so CMS islands expose CMS-safe actions, suppress unsafe block-only affordances, and continue to behave correctly when the current selection changes or disappears.
- [x] 3.3 Update hidden message injection so sending a prompt includes structured CMS island boundary metadata for the next message only, clears on success, and preserves selection on send failure.

## 4. CMS Selection, Handoff, And Apply Flow

- [x] 4.1 Update the “从 CMS 选择数据” open/confirm flow to send and return the same selection-scoped target, using source-atomic semantics for CMS islands while retaining `parentBlockSelector` as compatibility context.
- [x] 4.2 Update CMS auto handoff message composition to separate visible trigger text, hidden structured payload, and forced `mentionedSkills` injection for `cms-binding-apply`.
- [x] 4.3 Update `PageBuilderCmsApplySkillInput` defaults and handoff payload fields so both block and CMS-island targets use the shared `targetSelection` contract, and CMS islands explicitly carry `editBoundary: source-atomic`.
- [x] 4.4 Update the formal CMS apply tool and server-side apply path so `cms-island` targets replace only the selected source CMS tag, preserve parent block stability metadata, and reject missing or ambiguous selector matches with stable errors.

## 5. Downstream Editing Guardrails

- [x] 5.1 Update deletion flows so deleting a selected CMS island removes only the matched source CMS tag and never deletes the whole parent block or adjacent static siblings.
- [x] 5.2 Disable inline text editing hotspots for selected CMS islands while preserving current static block text-edit behavior.
- [x] 5.3 Disable image replacement for selected CMS islands while preserving current static image replacement behavior for eligible non-CMS targets.

## 6. Regression Coverage

- [x] 6.1 Add contract and unit coverage for the new `targetSelection` / `cms-island` payloads across preview events, hidden selection decoration, CMS dialog payloads, and handoff/apply inputs.
- [x] 6.2 Add preview integration coverage for CMS island hit-testing, grouped dashed overlays with labels, multi-root selection bounds, and non-drill-down behavior inside selected CMS islands.
- [x] 6.3 Add end-to-end regression coverage for toolbar actions, CMS rebinding, delete semantics, hidden context handoff, and the disabled inline text/image editing behaviors on CMS islands.
