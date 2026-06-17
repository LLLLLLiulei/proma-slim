import { afterEach, describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'

type AutoFocusEvent = {
  preventDefault: ReturnType<typeof mock>
}

interface DialogMockOptions {
  autoFocusEvents?: AutoFocusEvent[]
}

function installDialogMocks(options: DialogMockOptions = {}): void {
  mock.module('@/components/ui/dialog', () => {
    const passthrough = ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
      React.createElement('div', props, children)
    const DialogContent = ({
      children,
      onOpenAutoFocus,
      ...props
    }: React.PropsWithChildren<Record<string, unknown> & {
      onOpenAutoFocus?: (event: AutoFocusEvent) => void
    }>) => {
      React.useEffect(() => {
        if (typeof onOpenAutoFocus !== 'function') return

        const event = { preventDefault: mock(() => {}) }
        options.autoFocusEvents?.push(event)
        onOpenAutoFocus(event)
      }, [onOpenAutoFocus])

      return React.createElement('div', props, children)
    }

    return {
      Dialog: ({ children }: React.PropsWithChildren) => React.createElement(React.Fragment, null, children),
      DialogClose: passthrough,
      DialogContent,
      DialogDescription: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('p', props, children),
      DialogFooter: passthrough,
      DialogHeader: passthrough,
      DialogTitle: ({ children, ...props }: React.PropsWithChildren<Record<string, unknown>>) =>
        React.createElement('h2', props, children),
    }
  })
}

function flattenElementText(node: React.ReactNode): string {
  return React.Children.toArray(node).map((child) => {
    if (typeof child === 'string') {
      return child
    }

    if (typeof child === 'number') {
      return String(child)
    }

    if (React.isValidElement(child)) {
      return flattenElementText(child.props.children)
    }

    return ''
  }).join('')
}

function findButtonByText(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) =>
    node.type === 'button'
    && flattenElementText(node.props.children).trim() === label,
  )
}

function findControlByAriaLabel(renderer: ReturnType<typeof create>, label: string) {
  return renderer.root.find((node) => node.props['aria-label'] === label)
}

afterEach(() => {
  mock.restore()
})

describe('SaveTemplateDialog', () => {
  test('focuses the template name field when the dialog opens', async () => {
    const autoFocusEvents: AutoFocusEvent[] = []
    installDialogMocks({ autoFocusEvents })
    const focusTemplateName = mock(() => {})
    const { SaveTemplateDialog } = await import('./SaveTemplateDialog')

    await act(async () => {
      create(
        <SaveTemplateDialog
          defaultName="活动页项目"
          onOpenChange={() => {}}
          onSubmit={() => {}}
          open
        />,
        {
          createNodeMock(element) {
            if (element.type === 'input' && element.props['aria-label'] === '模板名称') {
              return { focus: focusTemplateName }
            }

            return {}
          },
        },
      )
    })

    expect(autoFocusEvents).toHaveLength(1)
    const autoFocusEvent = autoFocusEvents[0]
    if (!autoFocusEvent) {
      throw new Error('expected dialog auto focus event to be captured')
    }
    expect(autoFocusEvent.preventDefault).toHaveBeenCalledTimes(1)
    expect(focusTemplateName).toHaveBeenCalledTimes(1)
  })

  test('submits only the normalized template name', async () => {
    installDialogMocks()
    const onSubmit = mock(async () => {})
    const { SaveTemplateDialog } = await import('./SaveTemplateDialog')

    let renderer!: ReturnType<typeof create>
    await act(async () => {
      renderer = create(
        <SaveTemplateDialog
          defaultName="  活动页项目  "
          onOpenChange={() => {}}
          onSubmit={onSubmit}
          open
        />,
      )
    })

    expect(renderer.root.findAll((node) => node.props['aria-label'] === '模板描述')).toHaveLength(0)
    expect(renderer.root.findAll((node) => node.props['aria-label'] === '模板标签')).toHaveLength(0)

    await act(async () => {
      await findButtonByText(renderer, '保存模板').props.onClick()
    })

    expect(onSubmit).toHaveBeenCalledWith({
      name: '活动页项目',
    })
  })

  test('requires a non-empty name and disables duplicate submits while saving', async () => {
    installDialogMocks()
    const { SaveTemplateDialog } = await import('./SaveTemplateDialog')

    const emptyRenderer = create(
      <SaveTemplateDialog
        defaultName="   "
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
      />,
    )
    expect(findButtonByText(emptyRenderer, '保存模板').props.disabled).toBe(true)

    const submittingRenderer = create(
      <SaveTemplateDialog
        defaultName="活动页项目"
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
        submitting
      />,
    )
    expect(findButtonByText(submittingRenderer, '保存中...').props.disabled).toBe(true)
  })

  test('shows the CMS solidification notice only for CMS integrated builders', async () => {
    installDialogMocks()
    const { SaveTemplateDialog } = await import('./SaveTemplateDialog')

    const cmsRenderer = create(
      <SaveTemplateDialog
        cmsIntegrated
        defaultName="CMS 专题"
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
      />,
    )
    expect(JSON.stringify(cmsRenderer.toJSON())).toContain('CMS 数据会被固化为静态模板')
    expect(JSON.stringify(cmsRenderer.toJSON())).toContain('不保留 CMS 动态绑定或鉴权信息')

    const standaloneRenderer = create(
      <SaveTemplateDialog
        defaultName="普通专题"
        onOpenChange={() => {}}
        onSubmit={() => {}}
        open
      />,
    )
    expect(JSON.stringify(standaloneRenderer.toJSON())).not.toContain('CMS 数据会被固化为静态模板')
  })
})
