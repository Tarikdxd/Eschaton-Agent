import React from 'react'
import { useTheme } from '../hooks/use-theme'

export function DisplayAdStatusline({ placementId }: { placementId?: string }) {
  const theme = useTheme()
  return (
    <text style={{ fg: theme.muted, paddingLeft: 1 }}>
      <span fg={theme.primary}>◈ Eschaton Code v1.2.0</span>
      <span> · </span>
      <span fg={theme.secondary}>Antigravity Integrated</span>
      <span> · </span>
      <span fg={theme.muted}>Press </span>
      <span fg={theme.foreground}>/help</span>
      <span fg={theme.muted}> for commands</span>
    </text>
  )
}
