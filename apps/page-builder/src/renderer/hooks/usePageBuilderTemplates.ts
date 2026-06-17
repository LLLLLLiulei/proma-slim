import * as React from 'react'
import type { PageBuilderTemplateSummary, PageBuilderTemplateUseResponse } from '@ai-page-builder/shared'
import { api } from '@/lib/api'

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback
}

export function usePageBuilderTemplates() {
  const [templates, setTemplates] = React.useState<PageBuilderTemplateSummary[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [usingTemplateId, setUsingTemplateId] = React.useState<string | null>(null)
  const [deletingTemplateId, setDeletingTemplateId] = React.useState<string | null>(null)
  const [renamingTemplateId, setRenamingTemplateId] = React.useState<string | null>(null)
  const [importingTemplate, setImportingTemplate] = React.useState(false)
  const usingTemplateIdRef = React.useRef<string | null>(null)
  const deletingTemplateIdRef = React.useRef<string | null>(null)
  const renamingTemplateIdRef = React.useRef<string | null>(null)
  const importingTemplateRef = React.useRef(false)

  const loadTemplates = React.useCallback(async (): Promise<void> => {
    setError(null)
    setLoading(true)

    try {
      const response = await api.listPageBuilderTemplates()
      setTemplates(response.templates)
    } catch (nextError) {
      setError(getErrorMessage(nextError, '加载模板库失败'))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadTemplates()
  }, [loadTemplates])

  const useTemplate = React.useCallback(async (
    templateId: string,
    projectName: string,
  ): Promise<PageBuilderTemplateUseResponse | null> => {
    if (usingTemplateIdRef.current !== null) {
      return null
    }

    usingTemplateIdRef.current = templateId
    setError(null)
    setUsingTemplateId(templateId)
    try {
      return await api.usePageBuilderTemplate(templateId, { projectName })
    } catch (nextError) {
      setError(getErrorMessage(nextError, '使用模板失败'))
      return null
    } finally {
      usingTemplateIdRef.current = null
      setUsingTemplateId(null)
    }
  }, [])

  const removeTemplate = React.useCallback(async (templateId: string): Promise<boolean> => {
    if (deletingTemplateIdRef.current !== null) {
      return false
    }

    deletingTemplateIdRef.current = templateId
    setError(null)
    setDeletingTemplateId(templateId)
    try {
      await api.deletePageBuilderTemplate(templateId)
      setTemplates((current) => current.filter((template) => template.id !== templateId))
      return true
    } catch (nextError) {
      setError(getErrorMessage(nextError, '删除模板失败'))
      return false
    } finally {
      deletingTemplateIdRef.current = null
      setDeletingTemplateId(null)
    }
  }, [])

  const importTemplate = React.useCallback(async (file: File): Promise<PageBuilderTemplateSummary | null> => {
    if (importingTemplateRef.current) {
      return null
    }

    importingTemplateRef.current = true
    setError(null)
    setImportingTemplate(true)
    try {
      const response = await api.importPageBuilderTemplate(file)
      await loadTemplates()
      return response.template
    } catch (nextError) {
      const message = getErrorMessage(nextError, '导入模板失败')
      setError(message)
      throw new Error(message)
    } finally {
      importingTemplateRef.current = false
      setImportingTemplate(false)
    }
  }, [loadTemplates])

  const renameTemplate = React.useCallback(async (templateId: string, name: string): Promise<void> => {
    if (renamingTemplateIdRef.current !== null) {
      return
    }

    renamingTemplateIdRef.current = templateId
    setError(null)
    setRenamingTemplateId(templateId)
    try {
      const response = await api.renamePageBuilderTemplate(templateId, { name })
      setTemplates((current) => current.map((template) => (
        template.id === templateId ? response.template : template
      )))
    } catch (nextError) {
      const message = getErrorMessage(nextError, '重命名模板失败')
      setError(message)
      throw new Error(message)
    } finally {
      renamingTemplateIdRef.current = null
      setRenamingTemplateId(null)
    }
  }, [])

  return {
    deletingTemplateId,
    error,
    importingTemplate,
    importTemplate,
    loading,
    renameTemplate,
    renamingTemplateId,
    refreshTemplates: loadTemplates,
    removeTemplate,
    templates,
    useTemplate,
    usingTemplateId,
  }
}
