import * as React from 'react'

interface SidePanelProps {
  sessionId: string
  sessionPath: string | null
}

export function SidePanel({ sessionId, sessionPath }: SidePanelProps): React.ReactElement | null {
  void sessionId
  void sessionPath
  return null
}
