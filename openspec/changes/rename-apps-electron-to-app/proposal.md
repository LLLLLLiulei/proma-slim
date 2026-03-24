## Why

当前主应用已经不再是 Electron 运行形态，但仓库入口仍然使用 `apps/electron` 和 `@proma/electron` 这类历史命名，持续误导新接手者对项目结构和运行模型的判断。先完成第一阶段重命名，可以在不触碰更深层目录语义的前提下，先把仓库最外层的应用身份改正。

## What Changes

- 将主应用 workspace 目录从 `apps/electron` 重命名为 `apps/app`
- 将主应用 workspace 包名从 `@proma/electron` 重命名为 `@proma/app`
- 同步更新根 `package.json` 中指向主应用 workspace 的脚本过滤条件
- 同步更新会直接引用 `apps/electron` 或 `@proma/electron` 的构建配置、测试说明和必要文档
- 保持现有运行形态与功能行为不变，本阶段不调整 `src/main` / `src/renderer` 的内部目录命名

## Capabilities

### New Capabilities
- `app-workspace-identity`: 定义主应用在仓库中的目录路径、workspace 包名和顶层脚本入口应使用中性的 `app` 命名，而不是继续暴露历史 `electron` 身份

### Modified Capabilities
- None

## Impact

- Affected code:
  - `package.json`
  - `apps/electron/` -> `apps/app/`
  - `bun.lock`
  - `pnpm-lock.yaml`
  - directly referenced docs, tests, and config files that hard-code `apps/electron` or `@proma/electron`
- Affected systems:
  - Bun workspace package resolution
  - root dev/build/start script routing
  - local developer documentation and onboarding references
- Out of scope:
  - renaming `src/main` / `src/renderer`
  - changing runtime architecture, transport, or user-facing behavior
