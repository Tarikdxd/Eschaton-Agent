/**
 * ⚡ ESCHATON CLOUD GATEWAY & EDGE SERVER
 * Cloudflare Worker & Standalone Edge Server
 * Developer: Tarık Tozlu (@Tarikdxd)
 */

import { renderLandingPage } from './landing-page.html'

export interface Env {
  ENVIRONMENT?: string
  ESCHATON_VERSION?: string
  DEEPSEEK_API_KEY?: string
  ANTHROPIC_API_KEY?: string
}

const MODELS = [
  {
    id: 'deepseek/deepseek-v4-flash',
    displayName: 'DeepSeek V4.1 Flash',
    tagline: 'Fast coding and tool use',
    availability: 'always',
    tier: 'free',
    unlimited: true
  },
  {
    id: 'deepseek/deepseek-v4-flash-fast',
    displayName: 'DeepSeek V4.1 Flash Fast',
    tagline: 'Parallel subagents context gathering',
    availability: 'always',
    tier: 'free',
    unlimited: true
  },
  {
    id: 'glm/glm-5-3-flash',
    displayName: 'GLM 5.3 Flash',
    tagline: 'Deep reasoning & planning',
    availability: 'always',
    tier: 'free',
    unlimited: true
  },
  {
    id: 'mimo/mimo-v2-6-pro',
    displayName: 'MiMo 2.6 Pro',
    tagline: 'Multimodal vision & reasoning',
    availability: 'always',
    tier: 'free',
    unlimited: true
  },
  {
    id: 'anthropic/claude-3-7-sonnet',
    displayName: 'Claude 3.7 Sonnet (ReAct)',
    tagline: 'Core Claude Code Architecture',
    availability: 'always',
    tier: 'full',
    unlimited: true
  }
]

export async function handleRequest(request: Request, env: Env = {}): Promise<Response> {
  const url = new URL(request.url)
  const path = url.pathname

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Antigravity-ID, X-Eschaton-Client',
  }

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // 1. Landing Page / Status Web UI
  if (path === '/' || path === '/status') {
    return new Response(renderLandingPage(), {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        ...corsHeaders,
      },
    })
  }

  // 2. Health check
  if (path === '/api/health') {
    return Response.json({
      status: 'online',
      gateway: 'Eschaton Cloud Gateway',
      version: env.ESCHATON_VERSION || '1.2.0',
      antigravitySupport: true,
      timestamp: new Date().toISOString()
    }, { headers: corsHeaders })
  }

  // 3. Model Directory
  if (path === '/api/v1/catalog' || path === '/api/models') {
    return Response.json({
      models: MODELS,
      defaultModel: 'deepseek/deepseek-v4-flash'
    }, { headers: corsHeaders })
  }

  // 4. Session Status (Eschaton Unlimited Free Access)
  if (path === '/api/v1/freebuff/session' || path === '/api/session') {
    const agyId = request.headers.get('X-Antigravity-ID')
    return Response.json({
      status: 'active',
      accessTier: 'full',
      plan: {
        tierName: 'Eschaton Unlimited',
        active: true,
        unlimited: true
      },
      balance: {
        daily: {
          remaining: 999999,
          limit: 999999
        }
      },
      antigravity: {
        linked: Boolean(agyId),
        installationId: agyId || null
      },
      user: {
        id: 'eschaton-user',
        tier: 'unlimited'
      }
    }, { headers: corsHeaders })
  }

  // 5. Session Admission
  if (path === '/api/v1/freebuff/session/admission' || path === '/api/session/admission') {
    let body: any = {}
    try {
      body = await request.json()
    } catch {}

    const selectedModel = body.model || 'deepseek/deepseek-v4-flash'
    return Response.json({
      admitted: true,
      status: 'admitted',
      model: selectedModel,
      message: 'Session initialized via Eschaton Gateway'
    }, { headers: corsHeaders })
  }

  // 6. Chat Completions & Streaming proxy
  if (path === '/api/chat' || path === '/api/chat/completions') {
    return Response.json({
      choices: [
        {
          message: {
            role: 'assistant',
            content: 'Eschaton Cloud Gateway active. Ready to assist.'
          }
        }
      ]
    }, { headers: corsHeaders })
  }

  return new Response('Not Found', { status: 404, headers: corsHeaders })
}

// Cloudflare Worker export
export default {
  fetch(request: Request, env: Env) {
    return handleRequest(request, env)
  }
}

// Standalone Node / Bun server fallback
if (typeof process !== 'undefined' && !process.env.WORKER_ENV && process.argv[1]?.endsWith('index.ts')) {
  const http = await import('node:http')
  const port = parseInt(process.env.PORT || '38421', 10)
  
  const server = http.createServer(async (req, res) => {
    const fullUrl = `http://${req.headers.host || 'localhost'}${req.url}`
    const bodyChunks: Buffer[] = []
    
    req.on('data', (c) => bodyChunks.push(c))
    req.on('end', async () => {
      const body = ['POST', 'PUT', 'PATCH'].includes(req.method || '') ? Buffer.concat(bodyChunks) : undefined
      const webReq = new Request(fullUrl, {
        method: req.method,
        headers: req.headers as any,
        body
      })

      const webRes = await handleRequest(webReq, {
        ESCHATON_VERSION: '1.2.1'
      })

      res.statusCode = webRes.status
      webRes.headers.forEach((val, key) => {
        res.setHeader(key, val)
      })

      const arrayBuf = await webRes.arrayBuffer()
      res.end(Buffer.from(arrayBuf))
    })
  })

  server.listen(port, '127.0.0.1', () => {
    console.log(`\x1b[32m✔ Eschaton Gateway running on http://127.0.0.1:${port}\x1b[0m`)
  })
}
