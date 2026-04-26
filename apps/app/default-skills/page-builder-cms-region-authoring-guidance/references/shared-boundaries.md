# Shared Boundaries

## What This Layer Is For

Use these rules for ordinary edits to an existing CMS region after the host already identified the current target.

## Stable Boundaries

- The existing `cms-catalog` / `cms-content` source tag is the source of truth for that region.
- `workspace-files/index.html` is the authoring source for that region, but preview/export runtime is host-managed and may append CMS runtime behavior outside the saved source HTML.
- The absence of page-wide Vue bootstrap code in `workspace-files/index.html` is not evidence that the existing CMS region cannot render.
- Keep Vue syntax inside the current CMS source tag only. Surrounding non-CMS page regions stay plain HTML/CSS/JS.
- Do not write or preserve runtime-only attrs such as `data-proma-cms-source-id` or `data-proma-cms-island-*`.
- Do not nest a second `cms-catalog` / `cms-content` inside the current CMS slot content.
- Do not add `<script>` or `<style>` inside CMS slot content.
- Do not add page-wide Vue bootstrapping such as `createApp`, `Vue.createApp`, or `app.mount(...)`.

## Safe Ordinary Changes

- restyle the current CMS region
- adjust the slot template structure
- add guards for optional fields
- preserve the compatible outer shell when it still matches the existing binding

## Changes That Must Escalate

- changing query props or source identity props
- changing to another catalog or another content set
- inventing a new CMS region from scratch
- crossing into sibling CMS tags or unrelated sibling blocks
