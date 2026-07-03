# `cms-content` Authoring

Use this file when `selection.selectionKind = contents` or `authoringContext.component = cms-content`. Shared slot and Vue boundaries live in [shared-authoring-rules.md](shared-authoring-rules.md).

## When to use `cms-content`

- The confirmed CMS selection is a content selection.
- The current target block should render a content list or a single featured content card.
- The source tag should stay `cms-content`, not `cms-catalog`.

## Supported source modes and props

Allowed props:

- `site-id`
- `ids`
- `catalog-id`
- `keyword`
- `page-index`
- `page-size`

Source modes:

- `contents-by-catalog`
  - required props: `site-id`, `catalog-id`
  - use when the CMS browser confirmed one catalog as the source
  - if authoritative source context is present, treat it as the freshness check for the selected catalog; the current empty state does not invalidate the binding source
- `contents-by-ids`
  - required props: `site-id`, `catalog-id`, `ids`
  - use when the CMS browser confirmed a fixed ordered content set

Only set `page-size` when the user explicitly requested a count or the current target already depends on that count.
CMS source ids must come from the confirmed CMS selection. Use positive integer strings such as `"16"`, `"257"`, not semantic aliases such as `news` or `n-101`.

## Slot scope

Use an explicit subset of the shared slot scope `{ items, loading, error, empty }`.

## Item fields

- `item.id`: stable identifier; use as the stable `:key`
- `item.catalogId`: owning catalog identifier
- `item.title`: primary headline
- `item.summary`: excerpt or preview copy
- `item.publishUrl`: content detail URL; use `:href="item.publishUrl"` for content links
- `item.listLogoUrl`: optional content list image URL; guard before rendering
- `item.addedAt`: optional date/time string; render only when the current design already includes metadata

For date metadata, render `item.addedAt` directly, use a guarded member expression such as `item.addedAt?.slice(0, 10)`, or use Vue-executable safe native expressions such as `new Date(item.addedAt).getDate()` when the design requires date parts. Do not call `getDateDay(item.addedAt)`, `formatDate(item.addedAt)`, `getDateMonthYear`, or any other undeclared project helper.

## Recipe: content-list

Use this when the target block intent is `content-list`.

```html
<cms-content site-id="14" catalog-id="16">
  <template v-slot:default="{ items }">
    <section class="news-list">
      <article v-for="item in items" :key="item.id" class="news-card">
        <img v-if="item.listLogoUrl" class="news-card__image" :src="item.listLogoUrl" :alt="item.title">
        <h3><a :href="item.publishUrl" target="_blank" rel="noopener noreferrer">{{ item.title }}</a></h3>
        <p>{{ item.summary }}</p>
        <time v-if="item.addedAt">{{ item.addedAt }}</time>
      </article>
    </section>
  </template>
</cms-content>
```

## Recipe: featured card

Use this when the current shell is a single highlighted card and the selection still maps to `cms-content`.

```html
<cms-content site-id="14" catalog-id="16" ids="257">
  <template v-slot:default="{ items }">
    <a class="hero-card" :href="items[0]?.publishUrl || '#'" target="_blank" rel="noopener noreferrer">
      <img v-if="items[0]?.listLogoUrl" class="hero-card__image" :src="items[0]?.listLogoUrl" :alt="items[0]?.title || ''">
      <span class="hero-card__title">{{ items[0]?.title }}</span>
      <span class="hero-card__summary">{{ items[0]?.summary }}</span>
    </a>
  </template>
</cms-content>
```
