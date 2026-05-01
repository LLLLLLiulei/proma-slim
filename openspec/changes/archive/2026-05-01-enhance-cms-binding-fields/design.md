## Context

The current CMS binding data path exposes stable authoring fields (`item.path`, `item.logoUrl`, `item.publishUrl`, `item.listLogoUrl`) but some of those fields are populated from incomplete or lower-priority upstream data. Live read-only probing with the configured CMS showed that `/api/catalogsTree?siteID=1` returns hierarchy fields (`ID`, `parentID`, `siteID`, `name`, `children`) but does not return `logoFile`, `listLink`, `link`, `url`, or `path`. The authoritative catalog metadata endpoint `/api/catalogs?siteID=1&level=All` does return `logoFile`, `listLink`, `link`, `siteID`, `path`, and `url`, while `/api/catalogs/{id}/contents` returns content `logoFile`, `link`, `url`, and `catalogID`.

The CMS `baseUrl` and a CMS site's `url` are different concepts and must not be conflated. `baseUrl` is the slim API call base URL used by the host to call endpoints such as `/api/sites`, `/api/catalogsTree`, `/api/catalogs`, `/api/catalogs/{id}/contents`, and token endpoints. A site `url` from `/api/sites` is the published/access URL for a specific CMS site and is the correct base for that site's relative published resources, such as relative `logoFile` paths.

This creates a trust-boundary problem: the browsing tree is suitable for hierarchy, but not for authoring-ready catalog link/image fields. The implementation must enrich normalized CMS records at the host read layer while preserving the existing author-facing field names so current generated CMS templates and validators remain compatible.

## Goals / Non-Goals

**Goals:**
- Preserve current `cms-catalog` and `cms-content` props and slot field names.
- Populate catalog cover and link fields from `/api/catalogs` metadata while retaining `/api/catalogsTree` hierarchy behavior where possible.
- Populate content cover and link fields from `/api/catalogs/{id}/contents` with the requested source priority.
- Resolve relative cover image paths against the selected record's site URL from `/api/sites`, with safe fallbacks for missing or invalid site URLs.
- Keep CMS `baseUrl` limited to API access and fallback URL resolution; do not treat it as the default published-site URL.
- Keep browser/runtime islands behind host-managed CMS proxy paths and avoid exposing CMS credentials in page templates.
- Update contract metadata and skills so models use declarative `<a href>` links with canonical fields instead of guessed aliases or click events.

**Non-Goals:**
- Do not introduce new authoring fields such as `item.link`, `item.url`, `item.coverUrl`, or `item.logoFile`.
- Do not change the CMS selection result protocol or current `cms-catalog` / `cms-content` source props.
- Do not require production CMS images to use development-only HTTP Basic Auth.
- Do not replace the entire CMS browser UX or add lazy tree loading in this change.
- Do not rely on CMS preview-token URLs as the canonical representation of relative `logoFile` values.

## Decisions

### Decision: Keep canonical authoring field names and change only their source semantics

`cms-catalog` continues to expose `item.path` and `item.logoUrl`; `cms-content` continues to expose `item.publishUrl` and `item.listLogoUrl`. The change updates what those fields mean:

- catalog `path`: `listLink ?? link ?? url ?? path`
- catalog `logoUrl`: `logoFile ?? logoSrc ?? logoUrl ?? logo`, resolved as a display image URL
- content `publishUrl`: `link ?? url ?? publishUrl`
- content `listLogoUrl`: `logoFile ?? listLogo`, resolved as a display image URL

Rationale: adding new fields would require widening shared types, validator allowlists, ViewModels, default skills, and existing tests while leaving old generated templates on the old names. Updating semantics keeps compatibility and focuses the change on data correctness.

Alternative considered: add explicit `linkUrl` / `coverUrl` fields. This is clearer semantically but increases rollout risk and requires a broader migration plan for validators and authoring guidance.

### Decision: Enrich catalog tree records from `/api/catalogs` metadata

The host read layer should not expect `/api/catalogsTree` to provide authoring-ready catalog link/image metadata. For normal catalog browsing, it may keep using `/api/catalogsTree` for hierarchy but must supplement records with metadata from `/api/catalogs?level=All` keyed by catalog id. For fixed catalog ids, the existing exact-id `/api/catalogs` reads can directly provide the required metadata.

Rationale: live probing confirmed that `/api/catalogsTree` lacks the required fields, while `/api/catalogs` contains them. Keeping the tree endpoint for hierarchy minimizes UI behavior changes; adding metadata enrichment is more conservative than replacing the tree source outright.

Alternative considered: build the whole tree only from `/api/catalogs`. This is feasible because `/api/catalogs` includes `parentID`, but it changes the tree source more broadly and risks subtle ordering/hierarchy regressions.

### Decision: Resolve relative cover images with site URL context

The gateway should load site summaries when a CMS data request needs relative image URL resolution. It should resolve a record's relative `logoFile` against the matching site URL (`record.siteID` / query `siteId`), preserve absolute `http(s)` URLs as-is, and fall back to existing CMS `baseUrl` behavior only when site URL context is unavailable or invalid. This rule applies to catalog lists, fixed-id catalog reads, catalog detail reads, and content list reads.

Rationale: the CMS API already exposes site `url`, and user-facing published assets are represented relative to the site, not necessarily the `/manager` API base URL. The configured CMS `baseUrl` exists to reach the slim API, not to describe where a site's published pages or resources are served. Live probing also showed that development HTTP Basic Auth can make direct image access return 401; this is an environment-specific access layer and must not change the canonical URL mapping.

Alternative considered: resolve all relative paths against CMS `baseUrl`. This is current behavior but produces `/manager/upload/...` style URLs and does not match the published site URL requirement.

### Decision: Proxy both catalog and content cover images in browser runtime

Browser preview/runtime clients should rewrite optional CMS cover image URLs for both content and catalog records through the host-managed CMS asset proxy path. This keeps islands from directly holding CMS credentials and makes content and catalog image handling consistent.

Rationale: the current browser client already rewrites content `listLogoUrl`; catalog `logoUrl` needs the same treatment once catalog image fields are reliably populated.

Alternative considered: leave catalog images unproxied. This can work in production if images are public, but it would make catalog and content behavior inconsistent and would bypass the existing host-managed asset path.

### Decision: Document declarative links as the default authoring pattern

Default skills and authoring contract metadata should recommend `<a :href="..." target="_blank" rel="noopener noreferrer">` for catalog/content names in lists, navigation, and image-text cards where opening a CMS destination is expected. They must continue to forbid guessed aliases (`item.link`, `item.url`) and imperative click navigation.

Rationale: the validator already rejects raw inline events and unsupported fields; the guidance should explicitly point models to the safe declarative path.

Alternative considered: enforce `target="_blank"` in validation. That would be too strict for existing templates and local in-page designs, so this change keeps it as guidance rather than a blocking rule.

## Risks / Trade-offs

- [Extra CMS requests for site/catalog metadata] → Load site metadata only when needed for relative image resolution, and reuse results within a single gateway operation; keep CMS HTTP responses `no-store` to preserve realtime data semantics.
- [Catalog tree and metadata records disagree] → Use tree records for hierarchy and metadata records for display/link fields; fixed-id reads use exact metadata directly.
- [Some upstream content links are empty] → Preserve empty normalized link fields instead of inventing URLs; guidance can guard or use fallback anchors where needed.
- [Development Basic Auth causes image 401] → Treat it as an environment access constraint; do not encode Basic Auth into production URL semantics.
- [Skill docs drift from contract] → Update shared contract tests and skill doc tests alongside implementation.

## Migration Plan

1. Update CMS gateway normalization to attach site URL context and enrich catalog tree items with `/api/catalogs` metadata.
2. Adjust catalog/content link and cover image priority while keeping existing field names and types.
3. Apply the same site URL resolver to catalog detail reads so detail-panel `logoUrl` behavior does not diverge from catalog list behavior.
4. Update browser CMS runtime image rewriting so catalog `logoUrl` and content `listLogoUrl` both use the host proxy path.
5. Update shared authoring contract descriptions and default skill references for field semantics and declarative link guidance.
6. Add focused tests for live-observed shapes: tree without metadata, metadata with `logoFile/listLink/link`, catalog detail `logoFile`, content with `logoFile/link/url`, and relative image resolution against site URL.
7. Rollback strategy: revert the enrichment and priority changes; existing authoring field names remain unchanged, so rollback does not require template migration.

## Open Questions

- None. Development-only Basic Auth on the tested image host is explicitly out of scope for production URL semantics.
