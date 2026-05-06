import * as React from 'react'
import { Alert, Image, Spin } from 'antd'
import type { PageBuilderCmsCatalogDetail } from '@ai-page-builder/shared'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import type { CmsAsyncState } from './useCmsBrowserState'
import { DEFAULT_CMS_PREVIEW_IMAGE, pickCmsPreviewImage } from './cmsPreviewImage'

interface CmsCatalogDetailPanelProps {
  state: CmsAsyncState<PageBuilderCmsCatalogDetail>
  onRetry: () => void
}

function renderValue(value: string): string {
  return value.trim() ? value : '—'
}

export function CmsCatalogDetailPanel(props: CmsCatalogDetailPanelProps): React.ReactElement {
  const { onRetry, state } = props

  if (state.status === 'loading' && !state.data) {
    return (
      <div className="page-builder-cms-catalog-detail-state">
        <Spin size="small" />
        <span>正在加载栏目详情...</span>
      </div>
    )
  }

  if (state.status === 'error') {
    return (
      <div className="page-builder-cms-catalog-detail-state page-builder-cms-catalog-detail-state-stack">
        <Alert
          className="w-full"
          description={state.errorMessage}
          message="栏目详情加载失败"
          type="error"
        />
        <Button className="gap-2" onClick={onRetry} size="sm" type="button" variant="outline">
          <RefreshCw className="size-3.5" />
          重试
        </Button>
      </div>
    )
  }

  if (state.status !== 'ready' || !state.data) {
    return (
      <div className="page-builder-cms-catalog-detail-state">
        <span>请选择左侧栏目以查看详情</span>
      </div>
    )
  }

  const detail = state.data
  const fields = [
    { label: '栏目ID', value: renderValue(detail.id) },
    { label: '内部编码', value: renderValue(detail.innerCode) },
    { label: '状态', value: renderValue(detail.statusLabel) },
    { label: '栏目名称', value: renderValue(detail.name) },
    { label: '栏目别名', value: renderValue(detail.alias) },
    { label: '内容类型', value: renderValue(detail.contentTypeName || detail.contentType) },
    { label: '栏目描述', value: renderValue(detail.description) },
  ]

  return (
    <div className="page-builder-cms-catalog-detail">
      {fields.map((field) => (
        <div className="page-builder-cms-catalog-detail-row" key={field.label}>
          <div className="page-builder-cms-catalog-detail-label">{field.label}</div>
          <div className="page-builder-cms-catalog-detail-value">{field.value}</div>
        </div>
      ))}

      <div className="page-builder-cms-catalog-detail-row">
        <div className="page-builder-cms-catalog-detail-label">Logo</div>
        <div className="page-builder-cms-catalog-detail-logo-wrap">
          <Image
            alt={`${detail.name || '栏目'} Logo`}
            className="page-builder-cms-catalog-detail-logo"
            fallback={DEFAULT_CMS_PREVIEW_IMAGE}
            preview={false}
            src={pickCmsPreviewImage(detail.logoUrl)}
          />
        </div>
      </div>
    </div>
  )
}
