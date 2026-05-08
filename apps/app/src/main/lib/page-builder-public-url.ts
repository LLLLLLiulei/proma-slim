import { prependPageBuilderPublicBasePath } from '@ai-page-builder/shared'

export function resolvePageBuilderPublicBasePath(): string {
  return process.env.AI_PAGE_BUILDER_BASE_PATH ?? ''
}

export function buildPageBuilderPublicUrl(pathname: string): string {
  return prependPageBuilderPublicBasePath(pathname, resolvePageBuilderPublicBasePath())
}
