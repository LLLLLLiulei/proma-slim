## 1. CMS Gateway Data Normalization

- [x] 1.1 Add a per-operation site URL lookup helper in `CmsGateway` that reads `/api/sites`, maps site id to normalized site URL, and does not introduce persistent stale CMS list/content caching.
- [x] 1.2 Add cover-image URL resolution that preserves absolute `http(s)` URLs, resolves relative `logoFile` values against the matching site `url`, and falls back to existing CMS `baseUrl` behavior only when site URL context is unavailable; document that `baseUrl` is the slim API call base URL, not the published site access URL.
- [x] 1.3 Enrich normal `listCatalogs` results by combining `/api/catalogsTree` hierarchy records with `/api/catalogs?level=All` metadata keyed by catalog id.
- [x] 1.4 Update catalog normalization so `logoUrl` prioritizes upstream `logoFile` and `path` prioritizes `listLink`, then `link`, then `url`, then legacy `path`.
- [x] 1.5 Update content normalization so `listLogoUrl` prioritizes upstream `logoFile` and `publishUrl` prioritizes `link`, then `url`, then legacy `publishUrl`.
- [x] 1.6 Apply the same site URL based `logoFile` resolution to catalog detail reads; keep CMS `baseUrl` for slim API calls and fallback resolution only.
- [x] 1.7 Preserve fixed-id catalog and content behavior: keep input order, drop invalid records, and apply the same enriched field semantics.

## 2. Runtime And Proxy Behavior

- [x] 2.1 Update the browser CMS runtime client to rewrite catalog `logoUrl` values through the CMS asset proxy, including nested `children`.
- [x] 2.2 Keep content `listLogoUrl` proxy rewriting behavior and prevent double-wrapping URLs that already point at the proxy endpoint.
- [x] 2.3 Verify server-side CMS runtime/export paths continue to consume raw normalized URLs without exposing CMS credentials in author templates.

## 3. Authoring Contract And Skills

- [x] 3.1 Update shared CMS authoring contract metadata for `item.path`, `item.logoUrl`, `item.publishUrl`, and `item.listLogoUrl` to describe canonical field meaning and usage without exposing upstream priority details to agents.
- [x] 3.2 Add or confirm `cms-catalog` recommended image field metadata for `logoUrl` while preserving current field names and validator allowlists.
- [x] 3.3 Update `cms-binding-apply` catalog/content references to recommend canonical `<a :href>` links, optional image guards, and new-window safe attributes where appropriate.
- [x] 3.4 Update ordinary CMS region authoring guidance with the same canonical field semantics and avoid `item.link` / `item.url` / click-event navigation.

## 4. Tests And Verification

- [x] 4.1 Add or update `cms-gateway` unit tests for tree-without-metadata plus `/api/catalogs` enrichment, catalog link priority, and catalog relative `logoFile` resolution against site URL.
- [x] 4.2 Add or update `cms-gateway` unit tests for content `logoFile` / `link` / `url` priority and request-site URL resolution.
- [x] 4.3 Add or update `cms-gateway` and page-builder CMS route tests for catalog detail `logoFile` resolution against site URL, explicitly distinguishing API `baseUrl` from site `url`.
- [x] 4.4 Add or update page-builder CMS HTTP route tests to assert enriched normalized catalog/content payloads and `cache-control: no-store` behavior.
- [x] 4.5 Add or update browser CMS runtime tests for catalog `logoUrl` proxy rewriting, nested child rewriting, and no double proxy wrapping.
- [x] 4.6 Add or update shared contract and default skill doc tests for field metadata, recommended image/link fields, and declarative anchor guidance.
- [x] 4.7 Run focused test suites covering CMS gateway, page-builder CMS routes, shared authoring contract, CMS rendering runtime, and default CMS skill docs.
