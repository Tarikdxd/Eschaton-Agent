// /exit, /quit, /yolo, /clear, /reset, /help — session lifecycle and the
// sectioned reference card.

import { Chalk } from 'chalk';
import type { Agent } from '../../agent/agent.js';
import type { Backend } from '../../config/config.js';
import { chalkLevel } from '../colorLevel.js';
import { SLASH_ITEMS } from '../slashItems.js';
import { type SlashContext, confirmDestructive } from './context.js';

export function handleExit(ctx: SlashContext): void {
  ctx.exit();
}

export function handleYolo(ctx: SlashContext): void {
  // `/yolo` toggles; `/yolo on|off` sets explicitly. Flips the gate and the
  // pill together via applyYolo. Prefer `/mode yolo|ask|auto-safe` for tiers.
  const arg = ctx.rest[0]?.toLowerCase();
  const next = arg === 'on' ? true : arg === 'off' ? false : !ctx.yolo;
  ctx.applyYolo(next);
  ctx.dispatch({
    type: 'append',
    entry: {
      kind: 'system',
      text: next
        ? 'YOLO açık — her araç çağrısı otomatik onaylanacak. Yalnızca yetkili / laboratuvar hedefleri. (Salt okunur otomatik onay için /mode auto-safe kullanın.)'
        : 'YOLO kapalı — araç çağrıları yeniden soracak. (/mode ask|auto-safe|yolo)',
    },
  });
}

/** `/mode ask|auto-safe|yolo` — permission tiers. `/mode plan|act` — plan mode. */
export function handleMode(ctx: SlashContext): void {
  const arg = (ctx.rest[0] ?? '').toLowerCase();
  if (!arg || arg === 'show' || arg === 'status') {
    const plan = ctx.agent.isPlanMode() ? 'plan' : 'act';
    const perm = ctx.yolo ? 'yolo' : 'ask'; // full tier lives on prompter; UI tracks yolo
    ctx.dispatch({
      type: 'append',
      entry: {
        kind: 'system',
        text: `mod: çalışma=${plan} · izinler=${perm} (/mode ask|auto-safe|yolo|plan|act ile ayarlanır)`,
      },
    });
    return;
  }
  if (arg === 'plan') {
    ctx.agent.setPlanMode(true);
    ctx.dispatch({
      type: 'append',
      entry: {
        kind: 'system',
        text: 'Plan modu AÇIK — değiştirici araçlar engellendi. Yalnızca keşif/okuma araçları. Çıkmak için /mode act.',
      },
    });
    return;
  }
  if (arg === 'act' || arg === 'work') {
    ctx.agent.setPlanMode(false);
    ctx.dispatch({
      type: 'append',
      entry: {
        kind: 'system',
        text: 'Plan modu KAPALI — tüm araçlar yeniden kullanılabilir (izinlere tabi).',
      },
    });
    return;
  }
  if (
    arg === 'yolo' ||
    arg === 'ask' ||
    arg === 'auto-safe' ||
    arg === 'autosafe' ||
    arg === 'safe'
  ) {
    const mode = arg === 'yolo' ? 'yolo' : arg === 'ask' ? 'ask' : 'auto-safe';
    ctx.applyPermissionMode?.(mode);
    ctx.dispatch({
      type: 'append',
      entry: {
        kind: 'system',
        text:
          mode === 'yolo'
            ? 'İzinler: YOLO — tüm araçları otomatik onayla (yalnızca laboratuvar).'
            : mode === 'auto-safe'
              ? 'İzinler: auto-safe — okuma/gözlem araçları otomatik onaylanır; shell/yazma yine sorar.'
              : 'İzinler: ask — her hassas araçta sor.',
      },
    });
    return;
  }
  ctx.dispatch({
    type: 'append',
    entry: {
      kind: 'error',
      text: 'kullanım: /mode ask|auto-safe|yolo|plan|act  (veya /mode show)',
    },
  });
}

export function handleClear(ctx: SlashContext): void {
  ctx.clearScreen();
  ctx.dispatch({ type: 'clear' });
}

export function handleReset(ctx: SlashContext): void {
  // Check isRunning() up front rather than racing agent.reset()'s own guard —
  // clearScreen()/dispatch('clear') below are irreversible on-screen actions
  // that must not fire before we know the reset itself will actually happen.
  if (ctx.agent.isRunning()) {
    ctx.dispatch({
      type: 'append',
      entry: { kind: 'error', text: 'reset: zaten çalışan bir tur var — önce Esc ile iptal edin' },
    });
    return;
  }
  confirmDestructive(
    ctx,
    'Bu konuşma sıfırlansın mı?',
    'Konuşma geçmişi ve kayıtlı oturum temizlenecek.',
    () => {
      void ctx.agent.reset();
      ctx.clearScreen();
      ctx.dispatch({ type: 'clear' });
      ctx.dispatch({ type: 'append', entry: { kind: 'system', text: 'konuşma sıfırlandı' } });
    },
  );
}

export function handleHelp(ctx: SlashContext): void {
  ctx.dispatch({
    type: 'append',
    entry: { kind: 'system', text: buildHelpText(ctx.agent, ctx.readConfig) },
  });
}

// ---------- /help — sectioned reference card ----------

// Standalone chalk instance pinned to truecolor so the help panel renders
// consistently regardless of the parent component's color inference. The
// transcript's role-color wrapper doesn't strip embedded ANSI, so accents
// survive into render.
const helpChalk = new Chalk({ level: chalkLevel() });

const KEYBINDINGS: Array<{ keys: string; desc: string }> = [
  { keys: '@<file>', desc: 'bir dosyayı sonraki tura satır içi ekle (Tab seçici açar)' },
  {
    keys: '#<text>',
    desc: 'kalıcı bir bilgi kaydet (#!<text> = kişisel); otomatik geri çağrılır',
  },
  { keys: '/', desc: 'eğik çizgi komut menüsünü aç' },
  { keys: '↑ / ↓', desc: 'oturum istem geçmişinde gezin (girdinin ilk / son satırındayken)' },
  { keys: 'Ctrl-N / Ctrl-J', desc: 'girdi içine yeni satır ekle' },
  { keys: 'Ctrl-A / Ctrl-E', desc: 'geçerli satırın başına / sonuna git' },
  {
    keys: 'Home / End',
    desc: 'yazarken satır başı/sonu; girdi boşken sohbetin en eski/en yeni noktası',
  },
  { keys: 'PgUp / PgDn', desc: 'sohbet geçmişinde sayfa çevir (OpenTUI uygulama görünümü)' },
  {
    keys: 'mouse wheel',
    desc: 'sohbeti kaydır (OpenTUI; Ink terminal kaydırmasını kullanır)',
  },
  { keys: 'Ctrl-O', desc: 'son kısaltılmış araç çıktısını tam olarak yeniden yazdır' },
  { keys: 'Ctrl-Y', desc: 'son araç çıktısını / bulguyu panoya kopyala' },
  { keys: 'Ctrl-F', desc: 'döküm filtresini döngüle (tümü→kompakt→bulgular→hatalar→geçerli)' },
  { keys: 'Esc', desc: 'sürmekte olan turu iptal et / girdi taslağını temizle' },
  { keys: 'Ctrl-C', desc: 'eschaton uygulamasından çık' },
];

const TIPS: string[] = [
  'browser_capture_* araçları, Burp/tarayıcı trafiği bir --burp köprüsüne yönlendirildiğinde canlı istek / çerez / depolama verilerini gösterir.',
  'coverage(action="untested", candidates=[...], vuln_classes=[...]) henüz test ETMEDİĞİNİZ (uç nokta, parametre, sınıf) demetlerini döndürür — sonraki turu buna göre yönlendirin.',
  'read_payloads(skill="<name>") diskten seçili kelime listelerini çeker. ssti / jwt gibi beceriler payloads/ dizinlerinde hazır yük dosyalarıyla gelir.',
  'Devre dışı beceriler aracın sistem isteminden tamamen gizlenir. Yeniden başlatmadan bir beceriyi geri açmak için /skills kullanın.',
  '/model list etkileşimli bir arka uç model seçicisi açar; /model <id> canlı katalogla doğrular ve yazım hatasında en yakın eşleşmeyi önerir.',
  '/memory intel stats öğrenilen arka plan senaryolarının sayısını gösterir; /memory intel clear bunları siler (project/personal/all). İstihbarat otomatik budanır ancak uzun görevlerde üst sınıra kadar büyür.',
];

function pad(s: string, n: number): string {
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

function buildHelpText(
  agent: Agent,
  readConfig: () => {
    backend: Backend;
    baseURL: string;
    apiKey: string;
    model: string;
    customModels?: string[];
  },
): string {
  const c = helpChalk;
  const cfg = readConfig();
  const enabled = agent.skills.listEnabled().length;
  const total = agent.skills.list().length;
  const target = agent.target.baseURL() || '(yok — görev ayarlanmamış)';
  const provider = cfg.backend || 'ollama';
  const model = cfg.model || agent.client.model() || '(ayarlanmamış)';
  const memory = agent.getMemoryStats();

  const out: string[] = [];

  out.push(c.bold.cyan('Eschaton') + c.gray(' — hızlı başvuru'));
  out.push(c.gray('─'.repeat(60)));
  out.push('');

  // Session ----------------------------------------------------------
  out.push(c.bold.white('Oturum'));
  out.push(`  ${c.gray('sağlayıcı')}  ${c.white(provider)}`);
  out.push(`  ${c.gray('model')}      ${c.white(model)}`);
  out.push(`  ${c.gray('hedef')}      ${c.white(target)}`);
  out.push(
    `  ${c.gray('limitler')}   maks adım ${c.white(String(agent.getMaxSteps()))}` +
      `  ·  otomatik özetleme ${c.white(String(agent.getAutoCompactThreshold()))} tok` +
      `  ·  düşünme ${c.white(agent.thinkingIsEnabled() ? 'on' : 'off')}`,
  );
  out.push(`  ${c.gray('beceriler')}  ${c.white(`${enabled}/${total}`)} etkin`);
  out.push(
    `  ${c.gray('bellek')}     ${c.white(`${memory.items} öğe`)}` +
      `  ·  özetlemeler ${c.white(String(memory.compactions))}`,
  );
  out.push('');

  // Slash commands ---------------------------------------------------
  out.push(c.bold.white('Eğik çizgi komutları'));
  // Width of "name args" column for alignment.
  const namelines = SLASH_ITEMS.map((s) => (s.args ? `${s.name} ${s.args}` : s.name));
  const w = Math.min(36, Math.max(...namelines.map((n) => n.length)) + 2);
  SLASH_ITEMS.forEach((s, i) => {
    const left = pad(namelines[i] ?? '', w);
    out.push(`  ${c.cyan(left)}${c.gray(s.description)}`);
  });
  out.push('');

  // Keybindings ------------------------------------------------------
  out.push(c.bold.white('Girdi ve gezinme'));
  const kw = Math.max(...KEYBINDINGS.map((k) => k.keys.length)) + 2;
  for (const k of KEYBINDINGS) {
    out.push(`  ${c.cyan(pad(k.keys, kw))}${c.gray(k.desc)}`);
  }
  out.push('');

  // Tips -------------------------------------------------------------
  out.push(c.bold.white('İpuçları'));
  for (const t of TIPS) {
    // Wrap each tip to ~88 cols, manually so we don't blow the terminal
    // layout. Words only.
    const words = t.split(' ');
    let line = '  • ';
    for (const w of words) {
      if (line.length + w.length + 1 > 88) {
        out.push(c.gray(line));
        line = '    ';
      }
      line += `${w} `;
    }
    if (line.trim().length > 0) out.push(c.gray(line.trimEnd()));
  }
  out.push('');
  out.push(c.gray('Canlı komut menüsü için ') + c.cyan('/') + c.gray(' yazın.'));

  return out.join('\n');
}
