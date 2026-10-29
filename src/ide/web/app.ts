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

const settings = {
  fontSize: Number(localStorage.getItem('eschaton.fontSize') ?? 13),
  autoApprove: localStorage.getItem('eschaton.autoApprove') === '1',
  model: localStorage.getItem('eschaton.model') ?? '',
}

const state = {
  cwd: '',
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
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as any)?.error ?? `HTTP ${res.status}`)
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
    fontSize: settings.fontSize,
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
}

async function openFile(path: string, line?: number): Promise<void> {
  const existing = state.tabs.get(path)
  if (existing) {
    activate(path)
    if (line) reveal(line)
    return
  }

  const { content } = await api<{ content: string }>(`/api/file?path=${encodeURIComponent(path)}`)
  const uri = monaco.Uri.file(path)
  let model = monaco.editor.getModel(uri)
  if (!model) model = monaco.editor.createModel(content, languageOf(path), uri)

  state.tabs.set(path, { path, model, dirty: false, saved: content })
  activate(path)
  if (line) reveal(line)
}

function reveal(line: number): void {
  editor.revealLineInCenter(line)
  editor.setPosition({ lineNumber: line, column: 1 })
  editor.focus()
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
}

function closeTab(path: string): void {
  const tab = state.tabs.get(path)
  if (!tab) return
  if (tab.dirty && !confirm(`${path} has unsaved changes. Close it?`)) return

  state.tabs.delete(path)
  if (state.active === path) {
    state.active = null
    const next = [...state.tabs.keys()].pop()
    if (next) {
      activate(next)
    } else {
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

function buildTree(): any[] {
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

      row.oncontextmenu = (event) => {
        event.preventDefault()
        showContextMenu(event.clientX, event.clientY, node)
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

function showContextMenu(x: number, y: number, node: { path: string; dir: boolean }): void {
  const menu = $('context-menu')
  menu.innerHTML = ''
  menu.classList.remove('hidden')
  menu.style.left = `${x}px`
  menu.style.top = `${y}px`

  const items: Array<[string, () => void]> = [
    ['New file', () => void createEntry(node.dir ? node.path : dirOf(node.path), false)],
    ['New folder', () => void createEntry(node.dir ? node.path : dirOf(node.path), true)],
    ['Rename', () => void renameEntry(node.path)],
    ['Delete', () => void deleteEntry(node.path)],
  ]

  for (const [label, action] of items) {
    const item = document.createElement('div')
    item.className = 'context-item'
    item.textContent = label
    item.onclick = () => {
      menu.classList.add('hidden')
      action()
    }
    menu.append(item)
  }

  const close = () => {
    menu.classList.add('hidden')
    document.removeEventListener('click', close)
  }
  setTimeout(() => document.addEventListener('click', close), 0)
}

function dirOf(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

function join(dir: string, name: string): string {
  return dir ? `${dir}/${name}` : name
}

async function createEntry(dir: string, isDir: boolean): Promise<void> {
  const name = await askText(isDir ? 'New folder name' : 'New file name', '')
  if (!name) return

  const target = join(dir, name)
  try {
    await api('/api/file', { method: 'POST', body: JSON.stringify({ path: target, dir: isDir }) })
    if (dir) state.expanded.add(dir)
    await loadTree()
    if (!isDir) await openFile(target)
  } catch (err: any) {
    alert(String(err.message ?? err))
  }
}

async function renameEntry(path: string): Promise<void> {
  const name = await askText('Rename', path.split('/').pop() ?? path)
  if (!name) return

  const target = join(dirOf(path), name)
  if (target === path) return

  try {
    await api('/api/rename', { method: 'POST', body: JSON.stringify({ from: path, to: target }) })
    if (state.tabs.has(path)) closeTab(path)
    await loadTree()
  } catch (err: any) {
    alert(String(err.message ?? err))
  }
}

async function deleteEntry(path: string): Promise<void> {
  if (!confirm(`Delete ${path}?`)) return

  try {
    await api(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
    if (state.tabs.has(path)) {
      state.tabs.delete(path)
      if (state.active === path) {
        editor.setModel(null)
        $('editor').style.visibility = 'hidden'
        $('welcome').classList.remove('hidden')
      }
      renderTabs()
    }
    await loadTree()
  } catch (err: any) {
    alert(String(err.message ?? err))
  }
}

/* --------------------------------------------------------------- search */

let searchTimer: number | undefined

function initSearch(): void {
  const input = $('search-input') as HTMLInputElement

  input.oninput = () => {
    window.clearTimeout(searchTimer)
    searchTimer = window.setTimeout(() => void runSearch(input.value.trim()), 250)
  }

  input.onkeydown = (event) => {
    if (event.key === 'Enter') void runSearch(input.value.trim())
  }
}

async function runSearch(query: string): Promise<void> {
  const container = $('search-results')
  container.innerHTML = ''

  if (!query) return

  const { results } = await api<{ results: Array<{ path: string; line: number; text: string }> }>(
    `/api/search?q=${encodeURIComponent(query)}`,
  )

  const header = document.createElement('div')
  header.className = 'results-head'
  header.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`
  container.append(header)

  for (const result of results) {
    const row = document.createElement('div')
    row.className = 'result'
    row.innerHTML = `<span class="result-path">${escapeHtml(result.path)}:${result.line}</span><span class="result-text">${escapeHtml(
      result.text,
    )}</span>`
    row.onclick = () => void openFile(result.path, result.line)
    container.append(row)
  }
}

/* ------------------------------------------------------------------ git */

let gitFiles: Array<{ path: string; status: string; staged: boolean }> = []

function initGit(): void {
  $('git-refresh').onclick = () => void refreshGit()
  $('git-sync').onclick = () => void syncGit()
  $('commit-button').onclick = () => void commitGit()
}

async function refreshGit(): Promise<void> {
  try {
    const status = await api<any>('/api/git/status')
    if (!status.isRepo) {
      $('git-branch').textContent = 'not a git repository'
      $('git-files').innerHTML = ''
      $('status-git').textContent = ''
      return
    }

    gitFiles = status.files
    $('git-branch').textContent = `${status.branch}${status.ahead ? ` ↑${status.ahead}` : ''}${status.behind ? ` ↓${status.behind}` : ''}`
    $('status-git').textContent = `⑂ ${status.branch}`
    renderGitFiles()
  } catch {
    // Git is optional.
  }
}

function renderGitFiles(): void {
  const container = $('git-files')
  container.innerHTML = ''

  if (!gitFiles.length) {
    container.innerHTML = '<div class="results-head">No changes</div>'
    return
  }

  for (const file of gitFiles) {
    const row = document.createElement('div')
    row.className = 'result git-file'

    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = file.staged
    check.title = 'Stage'
    check.onclick = async (event) => {
      event.stopPropagation()
      await api('/api/git/stage', {
        method: 'POST',
        body: JSON.stringify({ path: file.path, staged: check.checked }),
      })
      void refreshGit()
    }

    const name = document.createElement('span')
    name.className = 'git-name'
    name.textContent = file.path

    const badge = document.createElement('span')
    badge.className = `git-status status-${file.status.replace(/\s/g, '')}`
    badge.textContent = file.status

    row.append(check, badge, name)
    row.onclick = () => void showDiff(file.path, file.staged)
    container.append(row)
  }
}

async function showDiff(path: string, staged: boolean): Promise<void> {
  const { diff } = await api<{ diff: string }>(
    `/api/git/diff?path=${encodeURIComponent(path)}&staged=${staged ? '1' : '0'}`,
  )

  $('diff-title').textContent = `${path}${staged ? ' (staged)' : ''}`
  $('diff-body').innerHTML = diff
    ? diff
        .split('\n')
        .map((line) => {
          const cls = line.startsWith('+') ? 'diff-add' : line.startsWith('-') ? 'diff-del' : line.startsWith('@@') ? 'diff-hunk' : ''
          return `<span class="${cls}">${escapeHtml(line)}</span>`
        })
        .join('\n')
    : 'No changes.'

  $('diff-modal').classList.remove('hidden')
}

async function commitGit(): Promise<void> {
  const message = ($('commit-message') as HTMLTextAreaElement).value.trim()
  if (!message) return alert('Write a commit message first.')

  const result = await api<any>('/api/git/commit', { method: 'POST', body: JSON.stringify({ message }) })
  if (!result.ok) alert(result.output || 'Commit failed')

  ;($('commit-message') as HTMLTextAreaElement).value = ''
  await refreshGit()
}

async function syncGit(): Promise<void> {
  const button = $('git-sync') as HTMLButtonElement
  button.disabled = true
  try {
    const result = await api<any>('/api/git/sync', { method: 'POST' })
    $('diff-title').textContent = 'Sync'
    $('diff-body').textContent = result.output || 'Up to date.'
    $('diff-modal').classList.remove('hidden')
    await refreshGit()
  } catch (err: any) {
    alert(String(err.message ?? err))
  } finally {
    button.disabled = false
  }
}

/* ------------------------------------------------------------- sessions */

async function loadSessions(): Promise<void> {
  const data = await api<{ sessions: any[] }>('/api/state')
  const container = $('sessions')
  container.innerHTML = ''

  if (!data.sessions.length) {
    container.innerHTML = '<div class="results-head">No sessions yet</div>'
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
      $('status-session').textContent = session.id.slice(0, 8)
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
      body: JSON.stringify({ sessionId: state.sessionId, message, mode: state.mode, autoApprove: settings.autoApprove }),
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
            $('status-session').textContent = String(event.sessionId).slice(0, 8)
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
    void loadTree()
    void refreshGit()
  }
}

function addToolCard(event: any): void {
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
  const card = [...cards]
    .reverse()
    .find((item) => item.dataset.name === event.name && item.querySelector('.status')?.textContent === '…')

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

  const path = event.preview?.path ?? event.preview?.command ?? ''
  const head = document.createElement('div')
  head.className = 'head'
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

  if (event.preview?.after !== undefined && event.preview?.path) {
    const revert = document.createElement('button')
    revert.className = 'ghost tiny'
    revert.textContent = 'Revert after run'
    revert.dataset.before = event.preview.before ?? ''
    revert.dataset.path = event.preview.path
    revert.onclick = () => void revertEdit(event.preview.path, event.preview.before)
    card.append(revert)
  }

  $('messages').append(card)
  $('messages').scrollTop = $('messages').scrollHeight
}

async function revertEdit(path: string, before: string | undefined): Promise<void> {
  if (before === undefined) {
    await api(`/api/file?path=${encodeURIComponent(path)}`, { method: 'DELETE' })
  } else {
    await api('/api/file', { method: 'PUT', body: JSON.stringify({ path, content: before }) })
  }
  await refreshOpenFiles()
  await loadTree()
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

    if (data >= ' ') {
      input += data
      term.write(data)
    }
  })

  $('clear-terminal').onclick = () => {
    term.clear()
    term.write(prompt)
  }
}

/* -------------------------------------------------------------- dialogs */

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

function askText(title: string, value: string): Promise<string | null> {
  return new Promise((resolve) => {
    const modal = document.createElement('div')
    modal.className = 'modal'
    modal.innerHTML = `
      <div class="dialog">
        <h2>${escapeHtml(title)}</h2>
        <input class="dialog-input" type="text" />
        <div class="dialog-actions">
          <button class="ghost cancel">Cancel</button>
          <button class="primary ok">OK</button>
        </div>
      </div>`

    document.body.append(modal)
    const input = modal.querySelector('.dialog-input') as HTMLInputElement
    input.value = value
    input.focus()
    input.select()

    const finish = (result: string | null) => {
      modal.remove()
      resolve(result)
    }

    modal.querySelector('.cancel')!.addEventListener('click', () => finish(null))
    modal.querySelector('.ok')!.addEventListener('click', () => finish(input.value.trim() || null))
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') finish(input.value.trim() || null)
      if (event.key === 'Escape') finish(null)
    })
  })
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

function initSettings(): void {
  const modal = $('settings-modal')

  $('open-settings').onclick = () => {
    ;($('setting-font-size') as HTMLInputElement).value = String(settings.fontSize)
    ;($('setting-approve') as HTMLInputElement).checked = !settings.autoApprove
    ;($('setting-model') as HTMLInputElement).value = settings.model || ''
    modal.classList.remove('hidden')
  }

  $('settings-close').onclick = () => modal.classList.add('hidden')

  $('settings-save').onclick = async () => {
    settings.fontSize = Number(($('setting-font-size') as HTMLInputElement).value) || 13
    settings.autoApprove = !($('setting-approve') as HTMLInputElement).checked
    settings.model = ($('setting-model') as HTMLInputElement).value.trim()

    localStorage.setItem('eschaton.fontSize', String(settings.fontSize))
    localStorage.setItem('eschaton.autoApprove', settings.autoApprove ? '1' : '0')
    localStorage.setItem('eschaton.model', settings.model)

    editor.updateOptions({ fontSize: settings.fontSize })
    if (settings.model) {
      await api('/api/model', { method: 'POST', body: JSON.stringify({ model: settings.model }) })
      $('status-provider').textContent = `${state.provider ?? 'model'} · ${settings.model}`
    }

    modal.classList.add('hidden')
  }

  $('diff-close').onclick = () => $('diff-modal').classList.add('hidden')
}

/* -------------------------------------------------------------- wiring */

function switchView(view: string): void {
  document.querySelectorAll('.activity-btn[data-view]').forEach((item) => item.classList.remove('active'))
  document.querySelector(`.activity-btn[data-view="${view}"]`)?.classList.add('active')

  for (const panel of ['tree', 'search-panel', 'git-panel', 'sessions']) {
    $(panel).classList.toggle('hidden', panel !== view && !(view === 'explorer' && panel === 'tree'))
  }

  const titles: Record<string, string> = {
    explorer: 'Explorer',
    search: 'Search',
    git: 'Source control',
    sessions: 'Sessions',
  }
  $('sidebar-title').textContent = titles[view] ?? view

  const actions = $('sidebar-actions')
  actions.innerHTML = ''

  if (view === 'explorer') {
    const newFile = document.createElement('button')
    newFile.className = 'ghost tiny'
    newFile.textContent = '＋'
    newFile.title = 'New file'
    newFile.onclick = () => void createEntry('', false)

    const newFolder = document.createElement('button')
    newFolder.className = 'ghost tiny'
    newFolder.textContent = '▣'
    newFolder.title = 'New folder'
    newFolder.onclick = () => void createEntry('', true)

    const refresh = document.createElement('button')
    refresh.className = 'ghost tiny'
    refresh.textContent = '⟳'
    refresh.title = 'Refresh'
    refresh.onclick = () => void loadTree()

    actions.append(newFile, newFolder, refresh)
  }

  if (view === 'search') ($('search-input') as HTMLInputElement).focus()
  if (view === 'git') void refreshGit()
  if (view === 'sessions') void loadSessions()
}

async function init(): Promise<void> {
  const status = await api<any>('/api/state')
  state.cwd = status.cwd
  state.provider = status.provider

  $('workspace-name').textContent = status.name
  $('status-provider').textContent = status.provider ? `${status.provider} · ${status.model}` : 'no model'
  $('session-line').textContent = 'new session'

  await initEditor()
  initTerminal()
  initQuickOpen()
  initSearch()
  initGit()
  initSettings()

  await loadTree()
  await loadSessions()
  await refreshGit()

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
    $('status-session').textContent = ''
    $('messages').innerHTML = ''
    void loadSessions()
  }

  document.querySelectorAll<HTMLElement>('.activity-btn[data-view]').forEach((button) => {
    button.onclick = () => switchView(button.dataset.view!)
  })

  $('toggle-ai').onclick = () => {
    $('ai').classList.toggle('hidden')
    const hidden = $('ai').classList.contains('hidden')
    $('body').style.gridTemplateColumns = hidden
      ? '48px 250px minmax(0, 1fr)'
      : '48px 250px minmax(0, 1fr) 380px'
    editor?.layout()
  }

  window.addEventListener('keydown', (event) => {
    const ctrl = event.ctrlKey || event.metaKey

    if (ctrl && event.key.toLowerCase() === 'p') {
      event.preventDefault()
      $('quick-open').click()
    }
    if (ctrl && event.shiftKey && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      switchView('search')
      ;($('search-input') as HTMLInputElement).focus()
    }
    if (ctrl && event.shiftKey && event.key.toLowerCase() === 'g') {
      event.preventDefault()
      switchView('git')
    }
    if (ctrl && event.key === '`') {
      event.preventDefault()
      $('panel').classList.toggle('hidden')
      editor?.layout()
    }
    if (ctrl && event.key.toLowerCase() === 'i') {
      event.preventDefault()
      prompt.focus()
    }
    if (event.key === 'Escape') {
      for (const modal of ['quick-open-modal', 'settings-modal', 'diff-modal']) $(modal).classList.add('hidden')
    }
  })
}

void init()
