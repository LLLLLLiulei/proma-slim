# CMS Apply Decision Entry

Keep this file lightweight. Use it for the decision contract, minimal payload/result examples, and routing into the deeper authoring guidance.

Do not treat this file as the full authoring handbook. The canonical CMS authoring contract remains the source of truth for supported props, slot scope, item fields, and forbidden structures.

Real auto-handoff payloads also include `authoringContext` and `targetSnapshot`. These examples stay minimal on purpose; do not treat them as the complete Phase 1A input shape.
In the current runtime chain, a `ready` result is not enough to write by itself: it must be passed to `mcp__cms__decide_cms_binding`, which returns `decisionId` before `mcp__cms__apply_cms_binding` can run.

## Routing

- Start here when you need the Phase 1A payload shape or the `ready` / `needs-clarification` / `incompatible` result shapes.
- If `selection.selectionKind = catalogs` or `authoringContext.component = cms-catalog`, continue with [cms-catalog-authoring.md](cms-catalog-authoring.md).
- If `selection.selectionKind = contents` or `authoringContext.component = cms-content`, continue with [cms-content-authoring.md](cms-content-authoring.md).
- Read [shared-authoring-rules.md](shared-authoring-rules.md) for slot boundaries, HTML-first / Vue rules, apply payload notes, and shared anti-patterns.

## Catalog decision example

### Input

```json
{
  "version": 8,
  "handoffId": "handoff-1",
  "entryPoint": "cms-browser-confirm",
  "applyIntent": "replace-current",
  "workspacePolicy": {
    "scope": "target-selection-only",
    "allowPageRewrite": false,
    "allowCrossBlockMutation": false,
    "outputTarget": "workspace-files/index.html"
  },
  "targetSelection": {
    "kind": "block",
    "selector": "#featured-catalogs",
    "parentBlockSelector": "#featured-catalogs",
    "editBoundary": "block"
  },
  "targetBlock": {
    "selector": "#featured-catalogs",
    "blockTypeHint": "catalog-list"
  },
  "selection": {
    "version": 5,
    "siteId": "14",
    "selectionKind": "catalogs",
    "sourceType": "catalogs-by-ids",
    "selectionMode": "fixed-items",
    "catalogIds": ["news", "products", "about"]
  },
  "authoringRevision": "rev-1"
}
```

### Ready result

```json
{
  "status": "ready",
  "targetBlockKind": "catalog-list",
  "supportedRenderModes": ["replace-current"],
  "renderMode": "replace-current",
  "applyStrategy": "replace-current",
  "mappingKind": "catalog-content-list",
  "toolKind": "catalog-nav",
  "source": {
    "siteId": "14",
    "ids": ["news", "products", "about"]
  }
}
```

## Content decision example

### Input

```json
{
  "version": 8,
  "handoffId": "handoff-2",
  "entryPoint": "cms-browser-confirm",
  "applyIntent": "replace-current",
  "workspacePolicy": {
    "scope": "target-selection-only",
    "allowPageRewrite": false,
    "allowCrossBlockMutation": false,
    "outputTarget": "workspace-files/index.html"
  },
  "targetSelection": {
    "kind": "block",
    "selector": "#latest-news",
    "parentBlockSelector": "#latest-news",
    "editBoundary": "block"
  },
  "targetBlock": {
    "selector": "#latest-news",
    "blockTypeHint": "content-list"
  },
  "selection": {
    "version": 5,
    "siteId": "14",
    "selectionKind": "contents",
    "sourceType": "contents-by-ids",
    "selectionMode": "fixed-items",
    "catalogId": "news",
    "contentIds": ["n-101", "n-102", "n-103"]
  },
  "authoringRevision": "rev-2"
}
```

### Ready result

```json
{
  "status": "ready",
  "targetBlockKind": "content-list",
  "supportedRenderModes": ["replace-current"],
  "renderMode": "replace-current",
  "applyStrategy": "replace-current",
  "mappingKind": "catalog-content-list",
  "toolKind": "content-list",
  "source": {
    "siteId": "14",
    "catalogId": "news",
    "ids": ["n-101", "n-102", "n-103"]
  }
}
```

## Clarification example

Use `needs-clarification` only when one short question can unlock a safe decision.

```json
{
  "status": "needs-clarification",
  "clarification": {
    "kind": "target-block-intent",
    "question": "当前区块更适合呈现为导航条还是栏目列表？",
    "options": [
      { "label": "导航条", "value": "nav" },
      { "label": "栏目列表", "value": "catalog-list" }
    ]
  }
}
```

## Missing blockTypeHint fallback

When `targetBlock.blockTypeHint` is absent, keep the decision conservative instead of failing immediately.

- `contents` favor `content-list`
- `catalogs` may resolve to `nav` or `catalog-list`
- if the fallback still leaves the block intent ambiguous, return `needs-clarification`

## Incompatible example

Use `incompatible` when the selection cannot be applied safely inside Phase 1A.

```json
{
  "status": "incompatible",
  "reasonCode": "unsupported-block-kind",
  "message": "当前区块不属于第一阶段支持的 nav、catalog-list 或 content-list 类型。"
}
```

## Malformed payload example

Use `reasonCode: "malformed-payload"` when the caller has not constructed the minimum Phase 1A input correctly.

```json
{
  "status": "incompatible",
  "reasonCode": "malformed-payload",
  "message": "缺少 selection 或 targetBlock，无法进入 Phase 1A 决策。"
}
```
