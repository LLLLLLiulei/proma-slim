import { describe, expect, mock, test } from 'bun:test'
import React from 'react'
import { create } from 'react-test-renderer'
import type { WorkspaceFileEntry } from '@page-builder/lib/workspace-files-api'
import { CodeExplorer } from './CodeExplorer'

const entries: WorkspaceFileEntry[] = [
  { path: 'assets', name: 'assets', type: 'directory', size: 0 },
  { path: 'index.html', name: 'index.html', type: 'file', size: 12 },
]

describe('CodeExplorer', () => {
  test('keeps file and directory icons aligned at the same tree depth', () => {
    const renderer = create(
      <CodeExplorer
        activePath="index.html"
        dirtyPaths={new Set()}
        entries={entries}
        onSelect={mock(() => {})}
      />,
    )

    const topLevelRows = renderer.root.findAll((node) =>
      node.type === 'div'
      && node.props['data-code-explorer-row-depth'] === 0
    )
    const expanderSlots = topLevelRows.map((row) => row.findByProps({ 'data-code-explorer-expander-slot': true }))
    const iconSlots = topLevelRows.map((row) => row.findByProps({ 'data-code-explorer-icon-slot': true }))

    expect(topLevelRows).toHaveLength(2)
    expect(expanderSlots.map((slot) => slot.props.className)).toEqual([
      expanderSlots[0]?.props.className,
      expanderSlots[0]?.props.className,
    ])
    expect(iconSlots.map((slot) => slot.props.className)).toEqual([
      iconSlots[0]?.props.className,
      iconSlots[0]?.props.className,
    ])
  })
})
