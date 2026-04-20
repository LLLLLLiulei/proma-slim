# CMS Apply Contract Examples

Use these examples when interpreting or producing the `cms-binding-apply` contract.
Keep the main skill focused on the current-turn decision path; use this file for payload shapes, authoring examples, and anti-patterns.
Treat the canonical CMS authoring contract as the source of truth for supported props, slot scope, item fields, and forbidden structures.
Real auto-handoff payloads also carry `authoringContext` and `targetSnapshot`; `targetSnapshot.targetOuterHtml` is the authoritative authoring-source snippet for the current target.

`authoringContext.itemFieldMeta` is the semantic reference for each field:

- use it to understand field meaning
- use it to see whether a field is optional
- use it to choose the correct link/image/date field instead of guessing aliases

## Catalogs to nav

### Input

```json
{
  "version": 6,
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
  "version": 6,
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
  "version": 6,
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
        <a :href="item.path">{{ item.name }}</a>
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

## Event binding guardrails

Keep CMS slot interaction declarative.

- For catalog navigation, use `:href="item.path"`.
- For content navigation, use `:href="item.publishUrl"`.
- If the whole visual card should be clickable, wrap the card with the anchor instead of adding `@click` navigation on an outer wrapper.
- Do not write raw HTML inline event attributes such as `onclick`, `onerror`, or `onload`.
- Do not use imperative DOM scripting such as `window.location.href = ...`, `document.querySelector(...)`, or `element.style.display = ...` inside CMS slot templates.

Prefer:

```html
<cms-content site-id="14" catalog-id="news">
  <template v-slot:default="{ items }">
    <section class="news-list">
      <a
        v-for="item in items"
        :key="item.id"
        class="news-card"
        :href="item.publishUrl"
      >
        <img v-if="item.listLogoUrl" :src="item.listLogoUrl" :alt="item.title">
        <div v-else class="news-card__placeholder">{{ item.title?.charAt(0) || '?' }}</div>
        <h3>{{ item.title }}</h3>
      </a>
    </section>
  </template>
</cms-content>
```

Avoid:

```html
<li v-for="item in items" :key="item.id" @click="item.publishUrl && window.location.href=item.publishUrl">
  <img :src="item.listLogoUrl" onerror="this.style.display='none'">
</li>
```

## Item field semantics to respect

- `cms-catalog`
  - `item.path`: catalog link field
  - `item.logoUrl`: optional image field, guard before rendering
  - `item.children`: nested catalog list, only use when the current structure explicitly needs hierarchy
- `cms-content`
  - `item.publishUrl`: content detail link field
  - `item.listLogoUrl`: optional list image field, guard before rendering
  - `item.addedAt`: optional date/time string, guard before rendering

## Recommended: preserve the current target shell when compatible

If the selected block already has a strong visual structure, keep that shell and only replace its data source.

```html
<cms-content site-id="14" catalog-id="news" ids="n-101">
  <template v-slot:default="{ items, loading, error, empty }">
    <a class="hero-card" :href="items[0]?.publishUrl || '#'">
      <img v-if="items[0]?.listLogoUrl" class="hero-card__image" :src="items[0].listLogoUrl" :alt="items[0]?.title || ''">
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
    "htmlPath": "index.html",
    "sourceSelector": "#latest-news > cms-content:nth-of-type(1)",
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
        <a :href="item.path">{{ item.name }}</a>
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

## Anti-pattern: self-managed Vue runtime or page-wide mount

Do not turn page-builder authoring into a self-managed Vue app just to render CMS data. Vue runtime and bootstrap are host-managed, and Vue authoring belongs only inside the current `cms-*` source tag's slot templates.

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script>
  const app = Vue.createApp({})
  app.mount(document.body)
</script>
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
    "kind": "target-block-intent",
    "question": "当前区块更适合呈现为导航条还是栏目列表？",
    "options": [
      { "label": "导航条", "value": "nav" },
      { "label": "栏目列表", "value": "catalog-list" }
    ]
  }
}
```

For `cms-island`, the formal source identity is the runtime locator tuple `htmlPath + sourceSelector + parentBlockSelector + component`. Pass that locator through unchanged; do not invent `sourceId`, do not rewrite the selector from rendered descendants, and do not guess another CMS region.

The formal tool may still infer a source-atomic replacement when `targetSelection` is accidentally omitted but `targetBlock.selector` already points to a `cms-*` tag. Treat that only as a safety net, not as the normal contract.

New or rebound CMS writes must not persist `data-proma-cms-source-id` or `data-proma-cms-island-*` into authoring HTML. Use `targetSnapshot.targetOuterHtml` as the authoring-source fact for what is currently selected, instead of inferring structure from preview DOM descendants.

Never place `<script>` or `<style>` inside `templateBody`, `emptyTemplate`, or `errorTemplate`.

## Missing blockTypeHint fallback

When `targetBlock.blockTypeHint` is absent, keep the decision conservative instead of failing immediately.

```json
{
  "version": 5,
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
