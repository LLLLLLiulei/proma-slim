# CMS Apply Contract Examples

Use these examples when interpreting or producing the `cms-binding-apply` contract.

## Catalogs to nav

### Input

```json
{
  "version": 2,
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
    "selector": "#main-nav",
    "parentBlockSelector": "#main-nav",
    "editBoundary": "block"
  },
  "targetBlock": {
    "selector": "#main-nav",
    "blockTypeHint": "nav"
  },
  "selection": {
    "version": 3,
    "siteId": "14",
    "targetSelection": {
      "kind": "block",
      "selector": "#main-nav",
      "parentBlockSelector": "#main-nav",
      "editBoundary": "block"
    },
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
  "version": 2,
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
    "version": 3,
    "siteId": "14",
    "targetSelection": {
      "kind": "block",
      "selector": "#latest-news",
      "parentBlockSelector": "#latest-news",
      "editBoundary": "block"
    },
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

## Recommended authoring shape

Use `cms-catalog` / `cms-content` as the source root of the dynamic region, and keep the main list or navigation container inside the slot.

```html
<cms-catalog site-id="14" level="root">
  <template v-slot:default="{ items, loading, error, empty }">
    <ul class="nav-list">
      <li v-for="item in items" :key="item.id">
        <a :href="item.path">{{ item.name }}</a>
      </li>
    </ul>
  </template>
  <template v-slot:empty="{ items, loading, error, empty }">
    <nav class="nav-list nav-list--empty">暂无栏目</nav>
  </template>
</cms-catalog>

<cms-content site-id="14" catalog-id="news" page-size="6">
  <template v-slot:default="{ items, loading, error, empty }">
    <section class="news-list">
      <article v-for="item in items" :key="item.id">
        <h3>{{ item.title }}</h3>
      </article>
    </section>
  </template>
  <template v-slot:error="{ items, loading, error, empty }">
    <section class="news-list news-list--error">{{ error.message }}</section>
  </template>
</cms-content>
```

## Recommended apply tool payload shape

When calling `mcp__cms__apply_cms_binding`, pass slot inner content in `templateBody`, `emptyTemplate`, and `errorTemplate`. Do not include outer `<template ...>` wrappers there because the tool writes those wrappers for you.

```json
{
  "targetSelection": {
    "kind": "cms-island",
    "selector": "#latest-news > cms-content:nth-of-type(1)",
    "parentBlockSelector": "#latest-news",
    "component": "cms-content",
    "editBoundary": "source-atomic"
  },
  "targetBlock": {
    "selector": "#latest-news"
  },
  "kind": "content-list",
  "source": {
    "siteId": "14",
    "catalogId": "news",
    "pageSize": 6
  },
  "templateBody": "<section class=\"news-list\"><article v-for=\"item in items\" :key=\"item.id\">{{ item.title }}</article></section>",
  "emptyTemplate": "<section class=\"news-list news-list--empty\">暂无内容</section>",
  "errorTemplate": "<section class=\"news-list news-list--error\">{{ error?.message }}</section>"
}
```

## Anti-pattern: major container outside the CMS slot

Avoid leaving the main container outside and using the slot only for scattered item nodes.

```html
<ul class="nav-list">
  <cms-catalog site-id="14" level="root">
    <template v-slot:default="{ items }">
      <li v-for="item in items" :key="item.id">
        <a :href="item.path">{{ item.name }}</a>
      </li>
    </template>
  </cms-catalog>
</ul>

<section class="news-list">
  <cms-content site-id="14" catalog-id="news" page-size="6">
    <template v-slot:default="{ items }">
      <article v-for="item in items" :key="item.id">
        <h3>{{ item.title }}</h3>
      </article>
    </template>
  </cms-content>
</section>
```

## Anti-pattern: outer slot wrapper inside templateBody

Avoid passing the whole `<template v-slot:default>` wrapper into `templateBody`. The formal tool already adds that wrapper.

```html
<template #default="{ items, loading, error, empty }">
  <section class="news-list">
    <article v-for="item in items" :key="item.id">
      <h3>{{ item.title }}</h3>
    </article>
  </section>
</template>
```

## Fixed content selection is incompatible

Fixed content IDs are outside the current runtime capability because `apply_cms_binding` only supports catalog-driven `cms-content` queries.

### Input

```json
{
  "version": 2,
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
    "version": 3,
    "siteId": "14",
    "targetSelection": {
      "kind": "block",
      "selector": "#latest-news",
      "parentBlockSelector": "#latest-news",
      "editBoundary": "block"
    },
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

## Missing selection.siteId is malformed

New or rebound CMS tags may only be produced from the controlled CMS browser selection flow, and that flow must provide `selection.siteId`.

```json
{
  "status": "incompatible",
  "reasonCode": "malformed-payload",
  "message": "selection.siteId 缺失，不能继续生成或重绑 cms-* 标签。"
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
  "version": 2,
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
    "selector": "#latest-list",
    "parentBlockSelector": "#latest-list",
    "editBoundary": "block"
  },
  "targetBlock": {
    "selector": "#latest-list"
  },
  "selection": {
    "version": 3,
    "siteId": "14",
    "targetSelection": {
      "kind": "block",
      "selector": "#latest-list",
      "parentBlockSelector": "#latest-list",
      "editBoundary": "block"
    },
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

## Controlled creation boundary

Use the formal CMS selection flow when a page needs a new CMS source tag or an existing CMS source tag must be rebound.

- Allowed:
  - confirmed CMS browser selection
  - structured `cms-binding-apply` input
  - `ready` decision
  - `mcp__cms__apply_cms_binding`
- Not allowed:
  - ordinary page generation inventing a new `cms-catalog` / `cms-content`
  - ordinary iteration silently changing `site-id`, `catalog-id`, `page-size`, or similar query props

If the page already contains CMS tags, ordinary iteration may still adjust slot templates, internal structure, and styles inside the existing CMS region.

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
