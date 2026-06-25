import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'

async function loadPlainTextInput() {
  mock.restore()
  const module = await import(`./plain-text-input.tsx?test=${Date.now()}-${Math.random()}`)
  return module.PlainTextInput
}

describe('PlainTextInput plain text behavior', () => {
  test('renders a native textarea and emits plain text changes', async () => {
    const PlainTextInput = await loadPlainTextInput()
    const onChange = mock(() => {})

    const renderer = create(
      <PlainTextInput
        value="已有内容"
        onChange={onChange}
        onSubmit={() => {}}
      />,
    )

    const textarea = renderer.root.findByType('textarea')
    expect(textarea.props.value).toBe('已有内容')

    act(() => {
      textarea.props.onChange({ currentTarget: { value: '新的纯文本' } })
    })

    expect(onChange).toHaveBeenCalledWith('新的纯文本')
  })

  test('pastes only text/plain content and discards formatted clipboard content', async () => {
    const PlainTextInput = await loadPlainTextInput()
    const onChange = mock(() => {})
    const preventDefault = mock(() => {})

    const renderer = create(
      <PlainTextInput
        value="Hello "
        onChange={onChange}
        onSubmit={() => {}}
      />,
    )

    const textarea = renderer.root.findByType('textarea')

    act(() => {
      textarea.props.onPaste({
        preventDefault,
        clipboardData: {
          files: [],
          getData: (type: string) => type === 'text/plain'
            ? 'World'
            : '<strong>World</strong>',
        },
        currentTarget: {
          value: 'Hello ',
          selectionStart: 6,
          selectionEnd: 6,
        },
      })
    })

    expect(preventDefault).toHaveBeenCalled()
    expect(onChange).toHaveBeenCalledWith('Hello World')
  })

  test('does not submit on Enter while submit is disabled', async () => {
    const PlainTextInput = await loadPlainTextInput()
    const onSubmit = mock(() => {})
    const preventDefault = mock(() => {})

    const renderer = create(
      <PlainTextInput
        submitDisabled
        value="处理中先记录"
        onChange={() => {}}
        onSubmit={onSubmit}
      />,
    )

    const textarea = renderer.root.findByType('textarea')

    act(() => {
      textarea.props.onKeyDown({
        key: 'Enter',
        shiftKey: false,
        nativeEvent: {
          isComposing: false,
        },
        preventDefault,
      })
    })

    expect(onSubmit).not.toHaveBeenCalled()
    expect(preventDefault).not.toHaveBeenCalled()
  })
})
