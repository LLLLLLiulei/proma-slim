import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import type { PageBuilderTemplateSummary } from '@ai-page-builder/shared'
import { PageBuilderTemplateCard } from './PageBuilderTemplateCard'

const template: PageBuilderTemplateSummary = {
  id: 'template-1',
  name: 'Template Project',
  description: '',
  tags: [],
  sourceKind: 'saved-project',
  createdAt: '2026-06-15T12:00:00.000Z',
  previewUrl: '/api/page-builder/templates/template-1/preview/',
  deletable: true,
}

describe('PageBuilderTemplateCard', () => {
  test('uses the compact home resource card proportions and body spacing', () => {
    const renderer = create(
      <PageBuilderTemplateCard
        onDelete={() => {}}
        onDownload={() => {}}
        onPreview={() => {}}
        onUse={async () => {}}
        template={template}
      />,
    )

    const card = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-template-card'),
    )
    const preview = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-template-preview'),
    )
    const previewSurface = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('page-builder-home-template-preview-surface'),
    )
    const body = renderer.root.find((node) =>
      typeof node.props.className === 'string'
      && node.props.className.includes('px-4')
      && node.props.className.includes('py-3'),
    )
    const previewButton = renderer.root.find((node) => node.type === 'button' && node.props['aria-label'] === '预览模板')
    const downloadButton = renderer.root.find((node) => node.type === 'button' && node.props['aria-label'] === '下载模板')
    const useButton = renderer.root.find((node) => node.type === 'button' && node.props['aria-label'] === '使用模板')
    const deleteButton = renderer.root.find((node) => node.type === 'button' && node.props['aria-label'] === '删除模板')

    expect(card.props.className).toContain('rounded-[22px]')
    expect(preview.props.className).toContain('aspect-[4/3]')
    expect(previewSurface.props.className).toContain('rounded-[18px]')
    expect(body.props.className).toContain('space-y-2.5')
    expect(body.props.className).toContain('px-4 py-3')
    expect(previewButton.props.className).toContain('h-8 rounded-full px-2.5 text-xs')
    expect(previewButton.props.className).toContain('[&_svg]:size-3.5')
    expect(downloadButton.props.className).toContain('h-8 rounded-full px-2.5 text-xs')
    expect(downloadButton.props.className).toContain('[&_svg]:size-3.5')
    expect(useButton.props.className).toContain('h-8 rounded-full px-2.5 text-xs')
    expect(useButton.props.className).toContain('[&_svg]:size-3.5')
    expect(deleteButton.props.className).toContain('size-8')
    expect(deleteButton.props.className).toContain('[&_svg]:size-3.5')
  })

  test('calls the template download action from the card footer', () => {
    const onDownload = mock((_template: PageBuilderTemplateSummary) => {})
    const renderer = create(
      <PageBuilderTemplateCard
        onDelete={() => {}}
        onDownload={onDownload}
        onPreview={() => {}}
        onUse={async () => {}}
        template={template}
      />,
    )

    act(() => {
      renderer.root.findByProps({ 'aria-label': '下载模板' }).props.onClick()
    })

    expect(onDownload).toHaveBeenCalledWith(template)
  })

  test('omits the use action when template use is not available', () => {
    const renderer = create(
      <PageBuilderTemplateCard
        onDelete={() => {}}
        onDownload={() => {}}
        onPreview={() => {}}
        template={template}
      />,
    )

    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '预览模板')).toHaveLength(1)
    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '下载模板')).toHaveLength(1)
    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '使用模板')).toHaveLength(0)
    expect(renderer.root.findAll((node) => node.type === 'button' && node.props['aria-label'] === '删除模板')).toHaveLength(1)
  })

  test('edits the template name inline and saves with Enter', async () => {
    const onRename = mock(async (_template: PageBuilderTemplateSummary, _name: string) => {})
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PageBuilderTemplateCard
          onDelete={() => {}}
          onDownload={() => {}}
          onPreview={() => {}}
          onRename={onRename}
          onUse={async () => {}}
          template={template}
        />,
      )
    })

    const titleButton = renderer.root.findAllByType('button').find((button) => button.children.join('') === 'Template Project')
    expect(titleButton).toBeDefined()

    await act(async () => {
      titleButton!.props.onClick()
    })

    const input = renderer.root.findByProps({ 'aria-label': '模板名称' })
    expect(input.props.value).toBe('Template Project')
    expect(input.props.className).toContain('border-b border-primary/40')
    expect(input.props.className).toContain('bg-transparent px-0 py-0.5 text-sm font-medium outline-none')

    await act(async () => {
      input.props.onChange({ currentTarget: { value: '  Renamed Template  ' } })
    })

    await act(async () => {
      await input.props.onKeyDown({ key: 'Enter', preventDefault: mock(() => {}) })
    })

    expect(onRename).toHaveBeenCalledWith(template, 'Renamed Template')
  })

  test('uses the builder title-bar edit affordance for template names', () => {
    const renderer = create(
      <PageBuilderTemplateCard
        onDelete={() => {}}
        onDownload={() => {}}
        onPreview={() => {}}
        onUse={async () => {}}
        template={template}
      />,
    )

    const editButton = renderer.root.findByProps({ 'aria-label': '编辑模板名称' })
    expect(editButton.props.className).toContain('p-1 text-muted-foreground transition-colors hover:text-foreground')
    expect(JSON.stringify(renderer.toJSON())).toContain('size-3.5')
  })

  test('keeps template name editing open when the next name is empty', async () => {
    const onRename = mock(async (_template: PageBuilderTemplateSummary, _name: string) => {})
    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <PageBuilderTemplateCard
          onDelete={() => {}}
          onDownload={() => {}}
          onPreview={() => {}}
          onRename={onRename}
          onUse={async () => {}}
          template={template}
        />,
      )
    })

    await act(async () => {
      renderer.root.findByProps({ 'aria-label': '编辑模板名称' }).props.onClick()
    })

    const input = renderer.root.findByProps({ 'aria-label': '模板名称' })
    await act(async () => {
      input.props.onChange({ currentTarget: { value: '   ' } })
    })

    const updatedInput = renderer.root.findByProps({ 'aria-label': '模板名称' })
    await act(async () => {
      await updatedInput.props.onKeyDown({ key: 'Enter', preventDefault: mock(() => {}) })
    })

    expect(onRename).not.toHaveBeenCalled()
    expect(JSON.stringify(renderer.toJSON())).toContain('名称不能为空')
  })
})
