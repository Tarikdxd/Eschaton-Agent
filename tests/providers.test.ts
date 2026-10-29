import { describe, expect, test } from 'bun:test'
import http from 'node:http'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ProviderPool, providersFromSettings, type Provider } from '../src/llm/providers.js'
import { CodingAgent } from '../src/agent/coding-agent.js'

function serve(handler: (body: any, res: http.ServerResponse, count: number) => void): Promise<http.Server> {
  let count = 0
  const server = http.createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => handler(JSON.parse(raw || '{}'), res, ++count))
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function address(server: http.Server): string {
  const info = server.address() as { port: number }
  return `http://127.0.0.1:${info.port}/v1/chat/completions`
}

function sse(res: http.ServerResponse, chunks: string[]) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' })
  for (const chunk of chunks) {
    res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunk } }] })}\n\n`)
  }
  res.write('data: [DONE]\n\n')
  res.end()
}

describe('provider pool', () => {
  test('streams chunks and returns the full text', async () => {
    const server = await serve((_body, res) => sse(res, ['hello', ' world']))
    const provider: Provider = {
      id: 'test',
      label: 'Test',
      baseUrl: address(server),
      model: 'test-model',
      apiKey: 'key',
      local: false,
      free: false,
      cooldownUntil: 0,
    }

    const pool = new ProviderPool([provider])
    let streamed = ''
    const { text: output } = await pool.generate({
      messages: [{ role: 'user', content: 'hi' }],
      onChunk: (chunk) => (streamed += chunk),
    })

    server.close()
    expect(output).toBe('hello world')
    expect(streamed).toBe('hello world')
  })

  test('falls over to the next provider when one fails', async () => {
    const server = await serve((_body, res, count) => {
      if (count === 1) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end('{"error":"bad key"}')
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ choices: [{ message: { content: 'second' } }] }))
    })

    const base = { baseUrl: address(server), model: 'm', apiKey: 'k', local: false, cooldownUntil: 0 }
    const pool = new ProviderPool([
      { ...base, id: 'a', label: 'First' },
      { ...base, id: 'b', label: 'Second' },
    ])

    const { text: output } = await pool.generate({ messages: [{ role: 'user', content: 'x' }] })
    server.close()

    expect(output).toBe('second')
    expect(pool.active()?.label).toBe('Second')
  })

  test('reports an actionable error when everything fails', async () => {
    const server = await serve((_body, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end('{"error":"bad key"}')
    })

    const pool = new ProviderPool([
      {
        id: 'a',
        label: 'Broken',
        baseUrl: address(server),
        model: 'm',
        apiKey: 'k',
        local: false,
        cooldownUntil: 0,
      },
    ])

    const error = await pool.generate({ messages: [{ role: 'user', content: 'x' }] }).catch((err) => err)
    server.close()

    expect(String(error)).toContain('API key rejected')
  })

  test('reads native tool calls', async () => {
    const server = await serve((_body, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '',
                tool_calls: [
                  {
                    id: 'call_1',
                    type: 'function',
                    function: { name: 'read_file', arguments: '{"filePath":"a.ts"}' },
                  },
                ],
              },
            },
          ],
        }),
      )
    })

    const pool = new ProviderPool([
      {
        id: 'test',
        label: 'Test',
        baseUrl: address(server),
        model: 'm',
        apiKey: 'k',
        local: false,
        cooldownUntil: 0,
      },
    ])

    const result = await pool.generate({
      messages: [{ role: 'user', content: 'read a.ts' }],
      tools: [{ type: 'function', function: { name: 'read_file', description: 'read', parameters: { type: 'object' } } }],
    })

    server.close()

    expect(result.toolCalls).toHaveLength(1)
    expect(result.toolCalls[0]?.name).toBe('read_file')
    expect(result.toolCalls[0]?.arguments).toContain('a.ts')
  })

  test('builds providers from environment variables', () => {
    const providers = providersFromSettings({}, { OPENROUTER_API_KEY: 'sk-or-test' } as NodeJS.ProcessEnv)
    expect(providers).toHaveLength(1)
    expect(providers[0]?.id).toBe('openrouter')
    expect(providers[0]?.model).toContain('deepseek')
  })
})

describe('coding agent', () => {
  test('runs a tool call and feeds the result back', async () => {
    const toolCall = JSON.stringify({
      tool: 'write_file',
      args: { filePath: 'hello.txt', content: 'written\n' },
    })

    const server = await serve((body, res, count) => {
      const text = count === 1 ? '```tool:json\n' + toolCall + '\n```' : 'Done.'

      if (!body.stream) {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ choices: [{ message: { content: text } }] }))
        return
      }

      sse(res, [text])
    })

    const pool = new ProviderPool([
      {
        id: 'test',
        label: 'Test',
        baseUrl: address(server),
        model: 'm',
        apiKey: 'k',
        local: false,
        cooldownUntil: 0,
      },
    ])

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eschaton-'))
    const tools: string[] = []
    const agent = new CodingAgent(pool, dir)

    const { text: reply } = await agent.run('create hello.txt', {
      onToolStart: (call) => tools.push(call.name),
      onToolEnd: (result) => tools.push(result.isError ? 'error' : 'ok'),
    })

    server.close()

    const written = fs.readFileSync(path.join(dir, 'hello.txt'), 'utf-8')
    fs.rmSync(dir, { recursive: true, force: true })

    expect(reply).toBe('Done.')
    expect(tools).toEqual(['write_file', 'ok'])
    expect(written).toBe('written\n')
  })

  test('runs a native tool call and feeds the result back', async () => {
    const server = await serve((_body, res, count) => {
      res.writeHead(200, { 'Content-Type': 'application/json' })

      if (count === 1) {
        res.end(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: '',
                  tool_calls: [
                    {
                      id: 'call_native',
                      type: 'function',
                      function: {
                        name: 'write_file',
                        arguments: JSON.stringify({ filePath: 'native.txt', content: 'via tools' }),
                      },
                    },
                  ],
                },
              },
            ],
          }),
        )
        return
      }

      res.end(JSON.stringify({ choices: [{ message: { content: 'done' } }] }))
    })

    const pool = new ProviderPool([
      {
        id: 'test',
        label: 'Test',
        baseUrl: address(server),
        model: 'm',
        apiKey: 'k',
        local: false,
        cooldownUntil: 0,
      },
    ])

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'eschaton-native-'))
    const agent = new CodingAgent(pool, dir)
    const { text } = await agent.run('write native.txt')

    const written = fs.readFileSync(path.join(dir, 'native.txt'), 'utf-8')
    server.close()
    fs.rmSync(dir, { recursive: true, force: true })

    expect(text).toBe('done')
    expect(written).toBe('via tools')
  })
})

