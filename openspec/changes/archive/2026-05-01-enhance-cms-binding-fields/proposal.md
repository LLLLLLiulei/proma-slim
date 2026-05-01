## Why

CMS 栏目与内容绑定当前暴露的封面图和跳转链接不完整或来源不准确：真实环境中 `/api/catalogsTree` 只提供树结构，不能提供栏目 `logoFile`、`listLink`、`link` 或 `path`，导致栏目绑定后的导航、列表和图文列表无法稳定渲染图片与链接。现在需要把 CMS slim API 中已存在的栏目/内容字段正确归一化到 page-builder 的 canonical CMS authoring surface，并同步指导模型使用声明式 `<a href>` 链接。

## What Changes

- Enrich CMS catalog reads so normalized catalogs expose link and cover data from authoritative catalog metadata, not only from `/api/catalogsTree` tree nodes.
- Normalize catalog cover image from upstream `logoFile` and catalog link from `listLink` / `link` while preserving the existing authoring field names `item.logoUrl` and `item.path`.
- Normalize content cover image from upstream `logoFile` and content link from `link` / `url` while preserving the existing authoring field names `item.listLogoUrl` and `item.publishUrl`.
- Resolve relative CMS cover image paths against the corresponding site `url` from `/api/sites`; keep absolute `http(s)` URLs as-is and use existing CMS `baseUrl` behavior only as a fallback when site URL is unavailable or invalid. CMS `baseUrl` is the slim API call base URL, while site `url` is the published/access URL of one CMS site.
- Update CMS authoring contract metadata and default skill guidance so catalog/content lists, navigation bars, and image-text lists prefer `<a href>` with new-window attributes where appropriate, rather than click-event navigation.
- Ensure browser preview/runtime handling supports proxied rendering of catalog and content cover images without exposing raw CMS credentials to islands.
- No breaking change to author-facing field names or `cms-catalog` / `cms-content` props.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `page-builder-cms-browser-dialog`: CMS browsing data returned through the host-managed read path must expose enriched normalized catalog and content cover/link fields derived from the slim CMS APIs.
- `page-builder-cms-authoring-contract`: Canonical field metadata must define the field meaning and usage for `item.path`, `item.logoUrl`, `item.publishUrl`, and `item.listLogoUrl`, while keeping upstream normalization priority as a gateway implementation detail.
- `page-builder-cms-apply-skill`: Confirmed CMS apply guidance must recommend declarative `<a href>` links for catalog/content names and use the enriched canonical fields rather than guessed aliases or click handlers.
- `page-builder-cms-region-authoring-guidance`: Ordinary existing CMS region guidance must describe the same enriched canonical fields and link-authoring rules.
- `page-builder-cms-rendering-core`: CMS runtime/viewmodel behavior must preserve enriched catalog/content URL fields and proxy optional cover images consistently in browser preview/runtime paths.

## Impact

- Affected code: `apps/app/src/main/lib/cms-gateway.ts`, CMS gateway tests, page-builder CMS HTTP route tests, shared CMS authoring contract/types tests, browser CMS runtime client tests, default CMS skill docs/tests.
- Affected systems: page-builder CMS browser, confirmed CMS apply, ordinary CMS region edits, CMS rendering preview/runtime, static export paths that consume normalized CMS data.
- Dependencies: existing CMS slim API endpoints `/api/sites`, `/api/catalogsTree`, `/api/catalogs`, and `/api/catalogs/{id}/contents`.
- Non-goals: adding new authoring field names such as `item.link` / `item.url`, changing the CMS selection result protocol, changing production CMS authentication, or relying on development-only HTTP Basic Auth for image access.
