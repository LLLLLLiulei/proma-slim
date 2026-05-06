import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type { PageBuilderCmsCatalog } from '@ai-page-builder/shared'

const CATALOGS: PageBuilderCmsCatalog[] = [
  {
    id: '17677',
    name: '轮播图',
    parentId: null,
    path: 'lbt/',
    contentType: '',
    contentTypeName: '',
    hasChild: true,
    total: 15,
    children: [
      {
        id: '17765',
        name: '文章',
        parentId: '17677',
        path: 'lbt/wz/',
        contentType: 'Article',
        contentTypeName: '文章',
        hasChild: false,
        total: 11,
        children: [],
      },
    ],
  },
]

afterEach(() => {
  mock.restore()
})

describe('CmsCatalogTree', () => {
  test('maps catalogs into ant design tree data and controlled check state props in catalog selection mode', async () => {
    let capturedProps: Record<string, unknown> | null = null

    mock.module('antd', () => ({
      Tree(props: Record<string, unknown>) {
        capturedProps = props
        return React.createElement('div', { 'data-testid': 'cms-tree' })
      },
    }))

    const module = await import(`./CmsCatalogTree.tsx?test=${Date.now()}-${Math.random()}`)

    await act(async () => {
      create(
        <module.CmsCatalogTree
          catalogs={CATALOGS}
          checkedCatalogIds={['17677']}
          expandedKeys={['17677']}
          onCheckedCatalogIdsChange={() => {}}
          onExpandedKeysChange={() => {}}
          selectionMode="check"
        />,
      )
    })

    expect(capturedProps).not.toBeNull()
    if (!capturedProps) {
      throw new Error('expected tree props to be captured')
    }

    const treeProps: Record<string, unknown> = capturedProps

    expect(treeProps.blockNode).toBe(true)
    expect(treeProps.checkable).toBe(true)
    expect(treeProps.checkedKeys).toEqual(['17677'])
    expect(treeProps.expandedKeys).toEqual(['17677'])
    expect(treeProps.selectedKeys).toEqual([])
    expect(treeProps.treeData).toEqual([
      {
        key: '17677',
        title: '轮播图',
        isLeaf: false,
        children: [
          {
            key: '17765',
            title: '文章',
            isLeaf: true,
            children: undefined,
          },
        ],
      },
    ])
  })

  test('maps catalogs into ant design tree data and controlled selected state props in content browsing mode', async () => {
    let capturedProps: Record<string, unknown> | null = null

    mock.module('antd', () => ({
      Tree(props: Record<string, unknown>) {
        capturedProps = props
        return React.createElement('div', { 'data-testid': 'cms-tree' })
      },
    }))

    const module = await import(`./CmsCatalogTree.tsx?test=${Date.now()}-${Math.random()}`)

    await act(async () => {
      create(
        <module.CmsCatalogTree
          catalogs={CATALOGS}
          expandedKeys={['17677']}
          onExpandedKeysChange={() => {}}
          onSelectCatalog={() => {}}
          selectedCatalogId="17765"
          selectionMode="select"
        />,
      )
    })

    expect(capturedProps).not.toBeNull()
    if (!capturedProps) {
      throw new Error('expected tree props to be captured')
    }

    const treeProps: Record<string, unknown> = capturedProps

    expect(treeProps.checkable).toBe(false)
    expect(treeProps.checkedKeys).toBeUndefined()
    expect(treeProps.selectedKeys).toEqual(['17765'])
  })
})
