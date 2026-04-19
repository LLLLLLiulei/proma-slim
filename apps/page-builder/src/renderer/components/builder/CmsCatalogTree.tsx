import * as React from 'react'
import { Tree } from 'antd'
import type { PageBuilderCmsCatalog } from '@proma/shared'

interface CmsCatalogTreeSharedProps {
  catalogs: PageBuilderCmsCatalog[]
  expandedKeys: string[]
  onExpandedKeysChange: (keys: string[]) => void
}

interface CmsCatalogTreeCheckProps extends CmsCatalogTreeSharedProps {
  checkedCatalogIds: string[]
  checkStrictly?: boolean
  onCheckedCatalogIdsChange: (catalogIds: string[]) => void
  onSelectCatalog?: (catalogId: string) => void
  selectedCatalogId?: string | null
  selectionMode: 'check'
}

interface CmsCatalogTreeSelectProps extends CmsCatalogTreeSharedProps {
  onSelectCatalog: (catalogId: string) => void
  selectedCatalogId: string | null
  selectionMode: 'select'
}

type CmsCatalogTreeProps = CmsCatalogTreeCheckProps | CmsCatalogTreeSelectProps

interface CatalogTreeNode {
  key: string
  title: string
  children?: CatalogTreeNode[]
  isLeaf?: boolean
}

function buildTreeData(catalogs: PageBuilderCmsCatalog[]): CatalogTreeNode[] {
  return catalogs.map((catalog) => ({
    key: catalog.id,
    title: catalog.name || '未命名栏目',
    isLeaf: catalog.children.length === 0,
    children: catalog.children.length > 0 ? buildTreeData(catalog.children) : undefined,
  }))
}

export function CmsCatalogTree(props: CmsCatalogTreeProps): React.ReactElement {
  const {
    catalogs,
    expandedKeys,
    onExpandedKeysChange,
  } = props

  const treeData = React.useMemo(() => buildTreeData(catalogs), [catalogs])

  const handleExpand = React.useCallback((nextExpandedKeys: React.Key[]) => {
    onExpandedKeysChange(nextExpandedKeys.map((item) => String(item)))
  }, [onExpandedKeysChange])

  const handleCheck = React.useCallback((nextCheckedKeys: React.Key[] | { checked?: React.Key[] }) => {
    if (props.selectionMode !== 'check') return

    const keys = Array.isArray(nextCheckedKeys)
      ? nextCheckedKeys
      : nextCheckedKeys.checked ?? []

    props.onCheckedCatalogIdsChange(keys.map((item) => String(item)))
  }, [props])

  const handleSelect = React.useCallback((selectedKeys: React.Key[]) => {
    if (!props.onSelectCatalog) return

    const [nextKey] = selectedKeys
    if (nextKey === undefined) return
    props.onSelectCatalog(String(nextKey))
  }, [props])

  return (
    <div className="page-builder-cms-tree-panel">
      <Tree<CatalogTreeNode>
        autoExpandParent={false}
        blockNode
        className="page-builder-cms-tree"
        checkedKeys={props.selectionMode === 'check' ? props.checkedCatalogIds : undefined}
        checkable={props.selectionMode === 'check'}
        checkStrictly={props.selectionMode === 'check' ? props.checkStrictly : undefined}
        expandedKeys={expandedKeys}
        onCheck={props.selectionMode === 'check' ? handleCheck : undefined}
        onExpand={handleExpand}
        onSelect={props.onSelectCatalog ? handleSelect : undefined}
        selectedKeys={props.selectedCatalogId
          ? [props.selectedCatalogId]
          : []}
        treeData={treeData}
      />
    </div>
  )
}
