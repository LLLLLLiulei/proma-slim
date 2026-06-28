import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { act, create } from 'react-test-renderer'
import { CodeEditorStatusBar } from './CodeEditorStatusBar'

describe('CodeEditorStatusBar', () => {
  test('shows save action on the left and theme switch on the right', () => {
    const onThemeChange = mock(() => {})
    const onSave = mock(() => {})
    const renderer = create(
      <CodeEditorStatusBar
        themeId="dark"
        saveDisabled={false}
        onThemeChange={onThemeChange}
        onSave={onSave}
      />,
    )

    expect(renderer.root.findAllByType('button').map((button) => button.props['aria-label'])).toEqual([
      '保存文件',
      '编辑器主题',
    ])

    const switchButton = renderer.root.findByProps({ role: 'switch' })
    expect(switchButton.props['aria-label']).toBe('编辑器主题')
    expect(switchButton.props['aria-checked']).toBe(true)
    expect(switchButton.props.title).toBe('当前深色，点击切换为浅色')

    act(() => {
      switchButton.props.onClick()
    })

    expect(onThemeChange).toHaveBeenCalledWith('light')

    const saveButton = renderer.root.findByProps({ 'aria-label': '保存文件' })
    expect(saveButton.props.disabled).toBe(false)
    act(() => {
      saveButton.props.onClick()
    })
    expect(onSave).toHaveBeenCalled()
  })

  test('keeps theme switch enabled when save is disabled', () => {
    const renderer = create(
      <CodeEditorStatusBar
        themeId="light"
        saveDisabled={true}
        onThemeChange={mock(() => {})}
        onSave={mock(() => {})}
      />,
    )

    const switchButton = renderer.root.findByProps({ role: 'switch' })
    expect(switchButton.props.disabled).toBeUndefined()
    expect(switchButton.props['aria-checked']).toBe(false)

    act(() => {
      switchButton.props.onClick()
    })
    expect(renderer.root.findByProps({ 'aria-label': '保存文件' }).props.disabled).toBe(true)
  })
})
