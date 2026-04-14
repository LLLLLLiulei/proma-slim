# CMS Vue Islands Demo

Temporary self-contained demo package for validating the HTML-first CMS Vue islands preview and SSR export flow.

## Commands

- `bun run --filter='@proma/cms-vue-islands-demo' dev`
- `bun run --filter='@proma/cms-vue-islands-demo' export`

## What it validates

- Author templates stay as plain HTML files under `demo-pages/`
- Preview uses browser-side Vue islands to render `cms-catalog` and `cms-content`
- Preview bootstrap is bundled from the shared component source instead of maintaining a separate handwritten runtime copy
- Mock CMS API latency feels more realistic with a default random `200-800ms` delay per request
- Export renders the same author templates into static HTML under `dist-demo/export/`
- The exported HTML no longer depends on Vue runtime or browser-side CMS requests to show content

## Demo pages

- `basic-navigation.html`: root `cms-catalog` navigation
- `news-list.html`: `cms-content` list with and without thumbnail image
- `mixed-page.html`: static HTML mixed with both islands
- `perf-many-islands.html`: 14-island performance page for preview/export comparison

## Preview flow

1. Run `bun run --filter='@proma/cms-vue-islands-demo' dev`
2. Open `http://localhost:4311/`
3. Compare:
   - `preview` for CSR islands rendering
   - `author` for the original author HTML
   - `source` for raw source text

## Export flow

1. Run `bun run --filter='@proma/cms-vue-islands-demo' export`
2. Open files from `packages/cms-vue-islands-demo/dist-demo/export/`
3. If the preview server is running, use the `export` links from `http://localhost:4311/`
