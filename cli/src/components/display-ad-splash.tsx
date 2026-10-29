import { TextAttributes } from '@opentui/core'
import React from 'react'
import { useTheme } from '../hooks/use-theme'

export type DisplayAdSplashVariant = 'boxed' | 'line'

export function displayAdSplashVariant(terminalHeight: number): DisplayAdSplashVariant {
  return terminalHeight < 28 ? 'line' : 'boxed'
}

export function DisplayAdSplash({ width }: { width?: number; variant?: DisplayAdSplashVariant; placementId?: string }) {
  const theme = useTheme()
  return (
    <box
      style={{
        width: width ?? '100%',
        marginTop: 1,
        paddingLeft: 1,
        paddingRight: 1,
        border: true,
        borderColor: theme.primary,
        flexDirection: 'column',
      }}
    >
      <text style={{ fg: theme.primary, wrapMode: 'word' }}>
        <span attributes={TextAttributes.BOLD}>⚡ ESCHATON ECOSYSTEM</span>
        <span fg={theme.muted}> · Autonomous AI Coding Agent</span>
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        <span>⚛ Antigravity Sync: </span>
        <span fg={theme.foreground}>Local Brain & Session Linked</span>
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>
        <span>🧠 Engine: </span>
        <span fg={theme.foreground}>Claude Code ReAct Tools · Type </span>
        <span fg={theme.primary}>/model</span>
        <span> to select DeepSeek V4.1, GLM 5.3, MiMo</span>
      </text>
    </box>
  )
}
