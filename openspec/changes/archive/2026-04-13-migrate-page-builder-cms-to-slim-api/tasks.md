## 1. Configuration and Auth Foundation

- [x] 1.1 Replace CMS host configuration parsing with `baseUrl`, `siteID`, `username`, and `password`, defaulting `siteID` to `1`.
- [x] 1.2 Implement a shared CMS token provider that acquires Bearer tokens from `/api/token`, refreshes them by expiry time, and sanitizes auth failures.

## 2. Slim API Gateway Migration

- [x] 2.1 Rework `CmsGateway` to read catalog trees from `/api/catalogsTree`, fetch catalog metadata from `/api/catalogs`, and assemble catalog detail from slim API responses instead of `/ui/*` endpoints.
- [x] 2.2 Rework CMS content reads to use `/api/catalogs/{id}/contents`, preserve 0-based pagination, and remove old UI-only query parameters and response normalization branches.
- [x] 2.3 Keep `/api/page-builder/cms/assets` in place while changing resource proxy fetches to stop sending auth headers and preserve original query strings.

## 3. Shared Contracts and Consumers

- [x] 3.1 Shrink shared CMS content types to the slim API base summary fields and remove `shape`, `assetCounts`, and `assetHints` from shared contracts.
- [x] 3.2 Update CMS runtime consumers in `packages/page-builder-cms-rendering`, builder CMS dialog components, and runtime SDK tools to use the simplified content summary shape.
- [x] 3.3 Update preview and static export CMS integration paths to use the new host config and gateway behavior without direct resource authentication.

## 4. Verification

- [x] 4.1 Rewrite unit and route tests for CMS config resolution, token-backed gateway requests, catalog detail assembly, and simplified content summaries.
- [x] 4.2 Add regression coverage for `siteID` defaulting, token refresh timing, asset proxy query preservation, and `loadextend` not altering normalized content responses.
