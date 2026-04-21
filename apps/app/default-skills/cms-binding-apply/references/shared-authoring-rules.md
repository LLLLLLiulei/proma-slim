# Shared CMS Authoring Rules

Use this file for the boundaries that apply to both `cms-catalog` and `cms-content`. Keep component-specific props, fields, and recipes in the component authoring files.

## Shared slot contract

- `templateBody`, `emptyTemplate`, and `errorTemplate` must contain slot inner content only.
- Do not pass an outer `<template v-slot:...>` wrapper or an outer `cms-*` tag inside those fields.
- The generated CMS component exposes the unified slot scope `{ items, loading, error, empty }`; declare the slot scope explicitly as a subset of that shape.
- Keep major HTML containers inside the slot so the dynamic region has one coherent root structure per state.
- Keep Vue authoring inside the current `cms-*` source tag only.
- Do not nest a second `cms-catalog` / `cms-content` inside CMS slot content. One CMS source tag should own one dynamic region.

Prefer:

```html
<cms-content site-id="14" catalog-id="news">
  <template v-slot:default="{ items, loading, error, empty }">
    <section class="news-list">
      <article v-for="item in items" :key="item.id">
        <h3>{{ item.title }}</h3>
      </article>
    </section>
  </template>
</cms-content>
```

## HTML-first and Vue boundary

- Keep page-builder authoring HTML-first.
- `cms-catalog` / `cms-content` are host-managed source tags.
- Do not author Vue runtime/importmap/bootstrap assets.
- Do not propose self-managed Vue runtime or page-wide Vue mount.
- Do not add `v-*`, `@*`, `:` bindings, or `{{ ... }}` to surrounding non-CMS shell HTML.
- Do not write raw HTML inline event attributes such as `onclick`, `onerror`, or `onload`.
- Do not use imperative DOM mutation such as `window.location`, `document.querySelector(...)`, or `element.style.display = ...` inside CMS slot content.
- Do not place `<script>` or `<style>` inside CMS slot content.

## Apply payload boundary

- Treat the operation as an in-place replacement of the selected target.
- Do not append a sibling `cms-catalog` / `cms-content` beside the selected target.
- `templateBody`, `emptyTemplate`, and `errorTemplate` should hold the full dynamic region content for their state, but not the outer slot wrapper.
- If `targetSelection.kind === cms-island`, preserve the runtime locator tuple `htmlPath + sourceSelector + parentBlockSelector + component`.
- Only the confirmed CMS browser selection flow may create a new `cms-catalog` / `cms-content` or rebind an existing one.
- Ordinary page generation or ordinary page iteration must not invent new `cms-*` tags on their own.

## Preserve the current target shell when compatible

If the selected block already has a strong visual structure, keep that shell and only replace its data source.

```html
<cms-content site-id="14" catalog-id="news" ids="n-101">
  <template v-slot:default="{ items, loading, error, empty }">
    <a class="hero-card" :href="items[0]?.publishUrl || '#'">
      <img
        v-if="items[0]?.listLogoUrl"
        class="hero-card__image"
        :src="items[0].listLogoUrl"
        :alt="items[0]?.title || ''"
      >
      <span class="hero-card__title">{{ items[0]?.title }}</span>
    </a>
  </template>
</cms-content>
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
```

## Anti-pattern: outer slot wrapper inside templateBody

Avoid passing the whole `<template v-slot:default>` wrapper into `templateBody`. The formal apply tool already adds that wrapper.

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

## Anti-pattern: nested CMS islands

Do not place a second `cms-catalog` / `cms-content` inside the slot content of the current CMS source tag.

```html
<cms-content site-id="14" catalog-id="news">
  <template v-slot:default="{ items }">
    <section class="news-list">
      <cms-content site-id="14" catalog-id="events">
        <template v-slot:default="{ items: nestedItems }">
          <article v-for="item in nestedItems" :key="item.id">{{ item.title }}</article>
        </template>
      </cms-content>
    </section>
  </template>
</cms-content>
```

## Anti-pattern: self-managed Vue runtime or page-wide mount

Do not turn page-builder authoring into a self-managed Vue app just to render CMS data.

```html
<script src="https://unpkg.com/vue@3/dist/vue.global.prod.js"></script>
<script>
  const app = Vue.createApp({})
  app.mount(document.body)
</script>
```
