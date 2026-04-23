## 1. Shared API Contract

- [x] 1.1 Add shared static export creation option/request types, including `downloadCmsRemoteAssets: boolean` with backward-compatible default semantics
- [x] 1.2 Update renderer API client to POST the export creation JSON body and keep existing callers compatible where needed
- [x] 1.3 Update workspace export route to parse and validate the optional request body before passing task options to the export service

## 2. Backend Export Behavior

- [x] 2.1 Extend `PageBuilderStaticExportService.createJob()` and stored job context to carry per-task CMS remote asset download options
- [x] 2.2 Implement CMS remote asset skip handling after URL normalization, covering HTML attributes, `srcset`, inline CSS, remote CSS nested `url(...)`, and attachment-style links
- [x] 2.3 Ensure skipped CMS resources are emitted as CMS source URLs and never as `/api/page-builder/cms/assets?url=...` preview proxy URLs in static export output
- [x] 2.4 Record skipped CMS remote resources in the export report as retained external links and warnings without marking the job failed
- [x] 2.5 Preserve existing behavior for non-CMS remote assets, local workspace files, CMS asset downloading when enabled, and active same-workspace job reuse

## 3. Builder UI Flow

- [x] 3.1 Add a Builder-managed export confirmation dialog opened by the existing “导出静态包” button
- [x] 3.2 Add a default-checked “导出 CMS 远程资源” checkbox and submit the selected value when creating the export job
- [x] 3.3 Keep export pending state, duplicate-trigger prevention, download opening, and warning toast behavior aligned with the existing static export flow

## 4. Tests And Verification

- [x] 4.1 Update API and route tests to cover default and explicit `downloadCmsRemoteAssets` request handling
- [x] 4.2 Add static export service tests for skipped CMS absolute URLs, CMS root-relative URLs, preview proxy URLs, CMS stylesheet skip behavior, CSS URLs, CMS content navigation links, skipped-resource warnings, and unchanged non-CMS localization
- [x] 4.3 Update BuilderPage and PreviewPane tests for the confirmation dialog, default checkbox state, unchecked submission, cancellation, and pending disable behavior
- [x] 4.4 Run the relevant app/page-builder test suites and `openspec` validation/status checks for this change
