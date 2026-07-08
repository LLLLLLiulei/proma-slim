import { describe, expect, test } from 'bun:test'
import {
  PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT,
  PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH,
  normalizePageBuilderHostToolbarExtensions,
  parsePageBuilderHostToolbarExtensions,
  PageBuilderHostToolbarExtensionsValidationError,
} from './page-builder-host-toolbar-extensions'

describe('page builder host toolbar extensions', () => {
  test('normalizes empty or missing toolbar extension input to an empty button list', () => {
    expect(normalizePageBuilderHostToolbarExtensions(undefined)).toEqual({ buttons: [] })
    expect(normalizePageBuilderHostToolbarExtensions({})).toEqual({ buttons: [] })
    expect(normalizePageBuilderHostToolbarExtensions({ buttons: 'invalid' })).toEqual({ buttons: [] })
  })

  test('normalizes safe button fields and orders them by order then input position', () => {
    const result = normalizePageBuilderHostToolbarExtensions({
      buttons: [
        {
          id: 'audit',
          label: '送审',
          tooltip: '提交到外部 CMS 审核流程',
          icon: 'check',
          variant: 'primary',
          disabled: true,
          busy: false,
          hidden: false,
          requiresPreview: true,
          order: 20,
        },
        {
          id: 'publish',
          label: '发布专题',
          icon: 'send',
          variant: 'outline',
          order: 10,
        },
      ],
    })

    expect(result.buttons.map((button) => button.id)).toEqual(['publish', 'audit'])
    expect(result.buttons[0]).toEqual({
      id: 'publish',
      label: '发布专题',
      icon: 'send',
      variant: 'outline',
      order: 10,
    })
    expect(result.buttons[1]).toEqual({
      id: 'audit',
      label: '送审',
      tooltip: '提交到外部 CMS 审核流程',
      icon: 'check',
      variant: 'primary',
      disabled: true,
      busy: false,
      hidden: false,
      requiresPreview: true,
      order: 20,
    })
  })

  test('drops invalid buttons, duplicate ids, unsafe fields, and caps button count and labels', () => {
    const longLabel = '这是一个超过最大长度的宿主扩展按钮文案'
    const result = normalizePageBuilderHostToolbarExtensions({
      buttons: [
        { id: 'publish', label: longLabel, icon: 'send', html: '<b>bad</b>', onClick: 'alert(1)' },
        { id: 'publish', label: '重复发布' },
        { id: 'bad id', label: '坏 ID' },
        { id: 'bad-icon', label: '坏图标', icon: 'script', variant: 'javascript' },
        { id: 'b1', label: '一' },
        { id: 'b2', label: '二' },
        { id: 'b3', label: '三' },
        { id: 'b4', label: '四' },
        { id: 'b5', label: '五' },
      ],
    })

    expect(result.buttons).toHaveLength(PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT)
    expect(result.buttons.map((button) => button.id)).toEqual(['publish', 'bad-icon', 'b1', 'b2', 'b3'])
    expect(result.buttons[0]?.label).toBe(longLabel.slice(0, PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH))
    expect(result.buttons[0]).not.toHaveProperty('html')
    expect(result.buttons[0]).not.toHaveProperty('onClick')
    expect(result.buttons[1]).toEqual({
      id: 'bad-icon',
      label: '坏图标',
    })
  })

  test('strict parser rejects invalid toolbar extension input for server-side APIs', () => {
    expect(() => parsePageBuilderHostToolbarExtensions({
      buttons: [
        { id: 'publish', label: '发布' },
        { id: 'bad id', label: '坏 ID' },
      ],
    })).toThrow(PageBuilderHostToolbarExtensionsValidationError)
  })
})
