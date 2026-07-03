# `cms-catalog` Authoring

Use this file when `selection.selectionKind = catalogs` or `authoringContext.component = cms-catalog`. Shared slot and Vue boundaries live in [shared-authoring-rules.md](shared-authoring-rules.md).

## When to use `cms-catalog`

- The confirmed CMS selection is a catalog selection.
- The current target block should render navigation or a catalog list.
- The source tag should stay `cms-catalog`, not `cms-content`.

## Supported source modes and props

Allowed props:

- `site-id`
- `ids`
- `level`
- `parent-id`
- `content-type`
- `search-keyword`
- `take`

Source modes:

- `catalogs-by-parent`
  - required props: `site-id`, `level`, `parent-id`
  - use when the CMS browser confirmed child catalogs of a parent
- `catalogs-by-ids`
  - required props: `site-id`, `ids`
  - use when the CMS browser confirmed a fixed catalog set

Only set `take` when the user explicitly requested a catalog count or the current target already depends on that limit.
CMS source ids must come from the confirmed CMS selection. Use positive integer strings such as `"7"`, `"16"`, not semantic aliases such as `root` or `news-root`.
When using `parent-id`, set `level="children"`; do not combine `parent-id` with `level="root"` or omit the level.

## Slot scope

Use an explicit subset of the shared slot scope `{ items, loading, error, empty }`.

## Item fields

- `item.id`: stable identifier; use as the stable `:key`
- `item.name`: visible catalog label
- `item.path`: catalog navigation URL; use `:href="item.path"` for catalog links
- `item.parentId`: parent catalog identifier, or `null` for roots
- `item.logoUrl`: optional catalog image URL; guard before rendering
- `item.hasChild`: whether the catalog has children
- `item.total`: total entries under the catalog; use only when the current design needs a count badge
- `item.contentType`: internal content-type code
- `item.contentTypeName`: visible content-type label when the current structure already includes it
- `item.children`: nested catalog items; only use when the current structure explicitly needs hierarchy

## Recipe: nav

Use this when the target block intent is `nav`.

```html
<cms-catalog site-id="14" level="children" parent-id="7">
  <template v-slot:default="{ items }">
    <ul class="nav-list">
      <li v-for="item in items" :key="item.id">
        <a :href="item.path" target="_blank" rel="noopener noreferrer">{{ item.name }}</a>
      </li>
    </ul>
  </template>
</cms-catalog>
```

## Recipe: catalog-list

Use this when the target block intent is `catalog-list`.

```html
<cms-catalog site-id="14" ids="16,17,18">
  <template v-slot:default="{ items }">
    <section class="catalog-grid">
      <article v-for="item in items" :key="item.id" class="catalog-card">
        <img v-if="item.logoUrl" class="catalog-card__image" :src="item.logoUrl" :alt="item.name">
        <h3>{{ item.name }}</h3>
        <p v-if="item.total > 0">{{ item.total }} items</p>
        <a class="catalog-card__link" :href="item.path" target="_blank" rel="noopener noreferrer">查看栏目</a>
      </article>
    </section>
  </template>
</cms-catalog>
```
