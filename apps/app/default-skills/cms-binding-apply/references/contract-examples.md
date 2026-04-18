# CMS Apply Contract Examples

Use these examples when interpreting or producing the `cms-binding-apply` contract.

## Catalogs to nav

### Input

```json
{
  "version": 3,
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
    "version": 5,
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
    "sourceType": "catalogs-by-parent",
    "selectionMode": "children-of-parent",
    "parentCatalogId": "news-root",
    "snapshot": {
      "parentCatalog": {
        "id": "news-root",
        "name": "新闻中心"
      }
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

## Catalogs to catalog-list

### Input

```json
{
  "version": 3,
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
    "targetSelection": {
      "kind": "block",
      "selector": "#featured-catalogs",
      "parentBlockSelector": "#featured-catalogs",
      "editBoundary": "block"
    },
    "targetBlock": {
      "selector": "#featured-catalogs"
    },
    "selectionKind": "catalogs",
    "sourceType": "catalogs-by-ids",
    "selectionMode": "fixed-items",
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
  "targetBlockKind": "catalog-list",
  "supportedRenderModes": ["replace-current"],
  "renderMode": "replace-current",
  "applyStrategy": "replace-current",
  "mappingKind": "catalog-content-list",
  "toolKind": "catalog-nav"
}
```

## Fixed contents to content-list

### Input

```json
{
  "version": 3,
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
    "sourceType": "contents-by-ids",
    "selectionMode": "fixed-items",
    "catalogId": "news",
    "contentIds": ["n-101", "n-102", "n-103"],
    "snapshot": {
      "contents": [
        { "id": "n-101", "title": "标题 1" },
        { "id": "n-102", "title": "标题 2" }
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
<cms-catalog site-id="14" ids="news,products,about">
  <template v-slot:default="{ items, loading, error, empty }">
    <ul class="nav-list">
      <li v-for="item in items" :key="item.id">
        <a :href="item.link || item.url || item.path">{{ item.name }}</a>
      </li>
    </ul>
  </template>
  <template v-slot:empty="{ items, loading, error, empty }">
    <nav class="nav-list nav-list--empty">暂无栏目</nav>
  </template>
</cms-catalog>

<cms-content site-id="14" catalog-id="news" ids="n-101,n-102,n-103">
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

## Recommended: preserve the current target shell when compatible

If the selected block already has a strong visual structure, keep that shell and only replace its data source.

```html
<cms-content site-id="14" catalog-id="news" ids="n-101">
  <template v-slot:default="{ items, loading, error, empty }">
    <a class="hero-card" :href="items[0]?.link || items[0]?.url || '#'">
      <img class="hero-card__image" :src="items[0]?.listLogoUrl" :alt="items[0]?.title || ''">
      <span class="hero-card__title">{{ items[0]?.title }}</span>
    </a>
  </template>
</cms-content>
```

## Recommended apply tool payload shape

When calling `mcp__cms__apply_cms_binding`, pass slot inner content in `templateBody`, `emptyTemplate`, and `errorTemplate`. Do not include outer `<template ...>` wrappers there because the tool writes those wrappers for you.

```json
{
  "targetSelection": {
    "kind": "cms-island",
    "sourceId": "cms-src-latest-news",
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
    "ids": ["n-101", "n-102", "n-103"]
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
  <cms-catalog site-id="14" ids="news,products,about">
    <template v-slot:default="{ items }">
      <li v-for="item in items" :key="item.id">
        <a :href="item.link || item.url || item.path">{{ item.name }}</a>
      </li>
    </template>
  </cms-catalog>
</ul>

<section class="news-list">
  <cms-content site-id="14" catalog-id="news" ids="n-101,n-102,n-103">
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

## Anti-pattern: append a new CMS block beside the selected target

Avoid leaving the original selected block in place and inserting a second CMS-driven sibling beside it.

```html
<div class="hero-card">
  <img src="/static/banner.jpg" alt="">
</div>
<cms-content site-id="14" catalog-id="news" ids="n-101">
  <template v-slot:default="{ items }">
    <section class="news-list">
      <article>{{ items[0]?.title }}</article>
    </section>
  </template>
</cms-content>
```

Instead, replace the selected target in place and reuse its shell when compatible.

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
    "kind": "target-block-intent",
    "question": "当前区块更适合呈现为导航条还是栏目列表？",
    "options": [
      { "label": "导航条", "value": "nav" },
      { "label": "栏目列表", "value": "catalog-list" }
    ]
  }
}
```

`targetSelection.sourceId` is the stable source identity when the current CMS region already has one. `targetSelection.selector` still travels with the payload as compatibility context and for legacy pages, but the downstream write path must not use it to guess a different CMS region.

If an older page still has no `sourceId`, the payload may omit it temporarily and fall back to the exact current selector. That legacy selector fallback is only for the already-selected target and must fail closed on ambiguity instead of widening the edit scope.

New or rebound CMS writes should preserve an existing `data-proma-cms-source-id` when replacing a CMS source tag, or let the formal apply tool generate one when binding a previously static region.

Never place `<script>` or `<style>` inside `templateBody`, `emptyTemplate`, or `errorTemplate`.

## Missing blockTypeHint fallback

When `targetBlock.blockTypeHint` is absent, keep the decision conservative instead of failing immediately.

```json
{
  "version": 3,
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
    "version": 5,
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
    "selectionKind": "catalogs",
    "sourceType": "catalogs-by-ids",
    "selectionMode": "fixed-items",
    "catalogIds": ["news", "events"],
    "snapshot": {
      "catalogs": [
        { "id": "news", "name": "新闻" },
        { "id": "events", "name": "活动" }
      ]
    }
  }
}
```

Recommended interpretation:

- `contents` favor `content-list`
- `catalogs` may resolve to `nav` or `catalog-list`
- if that fallback is still not safe enough, return `needs-clarification` with one short structured question

## Controlled creation boundary

Use the formal CMS selection flow when a page needs a new CMS source tag or an existing CMS source tag must be rebound.

- Allowed:
  - confirmed CMS browser selection
  - structured `cms-binding-apply` input
  - `ready` decision
  - `mcp__cms__apply_cms_binding`
- Not allowed:
  - ordinary page generation inventing a new `cms-catalog` / `cms-content`
  - ordinary iteration silently changing `site-id`, `catalog-id`, `ids`, `page-size`, or similar binding props

If the page already contains CMS tags, ordinary iteration may still adjust slot templates, internal structure, and styles inside the existing CMS region.

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
