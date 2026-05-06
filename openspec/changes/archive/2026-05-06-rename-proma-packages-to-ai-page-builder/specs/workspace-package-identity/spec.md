## ADDED Requirements

### Requirement: Root package identity SHALL use AI Page Builder naming
The repository root package SHALL use `ai-page-builder` as its private package name for the active workspace.

#### Scenario: Developer inspects root package identity
- **WHEN** a developer opens the root `package.json`
- **THEN** the package name SHALL be `ai-page-builder`
- **AND** the root package SHALL remain private to the workspace

### Requirement: Active workspace packages SHALL use the `@ai-page-builder` scope
All active workspace package names SHALL use the `@ai-page-builder/*` scope instead of the historical `@proma/*` scope.

#### Scenario: Developer inspects workspace package names
- **WHEN** a developer opens active workspace `package.json` files under `apps/*` and `packages/*`
- **THEN** active workspace package names SHALL use the `@ai-page-builder/*` scope
- **AND** no active workspace package name SHALL use the `@proma/*` scope

#### Scenario: Workspace dependencies resolve through the new scope
- **WHEN** an active workspace package depends on another active workspace package
- **THEN** the dependency key SHALL use the corresponding `@ai-page-builder/*` package name
- **AND** it SHALL NOT depend on the historical `@proma/*` package name

### Requirement: Active source imports SHALL use the new package scope
Active TypeScript and JavaScript source files SHALL import workspace packages through `@ai-page-builder/*` package specifiers.

#### Scenario: Source code imports shared contracts
- **WHEN** active source code imports the shared package, UI package or page-builder CMS rendering package
- **THEN** the import specifier SHALL use `@ai-page-builder/shared`, `@ai-page-builder/ui` or `@ai-page-builder/page-builder-cms-rendering`
- **AND** active source code SHALL NOT import those packages through the historical `@proma/*` scope

#### Scenario: Dynamic imports use new package identity
- **WHEN** active code uses a dynamic import or TypeScript import type for a workspace package
- **THEN** the package specifier SHALL use the `@ai-page-builder/*` scope

### Requirement: Workspace tooling SHALL route through the new package scope
Repo-owned package tooling SHALL use `@ai-page-builder/*` workspace filters and path aliases for active workspace packages.

#### Scenario: Root scripts target active workspaces
- **WHEN** a developer inspects root `dev`, `dev:page-builder`, `build` or `start` scripts
- **THEN** those scripts SHALL route to `@ai-page-builder/app` or `@ai-page-builder/page-builder` as appropriate

#### Scenario: Docker builds target active workspaces
- **WHEN** a developer inspects Page Builder Dockerfiles
- **THEN** Bun workspace filter commands SHALL use `@ai-page-builder/*` package names

#### Scenario: TypeScript package path aliases target active workspaces
- **WHEN** TypeScript configuration defines aliases for workspace package subpaths
- **THEN** those aliases SHALL use the `@ai-page-builder/*` package scope

### Requirement: Current package identity documentation SHALL be updated without rewriting runtime namespaces
Tracked current-state documentation and command examples SHALL use the new package scope when they describe active workspace package identity, while archive/history documents and runtime namespace references SHALL remain accurate to their own context.

#### Scenario: Current command examples use new workspace filters
- **WHEN** tracked current command examples show Bun workspace filters for active packages
- **THEN** those examples SHALL use `@ai-page-builder/*` package names

#### Scenario: Historical documents remain historically accurate
- **WHEN** archive changes, historical analysis documents or runtime namespace documentation mention `Proma`, `@proma/*`, `PROMA_*`, `~/.proma`, `data-proma-*`, `__PROMA_*` or `proma:*`
- **THEN** this package identity rename SHALL NOT require those references to be rewritten unless they explicitly describe current active package identity

### Requirement: Runtime namespace compatibility SHALL be preserved during package rename
The package identity rename SHALL NOT rename persisted or protocol-level runtime namespaces.

#### Scenario: Runtime environment variables remain compatible
- **WHEN** the package identity rename is implemented
- **THEN** existing `PROMA_*` environment variables SHALL continue to be recognized
- **AND** this change SHALL NOT require users to switch to new environment variable names

#### Scenario: Runtime data directories remain compatible
- **WHEN** the package identity rename is implemented
- **THEN** existing `~/.proma`, `~/.proma-dev` and workspace-local `.proma` data paths SHALL continue to be used unless explicitly overridden by existing configuration mechanisms

#### Scenario: Page protocol names remain compatible
- **WHEN** the package identity rename is implemented
- **THEN** existing `data-proma-*` attributes, `__PROMA_*` browser globals, `proma:*` events and `proma:*` storage keys SHALL remain unchanged
