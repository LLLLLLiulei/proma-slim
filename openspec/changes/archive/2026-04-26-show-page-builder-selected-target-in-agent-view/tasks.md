## 1. Selected Target Mapping

- [x] 1.1 Extend the preview bridge payload and renderer selection event to carry a user-facing `displayLabel` that matches the preview overlay label.
- [x] 1.2 Reuse the existing selection lifecycle in `BuilderPage` so the visible target indicator appears, updates, or clears from the same state transitions that drive hidden `targetSelection` injection.

## 2. Composer UI Integration

- [x] 2.1 Render the current selected target in the Builder right-side composer through `AgentView`'s `composerNotice` slot without writing any extra message into the transcript.
- [x] 2.2 Keep the indicator compact and readable in the composer area, show only the preview-visible label, and provide an icon-only clear-selection action.

## 3. Verification

- [x] 3.1 Update preview bridge and `PreviewPane` tests to cover `displayLabel` forwarding for block and `cms-island` selections.
- [x] 3.2 Update `BuilderPage` tests to cover label-only display, clear-selection action, reselection replacement, and retaining the notice when send preparation fails while the selection remains active.
