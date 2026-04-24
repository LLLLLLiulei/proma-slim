---
name: page-builder-cms-region-authoring-guidance
description: Use when an ordinary page-builder turn explicitly targets an existing cms-catalog or cms-content region and needs canonical CMS authoring guidance before editing.
---

# Page Builder CMS Region Authoring Guidance

## Overview

Use this skill only for ordinary edits to an existing `cms-catalog` / `cms-content` region that is already present in the page. This skill is consult-only guidance, not the confirmed CMS apply controller and not the ordinary turn owner. Its job is to keep the model in the correct authoring mindset before it edits an existing CMS source tag.

## When to Use

Use this skill when all of the following are true:

- the conversation is happening inside `page-builder`
- the current ordinary turn explicitly targets an existing `cms-island`, `cms-catalog`, or `cms-content` region
- the request is about revising the current CMS region's template, structure, presentation, or compatible shell
- the workflow does not already carry a confirmed CMS selection handoff for `cms-binding-apply`

Do not use this skill when:

- the user still needs to browse or pick CMS data
- the turn already entered the confirmed CMS apply path
- the target is a normal static block instead of an existing CMS source region

## Reading Order

Read in this order:

1. if present, read the host-injected `<page_builder_turn_routing>` payload first
2. if present, read the host-injected `<page_builder_selection>` payload next
3. if present, read the host-injected `<page_builder_cms_guidance_notice>` next
4. if present, read the host-injected `<page_builder_cms_region_authoring>` digest next
5. if the component is `cms-catalog`, read [references/cms-catalog-existing-region.md](references/cms-catalog-existing-region.md)
6. if the component is `cms-content`, read [references/cms-content-existing-region.md](references/cms-content-existing-region.md)
7. read [references/shared-boundaries.md](references/shared-boundaries.md) when changing slot structure, Vue template usage, or authoring boundaries

The host-injected routing payload is the first source of truth for the current turn owner and scene. The target digest is the first source of truth for the current CMS target when it is available. The guidance notice may also tell you that the current page already contains host-managed CMS regions, or that target-specific digest generation degraded and you must stay in a more conservative editing mode.

## Core Rules

- This skill supports the ordinary controller. It does not take over user-facing briefing, final confirmation, or confirmed CMS apply ownership.
- Keep any user-facing explanation minimal. Do not dump a long CMS theory summary to the user; surface only the blocking clarification or the concrete edit decision the ordinary controller needs.
- Treat the current `cms-catalog` / `cms-content` source tag as the authoring boundary. Edit it as one source-atomic unit instead of editing rendered child nodes one by one.
- Ordinary edits may restyle or restructure the existing CMS region, but must not silently change binding query props such as `site-id`, `catalog-id`, `ids`, `page-size`, `parent-id`, or similar source identity fields.
- If the user actually wants different CMS data, different query semantics, or a new binding, escalate to the confirmed CMS flow instead of hand-editing the source tag.
- Do not invent new `cms-*` tags, do not guess props, and do not guess slot scope, field aliases, or runtime-only attrs.
- Keep page-builder authoring HTML-first. Vue template syntax belongs only inside the current CMS source tag's slot templates.
- Do not self-manage Vue runtime. Do not add Vue CDN/importmap/bootstrap assets, and do not use page-wide `createApp`, `Vue.createApp`, or `mount`.
- If the current digest and the component reference still do not provide enough stable information, ask one minimal clarification or stop the CMS rewrite path instead of guessing.
- If the host says the target-specific CMS guidance degraded, allow only non-binding edits to the current region and do not change query props or data-source semantics.

## Escalation Boundary

Move to the confirmed CMS flow when any of the following is true:

- the user wants to switch to another catalog or another content set
- the user wants to change count/query props such as `ids`, `catalog-id`, `parent-id`, `page-size`, `keyword`, or similar source fields
- the current region should be rebound instead of merely restyled or restructured
- the current authoring intent cannot be completed safely with the existing binding

## References

- [references/shared-boundaries.md](references/shared-boundaries.md)
- [references/cms-catalog-existing-region.md](references/cms-catalog-existing-region.md)
- [references/cms-content-existing-region.md](references/cms-content-existing-region.md)
