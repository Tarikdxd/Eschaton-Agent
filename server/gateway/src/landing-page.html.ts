export function renderLandingPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>⚡ Eschaton Code • Autonomous AI Coding Agent</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fira+Code:wght@400;600;700&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg: #090a0f;
      --card-bg: rgba(18, 20, 32, 0.7);
      --border: #23273e;
      --primary: #7928ca;
      --accent: #00dfd8;
      --text: #f1f5f9;
      --muted: #94a3b8;
      --code-bg: #0d1117;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg);
      color: var(--text);
      font-family: 'Inter', -apple-system, sans-serif;
      min-height: 100vh;
      overflow-x: hidden;
      line-height: 1.6;
    }
    .container {
      max-width: 1100px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    header {
      text-align: center;
      padding: 60px 0 40px;
    }
    .ascii-logo {
      font-family: 'Fira Code', monospace;
      font-size: 11px;
      line-height: 1.2;
      color: var(--accent);
      white-space: pre;
      display: inline-block;
      text-shadow: 0 0 20px rgba(0, 223, 216, 0.4);
      margin-bottom: 25px;
    }
    h1 {
      font-size: 2.8rem;
      font-weight: 800;
      background: linear-gradient(135deg, #fff 0%, var(--accent) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 12px;
    }
    .tagline {
      font-size: 1.2rem;
      color: var(--muted);
      max-width: 650px;
      margin: 0 auto 30px;
    }
    .badges {
      display: flex;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
      margin-bottom: 40px;
    }
    .badge {
      background: rgba(255,255,255,0.05);
      border: 1px solid var(--border);
      padding: 6px 14px;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .badge.green { border-color: #10b981; color: #10b981; }
    .badge.purple { border-color: var(--primary); color: #d8b4fe; }
    .badge.cyan { border-color: var(--accent); color: var(--accent); }

    .terminal-card {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 20px 40px rgba(0,0,0,0.6);
      margin-bottom: 50px;
    }
    .terminal-header {
      background: #161b22;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 8px;
      border-bottom: 1px solid var(--border);
    }
    .dot { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
    .dot.red { background: #ff5f56; }
    .dot.yellow { background: #ffbd2e; }
    .dot.green { background: #27c93f; }
    .terminal-title {
      font-family: 'Fira Code', monospace;
      font-size: 0.85rem;
      color: var(--muted);
      margin-left: 10px;
    }
    .terminal-body {
      padding: 24px;
      font-family: 'Fira Code', monospace;
      font-size: 0.95rem;
      line-height: 1.7;
    }
    .cmd {
      color: #38bdf8;
      display: flex;
      align-items: center;
      justify-content: space-between;
      background: rgba(56, 189, 248, 0.08);
      padding: 12px 16px;
      border-radius: 6px;
      border: 1px solid rgba(56, 189, 248, 0.2);
      margin-bottom: 15px;
    }
    .copy-btn {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      color: #fff;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
      transition: all 0.2s;
    }
    .copy-btn:hover { background: var(--accent); color: #000; }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 24px;
      margin-bottom: 60px;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 28px;
      backdrop-filter: blur(10px);
      transition: transform 0.2s, border-color 0.2s;
    }
    .card:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
    }
    .card h3 {
      font-size: 1.3rem;
      margin-bottom: 12px;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .card p { color: var(--muted); font-size: 0.95rem; }

    footer {
      text-align: center;
      padding: 40px 0;
      border-top: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.9rem;
    }
    a { color: var(--accent); text-decoration: none; }
    a:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div class="ascii-logo">
███████ ███████  ██████ ██   ██  █████  ████████  ██████  ███    ██
██      ██      ██      ██   ██ ██   ██    ██    ██    ██ ████   ██
█████   ███████ ██      ███████ ███████    ██    ██    ██ ██ ██  ██
██           ██ ██      ██   ██ ██   ██    ██    ██    ██ ██  ██ ██
███████ ███████  ██████ ██   ██ ██   ██    ██     ██████  ██   ████
      </div>
      <h1>Eschaton Code</h1>
      <p class="tagline">The Next-Generation Sovereign Terminal AI Assistant with Native Antigravity Synchronization and Claude Code Engine.</p>
      
      <div class="badges">
        <div class="badge green">● Gateway Online</div>
        <div class="badge purple">⚛ Antigravity Synchronized</div>
        <div class="badge cyan">⚡ Free DeepSeek V4.1 Flash Ready</div>
      </div>
    </header>

    <div class="terminal-card">
      <div class="terminal-header">
        <span class="dot red"></span>
        <span class="dot yellow"></span>
        <span class="dot green"></span>
        <span class="terminal-title">bash — 80x24</span>
      </div>
      <div class="terminal-body">
        <p style="color: #64748b; margin-bottom: 8px;"># 1. Install globally via npm:</p>
        <div class="cmd">
          <span>npm install -g https://github.com/Tarikdxd/Eschaton-Code/releases/download/v1.2.0/tarikdxd-eschaton-code-1.2.0.tgz</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('npm install -g https://github.com/Tarikdxd/Eschaton-Code/releases/download/v1.2.0/tarikdxd-eschaton-code-1.2.0.tgz')">Copy</button>
        </div>

        <p style="color: #64748b; margin-bottom: 8px;"># 2. Launch the interactive TUI:</p>
        <div class="cmd">
          <span>eschaton</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('eschaton')">Copy</button>
        </div>

        <p style="color: #64748b; margin-bottom: 8px;"># 3. Check connected Antigravity session:</p>
        <div class="cmd">
          <span>eschaton auth</span>
          <button class="copy-btn" onclick="navigator.clipboard.writeText('eschaton auth')">Copy</button>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h3>🖥️ OpenCode High-Fidelity TUI</h3>
        <p>Zero-flicker alternate screen buffer with live multi-line editing, real-time line-by-line diff previews (+ green / - red), interactive model switching, and collapsible agent reasoning.</p>
      </div>

      <div class="card">
        <h3>⚡ DeepSeek V4.1 & Model Catalog</h3>
        <p>Built-in access to DeepSeek V4.1 Flash, GLM 5.3 Flash, MiMo 2.6 Pro, and Claude 3.7. No subscriptions, credits, or third-party ad banners.</p>
      </div>

      <div class="card">
        <h3>⚛️ Native Antigravity Ecosystem</h3>
        <p>Auto-detects your local Antigravity installation, binding brain directories, memories, custom skills, and subagent collaboration straight into your coding sessions.</p>
      </div>

      <div class="card">
        <h3>🧠 Claude Code ReAct Engine</h3>
        <p>Production-grade autonomous tools: shell command runner, file reader, string replacement diff engine, multi-file batch editor, glob search, and ripgrep indexer.</p>
      </div>
    </div>

    <footer>
      <p>Eschaton Ecosystem • Maintained by <a href="https://github.com/Tarikdxd" target="_blank">@Tarikdxd</a> • <a href="https://github.com/Tarikdxd/Eschaton-Code" target="_blank">GitHub Repository</a></p>
    </footer>
  </div>
</body>
</html>`
}
