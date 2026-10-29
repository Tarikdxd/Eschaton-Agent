import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface AntigravitySession {
  authenticated: boolean
  installationId: string
  sessionToken?: string
  connectedBrainPath?: string
  userEmail?: string
}

export class AntigravityAuth {
  private static AGY_DIR = path.join(os.homedir(), '.gemini', 'antigravity')

  /**
   * Checks if local Antigravity environment is active and extracts installation identity.
   */
  public static detectLocalInstallation(): AntigravitySession {
    try {
      const installIdFile = path.join(this.AGY_DIR, 'installation_id')
      if (fs.existsSync(installIdFile)) {
        const id = fs.readFileSync(installIdFile, 'utf-8').trim()
        return {
          authenticated: true,
          installationId: id,
          connectedBrainPath: path.join(this.AGY_DIR, 'brain'),
          userEmail: process.env.ANTIGRAVITY_USER || 'kanserinc@protonmail.com'
        }
      }
    } catch {
      // Fallback
    }

    return {
      authenticated: false,
      installationId: 'unlinked'
    }
  }

  /**
   * Authenticate with a custom Antigravity token or device key.
   */
  public static loginWithToken(token: string): AntigravitySession {
    return {
      authenticated: true,
      installationId: `agy-${token.substring(0, 8)}`,
      sessionToken: token,
      connectedBrainPath: path.join(this.AGY_DIR, 'brain'),
      userEmail: 'authenticated-operator@antigravity.internal'
    }
  }
}
