import { describe, expect, test } from 'bun:test'
import {
  PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS,
  PAGE_BUILDER_HOST_TOOLBAR_BUTTON_MAX_COUNT,
  PAGE_BUILDER_HOST_TOOLBAR_LABEL_MAX_LENGTH,
  normalizePageBuilderHostToolbarExtensions,
  parsePageBuilderHostToolbarExtensions,
  PageBuilderHostToolbarExtensionsValidationError,
} from './page-builder-host-toolbar-extensions'

describe('page builder host toolbar extensions', () => {
  test('keeps host toolbar icon whitelist unique', () => {
    expect(new Set(PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS).size).toBe(PAGE_BUILDER_HOST_TOOLBAR_BUTTON_ICONS.length)
  })

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

  test('normalizes common action icons and controlled hex button colors', () => {
    const result = normalizePageBuilderHostToolbarExtensions({
      buttons: [
        {
          id: 'publish',
          label: '发布专题',
          icon: 'rocket',
          variant: 'primary',
          themeColor: ' #16A34A ',
          textColor: '#FFF',
        },
        {
          id: 'workflow',
          type: 'dropdown',
          label: '工作流',
          icon: 'workflow',
          themeColor: '#2563eb',
          textColor: '#ffffff',
          items: [
            { id: 'preview', label: '预览', icon: 'eye' },
            { id: 'logs', label: '日志', icon: 'scroll-text' },
            { id: 'template', label: '另存模板', icon: 'layout-template' },
            { id: 'gallery', label: '图集', icon: 'image' },
            { id: 'schedule', label: '日程', icon: 'calendar-clock' },
            { id: 'package', label: '模板包', icon: 'package-open' },
            { id: 'ai', label: '智能辅助', icon: 'wand-sparkles' },
          ],
        },
      ],
    })

    expect(result.buttons).toEqual([
      {
        id: 'publish',
        label: '发布专题',
        icon: 'rocket',
        variant: 'primary',
        themeColor: '#16a34a',
        textColor: '#fff',
      },
      {
        id: 'workflow',
        type: 'dropdown',
        label: '工作流',
        icon: 'workflow',
        themeColor: '#2563eb',
        textColor: '#ffffff',
        items: [
          { id: 'preview', label: '预览', icon: 'eye' },
          { id: 'logs', label: '日志', icon: 'scroll-text' },
          { id: 'template', label: '另存模板', icon: 'layout-template' },
          { id: 'gallery', label: '图集', icon: 'image' },
          { id: 'schedule', label: '日程', icon: 'calendar-clock' },
          { id: 'package', label: '模板包', icon: 'package-open' },
          { id: 'ai', label: '智能辅助', icon: 'wand-sparkles' },
        ],
      },
    ])
  })

  test('drops invalid buttons, duplicate ids, unsafe fields, and caps button count and labels', () => {
    const longLabel = '这是一个超过最大长度的宿主扩展按钮文案'
    const result = normalizePageBuilderHostToolbarExtensions({
      buttons: [
        { id: 'publish', label: longLabel, icon: 'send', html: '<b>bad</b>', onClick: 'alert(1)' },
        { id: 'publish', label: '重复发布' },
        { id: 'bad id', label: '坏 ID' },
        { id: 'bad-icon', label: '坏图标', icon: 'script', variant: 'javascript', themeColor: 'red', textColor: 'var(--x)' },
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
    expect(JSON.stringify(result)).not.toContain('var(--x)')
  })

  test('normalizes dropdown buttons with safe items and strips unsafe item fields', () => {
    const result = normalizePageBuilderHostToolbarExtensions({
      buttons: [
        {
          id: 'publish',
          type: 'dropdown',
          label: '发布',
          tooltip: '发布相关操作',
          icon: 'send',
          variant: 'primary',
          requiresPreview: true,
          order: 10,
          items: [
            {
              id: 'preview',
              label: '发布预览版',
              tooltip: '发布到预览环境',
              icon: 'external-link',
              requiresPreview: true,
              url: 'https://cms.example.com/publish',
              token: 'secret-token',
              onClick: 'alert(1)',
            },
            {
              id: 'logs',
              label: '查看日志',
              icon: 'download',
              disabled: true,
              hidden: false,
            },
          ],
        },
      ],
    })

    expect(result.buttons).toEqual([
      {
        id: 'publish',
        type: 'dropdown',
        label: '发布',
        tooltip: '发布相关操作',
        icon: 'send',
        variant: 'primary',
        requiresPreview: true,
        order: 10,
        items: [
          {
            id: 'preview',
            label: '发布预览版',
            tooltip: '发布到预览环境',
            icon: 'external-link',
            requiresPreview: true,
          },
          {
            id: 'logs',
            label: '查看日志',
            icon: 'download',
            disabled: true,
            hidden: false,
          },
        ],
      },
    ])
    expect(JSON.stringify(result)).not.toContain('https://cms.example.com/publish')
    expect(JSON.stringify(result)).not.toContain('secret-token')
    expect(JSON.stringify(result)).not.toContain('alert(1)')
  })

  test('drops invalid dropdown items and caps item count in loose normalization', () => {
    const result = normalizePageBuilderHostToolbarExtensions({
      buttons: [
        {
          id: 'publish',
          type: 'dropdown',
          label: '发布',
          items: [
            { id: 'bad id', label: '非法 ID' },
            { id: 'duplicate', label: '保留第一个' },
            { id: 'duplicate', label: '重复项' },
            { id: 'bad-icon', label: '坏图标', icon: 'script' },
            { id: 'one', label: '一' },
            { id: 'two', label: '二' },
            { id: 'three', label: '三' },
            { id: 'four', label: '四' },
            { id: 'five', label: '五' },
            { id: 'six', label: '六' },
            { id: 'seven', label: '七' },
          ],
        },
      ],
    })

    expect(result.buttons[0]).toMatchObject({
      id: 'publish',
      type: 'dropdown',
      items: [
        { id: 'duplicate', label: '保留第一个' },
        { id: 'bad-icon', label: '坏图标' },
        { id: 'one', label: '一' },
        { id: 'two', label: '二' },
        { id: 'three', label: '三' },
        { id: 'four', label: '四' },
        { id: 'five', label: '五' },
        { id: 'six', label: '六' },
      ],
    })
  })

  test('strict parser rejects invalid toolbar extension input for server-side APIs', () => {
    expect(() => parsePageBuilderHostToolbarExtensions({
      buttons: [
        { id: 'publish', label: '发布' },
        { id: 'bad id', label: '坏 ID' },
      ],
    })).toThrow(PageBuilderHostToolbarExtensionsValidationError)

    expect(() => parsePageBuilderHostToolbarExtensions({
      buttons: [
        { id: 'publish', label: '发布', themeColor: 'red' },
      ],
    })).toThrow(PageBuilderHostToolbarExtensionsValidationError)

    expect(() => parsePageBuilderHostToolbarExtensions({
      buttons: [
        { id: 'publish', label: '发布', textColor: '#12345' },
      ],
    })).toThrow(PageBuilderHostToolbarExtensionsValidationError)
  })

  test('strict parser rejects invalid dropdown item config for server-side APIs', () => {
    expect(() => parsePageBuilderHostToolbarExtensions({
      buttons: [
        {
          id: 'publish',
          type: 'dropdown',
          label: '发布',
          items: [
            { id: 'preview', label: '发布预览版' },
            { id: 'bad id', label: '非法 ID' },
          ],
        },
      ],
    })).toThrow(PageBuilderHostToolbarExtensionsValidationError)

    expect(() => parsePageBuilderHostToolbarExtensions({
      buttons: [
        {
          id: 'publish',
          type: 'dropdown',
          label: '发布',
          items: [
            { id: 'one', label: '一' },
            { id: 'two', label: '二' },
            { id: 'three', label: '三' },
            { id: 'four', label: '四' },
            { id: 'five', label: '五' },
            { id: 'six', label: '六' },
            { id: 'seven', label: '七' },
            { id: 'eight', label: '八' },
            { id: 'nine', label: '九' },
          ],
        },
      ],
    })).toThrow(PageBuilderHostToolbarExtensionsValidationError)
  })
})
