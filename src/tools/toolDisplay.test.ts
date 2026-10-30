// Friendly tool-name + arg display. Locks in the behavior the transcript
// and permission prompt depend on.

import { describe, expect, it } from 'vitest';
import { displayToolName, formatToolResult, primaryToolArg } from './toolDisplay.js';

describe('displayToolName', () => {
  it('maps the browser navigate tool to "Tarayıcı"', () => {
    expect(displayToolName('mcp_browser_browser_navigate')).toBe('Tarayıcı');
  });
  it('maps browser MCP actions to readable labels', () => {
    expect(displayToolName('mcp_browser_browser_click')).toBe('Tarayıcı Tıkla');
    expect(displayToolName('mcp_browser_browser_type_text')).toBe('Tarayıcı Metin yaz');
  });
  it('maps load_skill to "Beceri"', () => {
    expect(displayToolName('load_skill')).toBe('Beceri');
  });
  it('maps confirm_finding to "Doğrulanmış Bulgu"', () => {
    expect(displayToolName('confirm_finding')).toBe('Doğrulanmış Bulgu');
  });
  it('maps ask_user to "Kullanıcıya Sor"', () => {
    expect(displayToolName('ask_user')).toBe('Kullanıcıya Sor');
  });
  it('maps web tools to title-case labels', () => {
    expect(displayToolName('web_fetch')).toBe('Web Getir');
    expect(displayToolName('web_search')).toBe('Web Ara');
  });
  it('maps BashTool aliases to shell', () => {
    expect(displayToolName('BashTool')).toBe('shell');
    expect(displayToolName('bash')).toBe('shell');
  });
  it('passes unknown tools through unchanged', () => {
    expect(displayToolName('shell')).toBe('shell');
    expect(displayToolName('not_real')).toBe('not_real');
  });
});

describe('primaryToolArg', () => {
  it('extracts the browser url', () => {
    expect(primaryToolArg('mcp_browser_browser_navigate', { url: 'https://x.test' })).toBe(
      'https://x.test',
    );
  });
  it('extracts the shell/bash command', () => {
    expect(primaryToolArg('shell', { command: 'id' })).toBe('id');
    expect(primaryToolArg('bash', { command: 'ls -la' })).toBe('ls -la');
    expect(primaryToolArg('BashTool', { command: 'whoami' })).toBe('whoami');
  });
  it('formats http requests as METHOD URL', () => {
    expect(primaryToolArg('http', { method: 'GET', url: 'https://gobus.net' })).toBe(
      'GET https://gobus.net',
    );
    expect(primaryToolArg('http', { method: 'post', url: '/api/login' })).toBe('POST /api/login');
    expect(primaryToolArg('http', { url: 'https://gobus.net' })).toBe('https://gobus.net');
  });
  it('formats confirm_finding as (severity) title, or title alone', () => {
    expect(primaryToolArg('confirm_finding', { severity: 'high', title: 'XSS' })).toBe(
      '(high) XSS',
    );
    expect(primaryToolArg('confirm_finding', { title: 'XSS' })).toBe('XSS');
  });
  it('extracts the skill name for load_skill', () => {
    expect(primaryToolArg('load_skill', { name: 'webvuln' })).toBe('webvuln');
    expect(primaryToolArg('load_skill', { name: 'recon', fork: true })).toBe('recon · forked');
  });
  it('summarizes ask_user questions without dumping options JSON', () => {
    expect(
      primaryToolArg('ask_user', {
        questions: [
          {
            header: 'Scope',
            question:
              'Confirming scope — I want to make sure I test the right surface. Which of these matches the engagement?',
            options: [{ label: 'Passive recon' }, { label: 'Full recon' }],
          },
          {
            question: 'How deep should the testing go?',
            options: [{ label: 'Passive only' }, { label: 'Active web vuln hunt' }],
          },
        ],
      }),
    ).toBe(
      'Scope · 2 soru · Confirming scope — I want to make sure I test the right surface. Which of these matches the engagement?',
    );
  });
  it('returns null for unknown tools or missing/empty fields', () => {
    expect(primaryToolArg('http', {})).toBeNull();
    expect(primaryToolArg('shell', {})).toBeNull();
    expect(primaryToolArg('mcp_browser_browser_navigate', { url: '' })).toBeNull();
    expect(primaryToolArg('confirm_finding', {})).toBeNull();
  });
});

describe('formatToolResult', () => {
  it('renders browser_capture_status as a compact one-liner', () => {
    const json = JSON.stringify({
      requests: 0,
      endpoints: 0,
      snapshots: 0,
      lastActivityAt: 'never',
    });
    expect(formatToolResult('browser_capture_status', json)).toBe(
      'istek: 0 · uç nokta: 0 · anlık görüntü: 0 · son etkinlik: hiç',
    );
  });
  it('renders load_skill as a compact skill summary', () => {
    const skillBody = [
      '# Skill: webvuln',
      '',
      '# Web vuln hunting playbook',
      '',
      'Full model-facing body.',
      '',
      '## 1. Triage the target',
      '## 2. Known-CVE pass',
    ].join('\n');
    expect(formatToolResult('load_skill', skillBody)).toBe(
      ['beceri yüklendi: webvuln', 'oyun kitabı: Web vuln hunting playbook'].join('\n'),
    );
  });
  it('renders skill-fork summaries as a short done line', () => {
    const body = [
      '[skill-fork/recon: 4 tool call(s) — load_skill×1, todo×1, scope×1, BashTool×1]',
      '',
      'Found 12 subdomains…',
    ].join('\n');
    expect(formatToolResult('load_skill', body)).toBe('recon çatallandı · 4 araç');
  });
  it('renders ask_user answers as a readable summary', () => {
    const result = JSON.stringify({
      answers: [
        {
          question:
            'Confirming scope — I want to make sure I test the right surface. Which of these matches the engagement?',
          answer: 'Full recon: dsquares.com + all mazaya* apexes + pivots',
        },
        {
          question: 'How deep should the testing go?',
          answer: 'Active web vuln hunt',
        },
      ],
    });
    expect(formatToolResult('ask_user', result)).toBe(
      [
        'yanıtlar:',
        '- Full recon: dsquares.com + all mazaya* apexes + pivots',
        '  Confirming scope — I want to make sure I test the right surface. Which of these matches the engagement?',
        '- Active web vuln hunt',
        '  How deep should the testing go?',
      ].join('\n'),
    );
  });
  it('falls back (null) for other tools or malformed JSON', () => {
    expect(formatToolResult('shell', '{}')).toBeNull();
    expect(formatToolResult('browser_capture_status', 'not json')).toBeNull();
    expect(formatToolResult('load_skill', '# Missing skill heading')).toBeNull();
    expect(formatToolResult('ask_user', 'not json')).toBeNull();
  });
});
