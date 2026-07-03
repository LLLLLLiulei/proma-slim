# Existing `cms-content` Regions

## Read This When

The current target component is `cms-content`.

## Field Discipline

- Use `item.id` as the normal `:key`.
- Use `item.title` as the primary headline.
- Use `item.summary` for excerpt-style copy when the design needs summary text.
- Use `item.publishUrl` for content detail links.
- Guard `item.listLogoUrl` before rendering an optional content list image.
- Guard `item.addedAt` before rendering date metadata.

Do not guess aliases such as `item.url` or `item.link`.

## Ordinary Edit Pattern

In ordinary flow, keep the current binding query props unchanged and rewrite only the slot content or compatible shell.

```html
<cms-content site-id="14" catalog-id="16" page-size="4">
  <template v-slot:default="{ items }">
    <article v-for="item in items" :key="item.id" class="news-card">
      <img v-if="item.listLogoUrl" :src="item.listLogoUrl" :alt="item.title" />
      <h3><a :href="item.publishUrl" target="_blank" rel="noopener noreferrer">{{ item.title }}</a></h3>
      <p>{{ item.summary }}</p>
      <time v-if="item.addedAt">{{ item.addedAt }}</time>
    </article>
  </template>
</cms-content>
```

If the user wants another catalog, another fixed id set, or a different item count/query behavior, escalate to the confirmed CMS flow instead of editing the binding props directly.
