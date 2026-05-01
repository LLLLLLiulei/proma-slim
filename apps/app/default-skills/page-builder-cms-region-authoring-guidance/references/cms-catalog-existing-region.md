# Existing `cms-catalog` Regions

## Read This When

The current target component is `cms-catalog`.

## Field Discipline

- Use `item.id` as the normal `:key`.
- Use `item.name` for the visible catalog label.
- Use `item.path` for catalog navigation links.
- Guard `item.logoUrl` before rendering an optional catalog image.
- Use `item.children` only when the current structure explicitly needs nested catalogs.

Do not guess aliases such as `item.url` or `item.link`.

## Ordinary Edit Pattern

In ordinary flow, keep the current binding query props unchanged and rewrite only the slot content or compatible shell.

```html
<cms-catalog site-id="14" level="children" parent-id="7">
  <template v-slot:default="{ items }">
    <ul class="catalog-nav">
      <li v-for="item in items" :key="item.id">
        <a :href="item.path" target="_blank" rel="noopener noreferrer">{{ item.name }}</a>
      </li>
    </ul>
  </template>
</cms-catalog>
```

If the user wants another parent catalog, another fixed id set, or another count/query behavior, escalate to the confirmed CMS flow instead of editing the binding props directly.
