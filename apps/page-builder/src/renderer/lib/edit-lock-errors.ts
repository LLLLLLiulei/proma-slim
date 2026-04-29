const PAGE_BUILDER_EDIT_LOCK_REJECTION_MESSAGES = [
  '编辑锁',
  '该项目当前有其他编辑会话正在进行',
  '该项目正在构建中',
]

function resolveErrorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status
  return typeof status === 'number' ? status : null
}

export function isPageBuilderEditLockRejected(error: unknown): boolean {
  if (resolveErrorStatus(error) !== 409 || !(error instanceof Error)) {
    return false
  }

  return PAGE_BUILDER_EDIT_LOCK_REJECTION_MESSAGES.some((message) => error.message.includes(message))
}
