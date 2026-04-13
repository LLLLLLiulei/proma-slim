## 1. Unified HTML mutation service

- [x] 1.1 新增 `apps/app/src/main/lib/page-builder-workspace-html-service.ts`，统一封装 `workspace-files/index.html` 的读取、HTML transform、写回与 preview state 重算
- [x] 1.2 为 `workspace-files/.proma/` 派生产物目录补充路径与文件写入收口逻辑，使统一 service 能稳定管理 manifest 输出
- [x] 1.3 让 `page-builder-inline-text-service.ts`、`page-builder-block-deletion-service.ts`、`page-builder-image-replacement-service.ts` 改走统一 mutation pipeline，并保持现有外部返回契约不变

## 2. CMS rendering manifest

- [x] 2.1 新增 `packages/page-builder-cms-rendering/src/manifest/cms-rendering-manifest.ts` 与 `scan-cms-rendering-manifest.ts`，定义 manifest 类型并从作者 HTML 扫描 top-level CMS islands
- [x] 2.2 实现 manifest entry 生成逻辑，至少包含 `blockId`、`component`、`props`、`selectorSnapshot`、`htmlPath`、`islandIndex`
- [x] 2.3 实现与 preview bridge 语义对齐的 `selectorSnapshot` 生成规则，并覆盖“空 manifest / 多 islands / 嵌套 islands 仅记录最外层”等测试

## 3. Validation diagnostics

- [x] 3.1 新增 `packages/page-builder-cms-rendering/src/validation/cms-rendering-validator.ts`，定义结构化 diagnostics 模型和 severity 分级
- [x] 3.2 实现 Phase 1 DOM 级校验规则，覆盖嵌套 `cms-*`、`cms-content` 缺少 `catalog-id`、缺少 `v-slot:default`、危险标签、slot 简写、未知 props、可选 URL 未做 `v-if` 保护等场景
- [x] 3.3 将 validator 接入统一 HTML mutation service 的写后处理结果，并保留现有 inline text / block deletion / image replacement API 只返回 preview state

## 4. Verification

- [x] 4.1 为统一 HTML mutation service 增加测试，覆盖成功写回后 manifest 重建与 preview state 刷新，以及失败路径不产生伪成功派生产物
- [x] 4.2 为 manifest scanner 与 validator 增加 shared package 单元测试，覆盖 top-level 扫描、空页面、嵌套 islands、危险模板和 warning/info diagnostics
- [x] 4.3 运行本 chunk 相关测试，确认现有 inline text、block deletion、image replacement 路径在接入统一 pipeline 后仍保持原有行为并返回最新 preview metadata
