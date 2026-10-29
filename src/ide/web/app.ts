import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

declare global {
  interface Window {
    monaco: any
    monacoReady: Promise<any>
  }
}

type Tab = { path: string; model: any; dirty: boolean; saved: string; viewState?: any }

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T

const state = {
  cwd: '',
  model: null as string | null,
  provider: null as string | null,
  sessionId: null as string | null,
  mode: 'Build',
  tabs: new Map<string, Tab>(),
  active: null as string | null,
  expanded: new Set<string>(['']),
  files: [] as string[],
  busy: false,
}

let monaco: any
let editor: any

/* ------------------------------------------------------------------ api */

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? `HTTP ${res.status}`)
  return (await res.json()) as T
}

/* --------------------------------------------------------------- editor */

async function initEditor(): Promise<void> {
  monaco = await window.monacoReady

  monaco.editor.defineTheme('eschaton-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7688', fontStyle: 'italic' },
      { token: 'keyword', foreground: '9db2ff' },
      { token: 'string', foreground: '9ed49b' },
      { token: 'number', foreground: 'e0b07e' },
      { token: 'type', foreground: '7fd4d0' },
    ],
    colors: {
      'editor.background': '#14161b',
      'editor.foreground': '#d8dee9',
      'editor.lineHighlightBackground': '#1a1e26',
      'editorLineNumber.foreground': '#3f4756',
      'editorLineNumber.activeForeground': '#8590a3',
      'editor.selectionBackground': '#2b3446',
      'editorCursor.foreground': '#7c9cff',
      'editorIndentGuide.background1': '#21262f',
      'editorWidget.background': '#1c2028',
      'editorSuggestWidget.background': '#1c2028',
      'editorSuggestWidget.border': '#2a303c',
    },
  })

  $('editor').style.visibility = 'hidden'

  editor = monaco.editor.create($('editor'), {
    theme: 'eschaton-dark',
    automaticLayout: true,
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    smoothScrolling: true,
    cursorBlinking: 'smooth',
    renderLineHighlight: 'line',
    padding: { top: 10 },
    tabSize: 2,
  })

  editor.onDidChangeModelContent(() => {
    if (!state.active) return
    const tab = state.tabs.get(state.active)
    if (!tab) return
    tab.dirty = tab.model.getValue() !== tab.saved
    renderTabs()
  })

  editor.onDidChangeCursorPosition((event: any) => {
    $('status-position').textContent = `${event.position.lineNumber}:${event.position.column}`
  })

  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => void saveActive())

  monaco.editor.onDidChangeMarkers?.(() => {})
}

async function openFile(path: string): Promise<void> {
  const existing = state.tabs.get(path)
  if (existing) return activate(path)

  const { content } = await api<{ content: string }>(`/api/file?path=${encodeURIComponent(path)}`)
  const uri = monaco.Uri.file(path)
  let model = monaco.editor.getModel(uri)
  if (!model) model = monaco.editor.createModel(content, languageOf(path), uri)

  state.tabs.set(path, { path, model, dirty: false, saved: content } as Tab)
  activate(path)
}

function activate(path: string): void {
  const tab = state.tabs.get(path)
  if (!tab) return

  if (state.active) {
    const current = state.tabs.get(state.active)
    if (current) current.viewState = editor.saveViewState()
  }

  state.active = path
  editor.setModel(tab.model)
  if (tab.viewState) editor.restoreViewState(tab.viewState)

  $('editor').style.visibility = 'visible'
  $('welcome').classList.add('hidden')
  $('status-path').textContent = path
  $('status-language').textContent = tab.model.getLanguageId()
  editor.focus()
  renderTabs()
  highlightTree()
}

async function saveActive(): Promise<void> {
  const path = state.active
  if (!path) return
  const tab = state.tabs.get(path)
  if (!tab || !tab.dirty) return

  await api('/api/file', { method: 'PUT', body: JSON.stringify({ path, content: tab.model.getValue() }) })
  tab.saved = tab.model.getValue()
  tab.dirty = false
  renderTabs()
  $('composer-hint').textContent = `saved ${path}`
}

function closeTab(path: string): void {
  const tab = state.tabs.get(path)
  if (!tab) return

  if (tab.dirty && !confirm(`${path} has unsaved changes. Close it?`)) return

  state.tabs.delete(path)
  if (state.active === path) {
    state.active = null
    const next = [...state.tabs.keys()].pop()
    if (next) activate(next)
    else {
      editor.setModel(null)
      $('editor').style.visibility = 'hidden'
      $('welcome').classList.remove('hidden')
      $('status-path').textContent = ''
      $('status-language').textContent = ''
    }
  }
  renderTabs()
}

function renderTabs(): void {
  const container = $('tabs')
  container.innerHTML = ''

  for (const [path, tab] of state.tabs) {
    const el = document.createElement('div')
    el.className = `tab${path === state.active ? ' active' : ''}`
    el.title = path

    const name = document.createElement('span')
    name.textContent = path.split('/').pop() ?? path
    el.append(name)

    if (tab.dirty) {
      const dot = document.createElement('span')
      dot.className = 'dirty'
      dot.textContent = '●'
      el.append(dot)
    }

    const close = document.createElement('span')
    close.className = 'close'
    close.textContent = '✕'
    close.onclick = (event) => {
      event.stopPropagation()
      closeTab(path)
    }
    el.append(close)

    el.onclick = () => activate(path)
    container.append(el)
  }
}

const LANGUAGES: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  html: 'html',
  md: 'markdown',
  py: 'python',
  rs: 'rust',
  go: 'go',
  java: 'java',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  sh: 'shell',
  bash: 'shell',
  yml: 'yaml',
  yaml: 'yaml',
  toml: 'ini',
  sql: 'sql',
  xml: 'xml',
}

function languageOf(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return LANGUAGES[ext] ?? 'plaintext'
}

/* ---------------------------------------------------------------- files */

async function loadTree(): Promise<void> {
  const { files } = await api<{ files: string[] }>('/api/files')
  state.files = files
  renderTree()
}

function buildTree(): Array<{ name: string; path: string; dir: boolean; children?: any[] }> {
  const rootNodes: any[] = []
  const index = new Map<string, any>()

  const ensureDir = (dirPath: string): any => {
    if (index.has(dirPath)) return index.get(dirPath)
    const node = { name: dirPath.split('/').pop(), path: dirPath, dir: true, children: [] as any[] }
    index.set(dirPath, node)
    const parentPath = dirPath.includes('/') ? dirPath.slice(0, dirPath.lastIndexOf('/')) : ''
    if (parentPath) ensureDir(parentPath).children.push(node)
    else rootNodes.push(node)
    return node
  }

  for (const file of state.files) {
    const dir = file.includes('/') ? file.slice(0, file.lastIndexOf('/')) : ''
    const node = { name: file.split('/').pop(), path: file, dir: false }
    if (dir) ensureDir(dir).children.push(node)
    else rootNodes.push(node)
  }

  return rootNodes
}

function renderTree(): void {
  const container = $('tree')
  container.innerHTML = ''

  const renderLevel = (nodes: any[], parent: HTMLElement) => {
    for (const node of nodes.sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name))) {
      const row = document.createElement('div')
      row.className = `row${node.dir ? ' dir' : ''}`
      row.dataset.path = node.path

      const twist = document.createElement('span')
      twist.className = 'twist'
      twist.textContent = node.dir ? (state.expanded.has(node.path) ? '▾' : '▸') : ''
      row.append(twist)

      const icon = document.createElement('span')
      icon.className = 'icon'
      icon.textContent = node.dir ? '▣' : '·'
      row.append(icon)

      const label = document.createElement('span')
      label.textContent = node.name
      row.append(label)

      row.onclick = () => {
        if (node.dir) {
          if (state.expanded.has(node.path)) state.expanded.delete(node.path)
          else state.expanded.add(node.path)
          renderTree()
        } else {
          void openFile(node.path)
        }
      }

      parent.append(row)

      if (node.dir && state.expanded.has(node.path)) {
        const children = document.createElement('div')
        children.className = 'children'
        parent.append(children)
        renderLevel(node.children, children)
      }
    }
  }

  renderLevel(buildTree(), container)
}

function highlightTree(): void {
  for (const row of document.querySelectorAll<HTMLElement>('#tree .row')) {
    row.classList.toggle('selected', row.dataset.path === state.active)
  }
}

/* ------------------------------------------------------------- sessions */

async function loadSessions(): Promise<void> {
  const data = await api<{ sessions: any[] }>('/api/state')
  const container = $('sessions')
  container.innerHTML = ''

  if (!data.sessions.length) {
    container.innerHTML = '<div class="row">No sessions yet</div>'
    return
  }

  for (const session of data.sessions) {
    const row = document.createElement('div')
    row.className = `row${session.id === state.sessionId ? ' selected' : ''}`

    const title = document.createElement('span')
    title.textContent = new Date(session.createdAt).toLocaleString()
    const meta = document.createElement('span')
    meta.className = 'meta'
    meta.textContent = `${session.mode} · ${session.messages} messages`

    row.append(title, meta)
    row.onclick = () => {
      state.sessionId = session.id
      state.mode = session.mode
      ;($('mode') as HTMLSelectElement).value = session.mode
      $('session-line').textContent = session.id
      $('messages').innerHTML = ''
      appendMessage('assistant', `Resumed session from ${new Date(session.createdAt).toLocaleString()}. Continue the conversation.`)
      loadSessions()
    }

    container.append(row)
  }
}

/* ----------------------------------------------------------------- chat */

function appendMessage(role: 'user' | 'assistant' | 'error', text: string): HTMLElement {
  const el = document.createElement('div')
  el.className = `msg ${role}`

  const who = document.createElement('span')
  who.className = 'who'
  who.textContent = role === 'user' ? 'you' : role === 'error' ? 'error' : 'assistant'
  el.append(who)

  const body = document.createElement('div')
  body.className = 'body'
  body.textContent = text
  el.append(body)

  $('messages').append(el)
  $('messages').scrollTop = $('messages').scrollHeight
  return el
}

function formatAssistant(el: HTMLElement): void {
  const body = el.querySelector('.body') as HTMLElement
  const raw = body.textContent ?? ''
  if (!raw.includes('```')) return

  const parts = raw.split(/```/)
  body.innerHTML = ''
  parts.forEach((part, index) => {
    if (index % 2 === 1) {
      const pre = document.createElement('pre')
      pre.textContent = part.replace(/^[a-z]+\n/i, '')
      body.append(pre)
    } else if (part) {
      body.append(document.createTextNode(part))
    }
  })
}

async function send(): Promise<void> {
  if (state.busy) return

  const input = $('prompt') as HTMLTextAreaElement
  const message = input.value.trim()
  if (!message) return

  input.value = ''
  state.busy = true
  $('send').setAttribute('disabled', 'true')
  $('composer-hint').textContent = 'working…'
  appendMessage('user', message)

  let assistant: HTMLElement | null = null
  let assistantBody: HTMLElement | null = null

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: state.sessionId, message, mode: state.mode }),
    })
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      let boundary = buffer.indexOf('\n\n')
      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))

          if (event.type === 'start') {
            state.sessionId = event.sessionId
            $('session-line').textContent = event.sessionId
          }

          if (event.type === 'token') {
            if (!assistant) {
              assistant = appendMessage('assistant', '')
              assistantBody = assistant.querySelector('.body') as HTMLElement
            }
            assistantBody!.textContent += event.text
            $('messages').scrollTop = $('messages').scrollHeight
          }

          if (event.type === 'tool') addToolCard(event)
          if (event.type === 'tool_end') updateToolCard(event)
          if (event.type === 'approval') addApproval(event)

          if (event.type === 'done') {
            if (assistant) formatAssistant(assistant)
            const tokens = (event.usage?.promptTokens ?? 0) + (event.usage?.completionTokens ?? 0)
            $('composer-hint').textContent = `${event.steps} steps · ${tokens} tokens · ${event.provider ?? ''}`
          }

          if (event.type === 'error') appendMessage('error', event.message)
        }

        boundary = buffer.indexOf('\n\n')
      }
    }
  } catch (err: any) {
    appendMessage('error', String(err?.message ?? err))
  } finally {
    state.busy = false
    $('send').removeAttribute('disabled')
    if ($('composer-hint').textContent === 'working…') $('composer-hint').textContent = ''
    if (assistant) formatAssistant(assistant)
    void loadSessions()
    void refreshOpenFiles()
  }
}

function addToolCard(event: any): void {
  // Calls that need approval get a single card, created by addApproval.
  if (event.preview?.needsApproval) return

  const card = document.createElement('div')
  card.className = 'tool-card'
  card.dataset.name = event.name

  const head = document.createElement('div')
  head.className = 'head'
  head.innerHTML = `<span class="name">${escapeHtml(event.name)}</span><span>${escapeHtml(
    event.preview?.path ?? event.preview?.command ?? event.preview?.detail ?? '',
  )}</span><span class="status">…</span>`
  card.append(head)

  if (event.preview?.kind === 'write' || event.preview?.kind === 'edit') {
    const diff = document.createElement('pre')
    diff.innerHTML = renderDiffHtml(event.preview.before ?? '', event.preview.after ?? '')
    card.append(diff)
  }

  $('messages').append(card)
  $('messages').scrollTop = $('messages').scrollHeight
}

function updateToolCard(event: any): void {
  const cards = document.querySelectorAll<HTMLElement>('.tool-card')
  const card = [...cards].reverse().find((item) => item.dataset.name === event.name && item.querySelector('.status')?.textContent === '…')
  if (card) {
    const status = card.querySelector('.status') as HTMLElement
    status.textContent = event.isError ? 'failed' : 'done'
    status.className = `status ${event.isError ? 'status-error' : 'status-ok'}`

    if (event.isError) {
      const pre = document.createElement('pre')
      pre.textContent = event.output
      card.append(pre)
    }
  }

  if (event.name === 'write_file' || event.name === 'edit_file') void refreshOpenFiles()
}

function addApproval(event: any): void {
  const card = document.createElement('div')
  card.className = 'tool-card'
  card.dataset.name = event.tool

  const head = document.createElement('div')
  head.className = 'head'
  const path = event.preview?.path ?? event.preview?.command ?? ''
  head.innerHTML = `<span class="name">${escapeHtml(event.tool)}</span><span>${escapeHtml(path)}</span><span class="status">…</span>`
  card.append(head)

  if (event.preview?.command) {
    const pre = document.createElement('pre')
    pre.textContent = `$ ${event.preview.command}`
    card.append(pre)
  }

  if (event.preview?.after !== undefined) {
    const pre = document.createElement('pre')
    pre.innerHTML = renderDiffHtml(event.preview.before ?? '', event.preview.after ?? '')
    card.append(pre)
  }

  const actions = document.createElement('div')
  actions.className = 'approval'

  const allow = document.createElement('button')
  allow.className = 'allow'
  allow.textContent = 'Allow'
  allow.onclick = () => {
    void api('/api/approve', { method: 'POST', body: JSON.stringify({ id: event.id, allow: true }) })
    actions.remove()
  }

  const deny = document.createElement('button')
  deny.textContent = 'Deny'
  deny.onclick = () => {
    void api('/api/approve', { method: 'POST', body: JSON.stringify({ id: event.id, allow: false }) })
    actions.remove()
    const status = card.querySelector('.status') as HTMLElement
    if (status) {
      status.textContent = 'denied'
      status.className = 'status status-error'
    }
  }

  actions.append(allow, deny)
  card.append(actions)
  $('messages').append(card)
  $('messages').scrollTop = $('messages').scrollHeight
}

async function refreshOpenFiles(): Promise<void> {
  for (const [path, tab] of state.tabs) {
    if (tab.dirty) continue
    try {
      const { content } = await api<{ content: string }>(`/api/file?path=${encodeURIComponent(path)}`)
      if (content !== tab.model.getValue()) {
        tab.model.setValue(content)
        tab.saved = content
        tab.dirty = false
      }
    } catch {
      // File may have been deleted.
    }
  }
  renderTabs()
}

/* ------------------------------------------------------------- terminal */

function initTerminal(): void {
  const term = new Terminal({
    fontSize: 12,
    fontFamily: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
    cursorBlink: true,
    theme: {
      background: '#1c2028',
      foreground: '#d8dee9',
      cursor: '#7c9cff',
      selectionBackground: '#2b3446',
    },
  })

  const fit = new FitAddon()
  term.loadAddon(fit)
  term.open($('terminal'))
  fit.fit()

  window.addEventListener('resize', () => fit.fit())

  const prompt = '\x1b[38;5;111m›\x1b[0m '
  let input = ''
  let running = false

  term.write('\x1b[2mType a command and press Enter. Ctrl+` hides this panel.\x1b[0m\r\n')
  term.write(prompt)

  async function run(command: string): Promise<void> {
    running = true
    const res = await fetch('/api/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command }),
    })

    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let boundary = buffer.indexOf('\n\n')

      while (boundary >= 0) {
        const chunk = buffer.slice(0, boundary)
        buffer = buffer.slice(boundary + 2)

        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue
          const event = JSON.parse(line.slice(6))
          if (event.type === 'stdout' || event.type === 'stderr') term.write(event.text.replace(/\n/g, '\r\n'))
        }
        boundary = buffer.indexOf('\n\n')
      }
    }

    running = false
    term.write(prompt)
  }

  term.onData((data) => {
    if (running) return

    if (data === '\r') {
      term.write('\r\n')
      const command = input.trim()
      input = ''
      if (command) void run(command)
      else term.write(prompt)
      return
    }

    if (data === '\x7f') {
      if (input.length) {
        input = input.slice(0, -1)
        term.write('\b \b')
      }
      return
    }

    if (data >= ' ' && data !== '\x7f') {
      input += data
      term.write(data)
    }
  })

  $('clear-terminal').onclick = () => {
    term.clear()
    term.write(prompt)
  }
}

/* -------------------------------------------------------------- wiring */

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!)
}

function renderDiffHtml(before: string, after: string): string {
  const oldLines = before.split('\n')
  const newLines = after.split('\n')

  let prefix = 0
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix++
  let suffix = 0
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++
  }

  const removed = oldLines.slice(prefix, oldLines.length - suffix).slice(0, 12)
  const added = newLines.slice(prefix, newLines.length - suffix).slice(0, 12)

  return [
    ...removed.map((line) => `<span class="diff-del">- ${escapeHtml(line)}</span>`),
    ...added.map((line) => `<span class="diff-add">+ ${escapeHtml(line)}</span>`),
  ].join('\n')
}

function initQuickOpen(): void {
  const modal = $('quick-open-modal')
  const input = $('quick-open-input') as HTMLInputElement
  const results = $('quick-open-results')
  let active = 0
  let matches: string[] = []

  const close = () => modal.classList.add('hidden')

  const render = () => {
    results.innerHTML = ''
    matches.slice(0, 40).forEach((path, index) => {
      const li = document.createElement('li')
      li.textContent = path
      li.className = index === active ? 'active' : ''
      li.onclick = () => {
        void openFile(path)
        close()
      }
      results.append(li)
    })
  }

  input.oninput = () => {
    const query = input.value.toLowerCase()
    matches = state.files
      .filter((file) => file.toLowerCase().includes(query))
      .sort((a, b) => score(b, query) - score(a, query))
    active = 0
    render()
  }

  input.onkeydown = (event) => {
    if (event.key === 'Escape') close()
    if (event.key === 'ArrowDown') {
      active = Math.min(active + 1, matches.length - 1)
      render()
    }
    if (event.key === 'ArrowUp') {
      active = Math.max(active - 1, 0)
      render()
    }
    if (event.key === 'Enter' && matches[active]) {
      void openFile(matches[active]!)
      close()
    }
  }

  $('quick-open').onclick = () => {
    modal.classList.remove('hidden')
    input.value = ''
    input.focus()
    matches = state.files.slice(0, 40)
    render()
  }
}

function score(path: string, query: string): number {
  const name = path.split('/').pop()!.toLowerCase()
  if (!query) return 0
  if (name === query) return 100
  if (name.startsWith(query)) return 80
  return 10
}

async function init(): Promise<void> {
  const status = await api<any>('/api/state')
  state.cwd = status.cwd
  state.model = status.model
  state.provider = status.provider

  $('workspace-name').textContent = status.name
  $('status-provider').textContent = status.provider ? `${status.provider} · ${status.model}` : 'no model'
  $('session-line').textContent = 'new session'

  await initEditor()
  initTerminal()
  initQuickOpen()

  await loadTree()
  await loadSessions()

  $('send').onclick = () => void send()

  const prompt = $('prompt') as HTMLTextAreaElement
  prompt.onkeydown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      void send()
    }
  }

  ;($('mode') as HTMLSelectElement).onchange = (event) => {
    state.mode = (event.target as HTMLSelectElement).value
  }

  $('new-session').onclick = () => {
    state.sessionId = null
    $('session-line').textContent = 'new session'
    $('messages').innerHTML = ''
    void loadSessions()
  }

  $('refresh-tree').onclick = () => void loadTree()

  document.querySelectorAll<HTMLElement>('.activity-btn[data-view]').forEach((button) => {
    button.onclick = () => {
      const view = button.dataset.view
      document.querySelectorAll('.activity-btn[data-view]').forEach((item) => item.classList.remove('active'))
      button.classList.add('active')

      $('tree').classList.toggle('hidden', view !== 'explorer')
      $('sessions').classList.toggle('hidden', view !== 'sessions')
      $('sidebar-title').textContent = view === 'explorer' ? 'Explorer' : 'Sessions'
      if (view === 'sessions') void loadSessions()
    }
  })

  $('toggle-ai').onclick = () => {
    $('ai').classList.toggle('hidden')
    const grid = $('body')
    grid.style.gridTemplateColumns = $('ai').classList.contains('hidden')
      ? '48px 250px minmax(0, 1fr)'
      : '48px 250px minmax(0, 1fr) 380px'
    editor?.layout()
  }

  window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.key.toLowerCase() === 'p') {
      event.preventDefault()
      $('quick-open').click()
    }
    if (event.ctrlKey && event.key === '`') {
      event.preventDefault()
      $('panel').classList.toggle('hidden')
      editor?.layout()
    }
    if (event.ctrlKey && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      prompt.focus()
    }
  })
}

void init()



