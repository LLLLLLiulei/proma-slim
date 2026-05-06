import * as React from 'react'
import { Alert, Card, Checkbox, ConfigProvider, Empty, Image, Pagination, Spin, Typography } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { RefreshCw } from 'lucide-react'
import type {
  PageBuilderCmsContentList,
  PageBuilderCmsContentSummary,
} from '@ai-page-builder/shared'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { CmsAsyncState } from './useCmsBrowserState'
import {
  DEFAULT_CMS_PREVIEW_IMAGE,
  pickCmsPreviewImage,
} from './cmsPreviewImage'

interface CmsContentListProps {
  checkedContentIds: string[]
  onCheckedContentChange: (item: PageBuilderCmsContentSummary, checked: boolean) => void
  state: CmsAsyncState<PageBuilderCmsContentList>
  onRetry: () => void
  onPageChange: (page: number, pageSize?: number) => void
}

const CONTENTS_PAGE_SIZE_OPTIONS = ['6', '12', '24']

function pickPreviewImage(item: PageBuilderCmsContentSummary): string {
  return pickCmsPreviewImage(item.listLogoUrl)
}

function ReadyState(props: {
  checkedContentIds: string[]
  onCheckedContentChange: (item: PageBuilderCmsContentSummary, checked: boolean) => void
  data: PageBuilderCmsContentList
  onPageChange: (page: number, pageSize?: number) => void
}): React.ReactElement {
  const {
    checkedContentIds,
    data,
    onCheckedContentChange,
    onPageChange,
  } = props
  const checkedContentIdSet = React.useMemo(() => new Set(checkedContentIds), [checkedContentIds])

  return (
    <div className="page-builder-cms-content-panel">
      <div className="page-builder-cms-content-list-scroll">
        <div className="page-builder-cms-content-list">
          {data.items.map((item) => {
            const previewImage = pickPreviewImage(item)
            const checked = checkedContentIdSet.has(item.id)
            const toggleChecked = () => onCheckedContentChange(item, !checked)
            const summary = item.summary.trim()

            return (
              <Card
                aria-checked={checked}
                className={cn('page-builder-cms-content-card', checked && 'is-selected')}
                key={item.id}
                onClick={toggleChecked}
                onKeyDown={(event) => {
                  if (event.key !== 'Enter' && event.key !== ' ') return
                  event.preventDefault()
                  toggleChecked()
                }}
                role="checkbox"
                size="small"
                tabIndex={0}
              >
                <div className="page-builder-cms-content-card-body">
                  <div className="page-builder-cms-content-card-check">
                    <Checkbox
                      checked={checked}
                      className="page-builder-cms-content-checkbox"
                      onChange={(event) => onCheckedContentChange(item, Boolean(event.target?.checked))}
                      onClick={(event) => event.stopPropagation()}
                    />
                  </div>

                  <div className="page-builder-cms-content-thumb">
                    <Image
                      alt={item.title || 'CMS 内容缩略图'}
                      className="page-builder-cms-content-thumb-image"
                      fallback={DEFAULT_CMS_PREVIEW_IMAGE}
                      preview={false}
                      src={previewImage}
                    />
                  </div>

                  <div className="min-w-0">
                    <div className="page-builder-cms-content-title-row">
                      <div className="page-builder-cms-content-title-main">
                        <Typography.Title className="page-builder-cms-content-title" level={5}>
                          {item.title || '未命名内容'}
                        </Typography.Title>
                      </div>
                    </div>

                    <div className="page-builder-cms-content-meta">
                      {item.addedAt ? (
                        <Typography.Text className="page-builder-cms-content-added-at">
                          {item.addedAt}
                        </Typography.Text>
                      ) : null}
                    </div>

                    {summary ? (
                      <Typography.Paragraph
                        className="page-builder-cms-content-summary"
                        ellipsis={{ rows: 1 }}
                      >
                        {summary}
                      </Typography.Paragraph>
                    ) : null}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>

      <div className="page-builder-cms-pagination">
        <span className="page-builder-cms-pagination-total">共 {data.total} 条</span>
        <Pagination
          className="page-builder-cms-pagination-control"
          current={data.pageIndex + 1}
          onChange={onPageChange}
          pageSize={data.pageSize}
          pageSizeOptions={CONTENTS_PAGE_SIZE_OPTIONS}
          responsive
          showSizeChanger={{
            showSearch: false,
          }}
          size="small"
          total={data.total}
        />
      </div>
    </div>
  )
}

export function CmsContentList(props: CmsContentListProps): React.ReactElement {
  const {
    checkedContentIds,
    onCheckedContentChange,
    state,
    onPageChange,
    onRetry,
  } = props

  if (state.status === 'loading' && !state.data) {
    return (
      <ConfigProvider componentSize="small" locale={zhCN}>
        <div className="page-builder-cms-state">
          <Spin size="small" />
          <span>正在加载内容...</span>
        </div>
      </ConfigProvider>
    )
  }

  if (state.status === 'error') {
    return (
      <ConfigProvider componentSize="small" locale={zhCN}>
        <div className="page-builder-cms-state page-builder-cms-state-stack page-builder-cms-state-compact">
          <Alert
            className="w-full"
            description={state.errorMessage}
            message="内容加载失败"
            type="error"
          />
          <Button className="gap-2" onClick={onRetry} size="sm" type="button" variant="outline">
            <RefreshCw className="size-3.5" />
            重试
          </Button>
        </div>
      </ConfigProvider>
    )
  }

  if (state.status !== 'ready' || !state.data || state.data.items.length === 0) {
    return (
      <ConfigProvider componentSize="small" locale={zhCN}>
        <div className="page-builder-cms-state">
          <Empty description="当前栏目暂无内容" image={Empty.PRESENTED_IMAGE_SIMPLE} />
        </div>
      </ConfigProvider>
    )
  }

  return (
    <ConfigProvider componentSize="small" locale={zhCN}>
      <ReadyState
        checkedContentIds={checkedContentIds}
        data={state.data}
        onCheckedContentChange={onCheckedContentChange}
        onPageChange={onPageChange}
      />
    </ConfigProvider>
  )
}
