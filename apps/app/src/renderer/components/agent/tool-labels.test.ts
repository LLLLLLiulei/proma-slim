import { describe, expect, test } from 'bun:test'
import { formatAgentMcpServerLabel, formatAgentSkillLabel, formatAgentToolLabel } from './tool-labels'

describe('tool label mappings', () => {
  test('covers the current local Playwright MCP tool set', () => {
    const playwrightToolLabels = new Map<string, string>([
      ['mcp__playwright__browser_navigate', '浏览器自动化 / 打开页面'],
      ['mcp__playwright__browser_click', '浏览器自动化 / 点击元素'],
      ['mcp__playwright__browser_close', '浏览器自动化 / 关闭页面'],
      ['mcp__playwright__browser_console_messages', '浏览器自动化 / 查看控制台消息'],
      ['mcp__playwright__browser_drag', '浏览器自动化 / 拖拽元素'],
      ['mcp__playwright__browser_evaluate', '浏览器自动化 / 执行页面脚本'],
      ['mcp__playwright__browser_file_upload', '浏览器自动化 / 上传文件'],
      ['mcp__playwright__browser_fill_form', '浏览器自动化 / 填写表单'],
      ['mcp__playwright__browser_handle_dialog', '浏览器自动化 / 处理弹窗'],
      ['mcp__playwright__browser_hover', '浏览器自动化 / 悬停元素'],
      ['mcp__playwright__browser_navigate_back', '浏览器自动化 / 返回上一页'],
      ['mcp__playwright__browser_network_requests', '浏览器自动化 / 查看网络请求'],
      ['mcp__playwright__browser_press_key', '浏览器自动化 / 按下按键'],
      ['mcp__playwright__browser_resize', '浏览器自动化 / 调整窗口大小'],
      ['mcp__playwright__browser_run_code', '浏览器自动化 / 执行自动化脚本'],
      ['mcp__playwright__browser_select_option', '浏览器自动化 / 选择下拉选项'],
      ['mcp__playwright__browser_snapshot', '浏览器自动化 / 获取页面快照'],
      ['mcp__playwright__browser_tabs', '浏览器自动化 / 管理标签页'],
      ['mcp__playwright__browser_take_screenshot', '浏览器自动化 / 页面截图'],
      ['mcp__playwright__browser_type', '浏览器自动化 / 输入文本'],
      ['mcp__playwright__browser_wait_for', '浏览器自动化 / 等待页面状态'],
    ])

    for (const [toolName, expectedLabel] of playwrightToolLabels) {
      expect(formatAgentToolLabel(toolName)).toBe(expectedLabel)
    }
  })

  test('covers the current local Playwright MCP server label', () => {
    expect(formatAgentMcpServerLabel('playwright')).toBe('浏览器自动化')
  })

  test('uses neutral cms binding labels for cms apply tools', () => {
    expect(formatAgentToolLabel('mcp__cms__apply_cms_binding')).toBe('CMS / 应用 CMS 绑定')
  })

  test('labels topic-page-style as the page-builder topic page visual worker', () => {
    expect(formatAgentSkillLabel('topic-page-style')).toBe('专题页视觉设计')
    expect(formatAgentSkillLabel('workspace-slug:topic-page-style')).toBe('专题页视觉设计')
  })
})
