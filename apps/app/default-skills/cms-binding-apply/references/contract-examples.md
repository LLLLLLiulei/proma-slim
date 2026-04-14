# CMS Apply Contract Examples

Use these examples when interpreting or producing the `cms-binding-apply` contract.

## Catalogs to nav

### Input

```json
{
  "version": 1,
  "entryPoint": "cms-browser-confirm",
  "applyIntent": "replace-current",
  "workspacePolicy": {
    "scope": "target-block-only",
    "allowPageRewrite": false,
    "allowCrossBlockMutation": false,
    "outputTarget": "workspace-files/index.html"
  },
  "targetBlock": {
    "selector": "#main-nav",
    "blockTypeHint": "nav"
  },
  "selection": {
    "version": 1,
    "targetBlock": {
      "selector": "#main-nav"
    },
    "selectionKind": "catalogs",
    "sourceType": "catalogs",
    "selectionMode": "multiple",
    "catalogIds": ["news", "products", "about"],
    "snapshot": {
      "catalogs": [
        { "id": "news", "name": "新闻" },
        { "id": "products", "name": "产品" },
        { "id": "about", "name": "关于我们" }
      ]
    }
  }
}
```

### Ready result

```json
{
  "status": "ready",
  "targetBlockKind": "nav",
  "supportedRenderModes": ["replace-current"],
  "renderMode": "replace-current",
  "applyStrategy": "replace-current",
  "mappingKind": "catalog-nav",
  "toolKind": "catalog-nav"
}
```

## Single catalog to content-list

### Input

```json
{
  "version": 1,
  "entryPoint": "cms-browser-confirm",
  "applyIntent": "replace-current",
  "workspacePolicy": {
    "scope": "target-block-only",
    "allowPageRewrite": false,
    "allowCrossBlockMutation": false,
    "outputTarget": "workspace-files/index.html"
  },
  "targetBlock": {
    "selector": "#latest-news",
    "blockTypeHint": "content-list"
  },
  "selection": {
    "version": 1,
    "targetBlock": {
      "selector": "#latest-news"
    },
    "selectionKind": "catalogs",
    "sourceType": "catalogs",
    "selectionMode": "single",
    "catalogIds": ["news"],
    "snapshot": {
      "catalogs": [
        { "id": "news", "name": "新闻" }
      ]
    }
  }
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
  "toolKind": "content-list"
}
```

## Fixed content selection is incompatible

Fixed content IDs are outside the current runtime capability because `apply_cms_binding` only supports catalog-driven `cms-content` queries.

### Input

```json
{
  "version": 1,
  "entryPoint": "cms-browser-confirm",
  "applyIntent": "replace-current",
  "workspacePolicy": {
    "scope": "target-block-only",
    "allowPageRewrite": false,
    "allowCrossBlockMutation": false,
    "outputTarget": "workspace-files/index.html"
  },
  "targetBlock": {
    "selector": "#latest-news",
    "blockTypeHint": "content-list"
  },
  "selection": {
    "version": 1,
    "targetBlock": {
      "selector": "#latest-news"
    },
    "selectionKind": "contents",
    "sourceType": "contents-fixed",
    "selectionMode": "fixed-items",
    "catalogIds": ["news"],
    "contentIds": ["n-101", "n-102", "n-103"],
    "snapshot": {
      "contents": [
        { "id": "n-101", "title": "标题 1" }
      ]
    }
  }
}
```

### Incompatible result

```json
{
  "status": "incompatible",
  "reasonCode": "unsupported-runtime-capability",
  "message": "当前 runtime 仅支持按栏目查询的 content-list 绑定，不支持 fixed content IDs。"
}
```

## Clarification example

Use `needs-clarification` only when one short question can unlock a safe decision.

```json
{
  "status": "needs-clarification",
  "clarification": {
    "kind": "catalog-nav-scope",
    "question": "多个栏目需要按一级导航平铺，还是保留层级结构？",
    "options": [
      { "label": "平铺一级栏目", "value": "flat-top-level" },
      { "label": "保留层级结构", "value": "preserve-hierarchy" }
    ]
  }
}
```

## Missing blockTypeHint fallback

When `targetBlock.blockTypeHint` is absent, keep the decision conservative instead of failing immediately.

```json
{
  "version": 1,
  "entryPoint": "cms-browser-confirm",
  "applyIntent": "replace-current",
  "workspacePolicy": {
    "scope": "target-block-only",
    "allowPageRewrite": false,
    "allowCrossBlockMutation": false,
    "outputTarget": "workspace-files/index.html"
  },
  "targetBlock": {
    "selector": "#latest-list"
  },
  "selection": {
    "version": 1,
    "targetBlock": {
      "selector": "#latest-list"
    },
    "selectionKind": "contents",
    "sourceType": "contents-fixed",
    "selectionMode": "fixed-items",
    "catalogIds": ["news"],
    "contentIds": ["n-201"],
    "snapshot": {
      "contents": [
        { "id": "n-201", "title": "标题 A" }
      ]
    }
  }
}
```

Recommended interpretation:

- `catalogs` favor `nav`
- `contents` favor `content-list`
- if that fallback is still not safe enough, return `needs-clarification`
- if the selection still depends on fixed content IDs, return `incompatible`

## Incompatible example

Use `incompatible` when the selection cannot be applied safely inside Phase 1A.

```json
{
  "status": "incompatible",
  "reasonCode": "unsupported-block-kind",
  "message": "当前区块不属于第一阶段支持的 nav 或 content-list 类型。"
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
