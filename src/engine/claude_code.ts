import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

export interface ToolResult {
  output: string
  error?: string
}

export class ClaudeCodeEngine {
  /**
   * File Read Tool (Claude Code equivalent)
   */
  public static async readFile(filePath: string): Promise<string> {
    const fullPath = path.resolve(filePath)
    if (!fs.existsSync(fullPath)) {
      throw new Error(`File not found: ${filePath}`)
    }
    return fs.readFileSync(fullPath, 'utf-8')
  }

  /**
   * File Write Tool
   */
  public static async writeFile(filePath: string, content: string): Promise<void> {
    const fullPath = path.resolve(filePath)
    const dir = path.dirname(fullPath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(fullPath, content, 'utf-8')
  }

  /**
   * File Edit Tool (Target & Replacement)
   */
  public static async editFile(filePath: string, target: string, replacement: string): Promise<void> {
    const content = await this.readFile(filePath)
    if (!content.includes(target)) {
      throw new Error(`Target text not found in ${filePath}`)
    }
    const updated = content.replace(target, replacement)
    await this.writeFile(filePath, updated)
  }

  /**
   * Bash Tool (Claude Code native shell execution)
   */
  public static async executeBash(command: string): Promise<string> {
    return new Promise((resolve) => {
      const isWin = process.platform === 'win32'
      const shell = isWin ? 'cmd.exe' : '/bin/bash'
      const flag = isWin ? '/c' : '-c'

      const child = spawn(shell, [flag, command], {
        cwd: process.cwd(),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      })

      let out = ''
      let err = ''

      child.stdout?.on('data', (d) => { out += d.toString() })
      child.stderr?.on('data', (d) => { err += d.toString() })

      child.on('close', (code) => {
        if (code !== 0 && err) {
          resolve(`(exit code ${code}): ${err}`)
        } else {
          resolve(out || err || 'Done')
        }
      })
    })
  }
}
