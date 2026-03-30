# Page Builder CMS Block Toolbar Design

Date: 2026-03-30
Status: Proposed
Scope: `page-builder` Builder page CMS interaction redesign

## Context

`page-builder` already supports three related capabilities:

- block selection in the preview pane
- a CMS picker modal inside the Builder page
- hidden-context injection that combines selected block information and CMS selection data for the next Agent turn

The current manual CMS entry point is placed beside the chat composer. That implementation reused existing message-decoration and Agent execution paths, but the interaction is not intuitive for ordinary users:

- users do not know whether they must select a block before opening the CMS picker
- users can choose CMS data without a target block, but the UI does not clearly explain what will happen next
- a block-scoped action is currently presented as a chat-scoped action

The desired product direction is to make CMS selection feel like a direct action on the selected block, not a detached chat utility.

## Goals

- Make block editing the primary mental model for manual CMS selection.
- Move the main manual CMS entry from the chat composer to the selected block in the preview pane.
- After a user selects CMS data for a block, start the modification automatically by default.
- Keep the chat history understandable by showing a user-facing system-generated message for the auto-applied operation.
- Only interrupt the user with `AskUserQuestion` when the selected block and CMS data do not match well enough for a safe default action.
- Preserve the existing natural-language-triggered CMS flow as a secondary path.
- Maximize reuse of the existing CMS picker modal, `RequestCmsSelection`, hidden-context decoration, binding persistence, and asset import chain.

## Non-Goals

- Do not redesign the entire Builder layout.
- Do not add a full block editing toolbar in this change.
- Do not remove Agent-triggered CMS selection support.
- Do not replace the existing hidden-context protocol or CMS binding persistence format.
- Do not introduce a complex semantic classification engine in the first version.

## User Experience Decision

### 1. The primary manual CMS entry is block-scoped

When a user selects a block in the preview pane, the system shows a compact floating toolbar anchored below that selected block. In the first version, the toolbar contains exactly one action:

- `从 CMS 选择`

The chat composer no longer exposes a manual `从 CMS 选择` action.

Rationale:

- the action is clearly tied to the selected visual target
- the user no longer has to reason about selector injection or “next message only” semantics
- the preview pane becomes the place for block-scoped actions, while the chat composer remains the place for text-based conversation

### 2. The default outcome after CMS selection is immediate application

After the user confirms CMS data for the selected block, the system automatically starts the modification flow instead of requiring another manual text input.

The system inserts a visible system-generated message in the chat timeline, with product-facing copy such as:

- `已将当前区块与所选 CMS 数据关联，正在生成修改。`

Internally, the request still uses the existing hidden-context mechanism so the Agent receives:

- the selected block selector
- the confirmed CMS selection payload

Rationale:

- ordinary users should not have to restate obvious intent after explicitly choosing a block and a CMS source
- the visible system message keeps the timeline understandable without exposing technical payloads

### 3. Clarification is exception-based, not the default path

The system should only call `AskUserQuestion` when the block and the chosen CMS source do not match well enough for a safe default action.

Examples of clarification-worthy situations:

- a navigation-style data source is chosen for a visually single-item media block
- a single content item is chosen for a navigation or menu-like block
- a content list is chosen for a block whose current structure strongly implies a single visual item
- a natural-language-triggered CMS flow starts with no currently selected block and the system cannot infer whether the user wants to replace an existing block or insert a new one

The clarification must stay short and structured. It should not force the user into free-form technical explanation.

## Interaction Model

### Primary manual flow

1. The user selects a block in the preview pane.
2. The selected block is highlighted.
3. A floating block toolbar appears under the selected block.
4. The user clicks `从 CMS 选择`.
5. The CMS picker modal opens in a block-bound mode.
6. The user chooses a CMS source and confirms.
7. The system decides whether it can apply a safe default action.
8. If yes, it creates a visible system-generated message and starts the Agent run automatically.
9. If no, it calls `AskUserQuestion`, receives the structured answer, then continues the run.

### Secondary natural-language flow

The existing Agent-triggered CMS flow remains available. If the user expresses a CMS-driven intent in the chat:

- when a block is already selected, that block becomes the default target
- when no block is selected, the system may need a short clarification before continuing

This path remains supported, but it is no longer the primary manual entry path for CMS selection.

## State Model

The Builder page should treat the CMS block flow as a small state machine:

- `idle`
  No selected block and no CMS action in progress.
- `block-selected`
  A block is selected and the block toolbar is visible.
- `cms-picking`
  The block-bound CMS picker modal is open.
- `auto-applying`
  The user has confirmed CMS data and the system is automatically launching the corresponding Agent run.
- `needs-clarification`
  The system has paused automatic application and is waiting for a short structured confirmation through `AskUserQuestion`.

Rules:

- cancelling the CMS picker returns to `block-selected`
- deselecting the block returns to `idle`
- while the picker is open or auto-apply is in progress, block switching should be prevented in the first version

## Component Boundaries

### PreviewPane

`PreviewPane` remains responsible for preview rendering and block-selection communication with the injected preview bridge. It also becomes the rendering host for block-scoped action affordances.

### New component: `PageBuilderBlockActionBar`

Add a focused UI component for the floating action bar displayed below the selected block.

Responsibilities:

- render the anchored block toolbar
- expose the `从 CMS 选择` action
- reflect busy states such as picker-open or auto-applying

Non-responsibilities:

- no CMS data loading
- no Agent execution logic
- no persistence logic

### PageBuilderCmsPickerModal

Reuse the existing CMS picker modal component. Extend its framing semantics to support a block-bound manual mode where the copy clearly communicates:

- the picker is acting on the currently selected block
- confirmation will continue directly into page modification

The modal implementation itself should remain shared with the Agent-triggered CMS selection flow.

### BuilderPage

`BuilderPage` remains the orchestration layer, but it should be simplified:

- remove the manual CMS action from chat composer leading actions
- keep the existing block selection state and pending CMS selection state
- coordinate preview selection, block toolbar visibility, modal open/close state, auto-apply, and fallback clarification

### New orchestration helper

Introduce a focused helper or hook for automatic application after CMS confirmation, for example a `usePageBuilderCmsAutoApply`-style abstraction.

Responsibilities:

- combine the selected block with the confirmed CMS selection
- decide whether the request is safe to auto-apply
- generate the visible system message
- trigger the Agent run with existing hidden-context decoration
- fall back to `AskUserQuestion` when clarification is required

## Data and Message Strategy

### Hidden context is preserved

The existing hidden-context protocol stays intact:

- `<page_builder_selection>`
- `<page_builder_cms_selection>`

This change alters how those payloads are triggered, not their core structure.

### Visible message is product-facing, not protocol-facing

The automatically triggered chat entry must be readable by ordinary users and must not expose selectors, raw CMS IDs, or structured protocol fields.

The user-facing message is for transparency. The underlying execution should still rely on the existing composed message path so bindings and runtime context continue to work.

### Binding persistence remains host-managed

This redesign does not change the existing binding persistence rules. CMS-to-block associations remain stored as host-managed private metadata, not as visible chat content or exported HTML dependencies.

## Compatibility With Existing CMS Runtime

This redesign is intentionally built on top of the current CMS integration:

- keep `RequestCmsSelection` for Agent-triggered flows
- keep the shared CMS picker modal
- keep the existing `cms_*` data tools
- keep the current asset import and binding persistence behavior
- keep the hidden-context injection strategy

The primary code change is therefore at the interaction layer, not the CMS access layer.

## Implementation Sequence

1. Remove the manual composer-side CMS action from the Builder page.
2. Add a block-scoped floating action bar under the selected preview block.
3. Wire the action bar to open the existing CMS picker in block-bound mode.
4. Add an auto-apply orchestration step after CMS confirmation.
5. Add a visible system-generated message strategy for the auto-applied run.
6. Add minimal mismatch detection and `AskUserQuestion` fallback.
7. Verify that Agent-triggered CMS selection still works and now defaults to the selected block when one is active.

## Validation Requirements

The redesign should be considered complete only if the following are verified:

- selecting a block shows the block toolbar below that block
- the toolbar disappears when the selection is cleared
- clicking `从 CMS 选择` opens the existing CMS picker modal in a block-bound mode
- confirming CMS data starts execution automatically without additional free-form user input
- the chat timeline shows a readable system-generated message for the automatic action
- mismatch cases route through `AskUserQuestion`
- cancelling the picker returns to the selected-block state
- the existing CMS binding persistence and asset import chain still work
- the existing natural-language-triggered CMS flow still works

## Risks

- The main risk is state coupling between preview selection, CMS picking, automatic execution, and clarification. This must be controlled by keeping the state machine explicit and the orchestration logic isolated.
- If mismatch detection is too aggressive, the flow will feel slow and over-questioning. The first version should therefore use only a small set of conservative clarification triggers.
- If the system-generated message is too technical, users will still be confused. The visible message copy must stay product-facing.

## Required Spec Follow-Up

The current OpenSpec artifacts for CMS integration describe a manual CMS entry and block-selection cooperation, but they do not yet fully specify:

- that the manual CMS entry should live under the selected block
- that block-bound CMS selection is the primary manual path
- that confirming CMS data should auto-start modification
- that clarification should be exception-based through `AskUserQuestion`
- that the chat timeline should show a visible system-generated message for the automatic action

This redesign should therefore be captured as a follow-up OpenSpec change rather than being treated as an informal UI tweak.
