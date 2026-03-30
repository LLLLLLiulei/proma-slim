## Implementation Notes

### CMS upstream contract

- OpenAPI export reference: `http://127.0.0.1:4523/export/openapi/2?version=3.0`
- Current live business host used by the implementation: `https://demo.zving.com/zcmstest`
- Runtime credentials are loaded only from the local host file `getConfigDir()/cms-settings.json`
- Cookie format sent upstream: `CurrentSite=<currentSite>; ZUSID=<zusid>`

### Current field mapping

- Channel browsing uses `/ui/dimensions/1/catalogs`
- Content browsing and first-phase search use `/ui/contentcore/contents`
- First-phase content search is constrained to `catalogID + title`
- Protected media preview/import currently prefers `preview/news/<relative-path>`
- Raw CMS payloads are normalized into page-builder specific channel/content structures before reaching the frontend or Agent tools

### Asset import and binding notes

- Protected CMS assets imported during generation are written to `workspace-files/assets/cms/`
- Generated pages should reference the imported local relative paths whenever possible
- Lightweight CMS bindings are stored in workspace-private metadata under `.page-builder/cms-bindings.json`
- Binding metadata records selector, data source identity, render hint, snapshot time, and imported asset mappings
- Binding metadata must not be written into visible chat history or exported static HTML

### Current limitations

- There is no explicit media size cap in the first implementation slice yet; imports currently rely on the upstream response and local disk availability
- Asset import fallback is currently best-effort: preview/import failures surface as tool or route errors and do not synthesize alternative upstream URLs
- "Resync from CMS" is not implemented yet; the binding file is only the minimal source-of-truth needed for that future extension
