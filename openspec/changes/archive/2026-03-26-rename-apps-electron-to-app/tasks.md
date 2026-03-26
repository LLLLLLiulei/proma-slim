## 1. Workspace identity rename

- [x] 1.1 Rename the main application directory from `apps/electron` to `apps/app`
- [x] 1.2 Rename the main application workspace package from `@proma/electron` to `@proma/app`
- [x] 1.3 Update root workspace scripts in `package.json` to route `dev`, `build`, and `start` to `@proma/app`

## 2. Hard-coded path and package references

- [x] 2.1 Update app-local config and tooling files to reference the renamed app directory while keeping `src/main` and `src/renderer` unchanged
- [x] 2.2 Update active tests and code comments that still describe the current app as `electron`
- [x] 2.3 Update lockfiles and workspace metadata so dependency resolution points at `apps/app` and `@proma/app`

## 3. Current-state documentation and verification

- [x] 3.1 Update current-state docs that describe the live repository structure to use `apps/app` and `@proma/app`, while leaving archive/history materials untouched
- [x] 3.2 Run targeted tests and workspace typecheck after the rename to confirm the renamed app still builds and routes correctly
- [x] 3.3 Run root-level command verification to confirm `bun run dev`, `bun run build`, or equivalent root script routing still targets `@proma/app`
