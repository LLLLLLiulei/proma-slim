## Why

`apps/app/resources/page-builder/page-builder-preview-bridge.js` has grown into a large single-file runtime that mixes selection overlays, CMS island targeting, inline text editing, parent message protocol, and bootstrap logic. That makes the bridge harder to reason about, harder to test safely, and increasingly expensive to extend as page-builder preview features continue to grow.

## What Changes

- Introduce a dedicated preview bridge runtime capability that defines how the page-builder preview bridge is authored as modular source while preserving the existing injected bridge behavior.
- Move preview bridge implementation ownership away from a hand-maintained monolithic resource file toward a modular source layout with a generated single bridge asset.
- Keep the external preview integration stable: the existing preview bridge route, injection timing, and browser-visible behavior remain unchanged during the refactor.
- Rebalance preview bridge tests toward behavior and packaging guarantees instead of large amounts of bundled-script string matching.

## Capabilities

### New Capabilities
- `page-builder-preview-bridge-runtime`: Defines the authoring, packaging, and loading contract for the page-builder preview bridge runtime while preserving the current single injected bridge asset behavior.

### Modified Capabilities
- None.

## Impact

- Affected code:
  - `apps/app/resources/page-builder/page-builder-preview-bridge.js`
  - `apps/app/src/main/lib/page-builder-preview-bridge.ts`
  - `apps/app/src/main/http/routes/page-builder.ts`
  - `apps/app/src/main/lib/workspace-preview-service.ts`
  - `apps/app/src/main/lib/page-builder-preview-bridge.test.ts`
- Affected systems:
  - page-builder preview HTML injection
  - preview bridge asset serving and versioning
  - preview bridge runtime tests
- Dependencies:
  - May align preview bridge packaging with the existing Bun/ESM asset build pattern already used by CMS rendering preview
