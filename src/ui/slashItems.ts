// Slash-command catalog. Single source of truth for the menu, the
// completion logic, and the dispatcher in App.tsx.

export interface SlashItem {
  name: string; // includes leading slash, e.g. "/help"
  args?: string; // arg hint shown next to the name
  description: string;
}

export const SLASH_ITEMS: SlashItem[] = [
  { name: '/help', description: 'tuş kısayollarını ve eğik çizgi komutlarını göster' },
  {
    name: '/provider',
    description: 'etkileşimli seçici: LLM arka ucunu, ardından katalogundan bir modeli seç',
  },
  {
    name: '/model',
    args: '<id|list|custom>',
    description: 'model değiştir (özel kimlik serbest), kataloğu listele veya özel kimlik gir',
  },
  {
    name: '/config',
    args: '[show|path|example]',
    description: 'yolu + okunabilir config.json (maskelenmiş) göster veya açıklamalı örnek yazdır',
  },
  { name: '/plan', args: '[objective]', description: 'araçsız, yalnızca plan modu' },
  { name: '/next', args: '[objective]', description: 'kapsam odaklı sonraki test önerileri' },
  { name: '/compact', description: 'konuşmayı kalıcı oturum belleğine özetle' },
  {
    name: '/memory',
    args: '[add <text>|list|forget <text>|clear|provider]',
    description:
      'kayıtlı + oturum belleği; seçili bilgileri ekle/listele (#<text> ile de), forget/clear/provider komutları',
  },
  { name: '/snapshot', description: 'geçerli maskelenmiş bağlam anlık görüntüsünü şimdi yaz' },
  {
    name: '/user',
    args: '[add <text>|clear]',
    description:
      'aracın senin hakkında öğrendiklerini görüntüle/ekle/temizle (~/.eschaton/USER.md)',
  },
  {
    name: '/report',
    args: '[markdown|sarif]',
    description: 'onaylanmış tüm bulguları tek bir rapor dosyasına aktar (varsayılan markdown)',
  },
  { name: '/burp', args: '[port]', description: 'yerel Burp/Eschaton dinleyicisini başlat' },
  { name: '/jobs', description: 'arka plan kabuk işlerini listele (çalışan / biten)' },
  { name: '/clear', description: 'yalnızca ekrandaki dökümü temizle' },
  { name: '/reset', description: 'konuşmayı + kayıtlı oturumu temizle' },
  {
    name: '/target',
    args: '<url>',
    description:
      "bir görev temel URL'si sabitle; http aracı varsayılan olarak onu kullanır (argsız temizler)",
  },
  {
    name: '/scope',
    args: '[add|deny|remove|list|clear] <pattern>',
    description:
      'http/web_fetch için görev ana makine izin listesi; boş kapsam hiçbir şeyi zorlamaz (varsayılan)',
  },
  {
    name: '/skills',
    args: '[enable|disable|new <name>]',
    description: 'becerileri listele/aç-kapat veya yeni bir iskelet oluştur (/skills new <name>)',
  },
  {
    name: '/maxsteps',
    args: '<n>',
    description: 'otomatik devam öncesi tur başına araç bütçesi (varsayılan 20)',
  },
  {
    name: '/thinking',
    args: 'on|off',
    description: 'düşünme gösterimi sistem direktifini aç/kapat',
  },
  { name: '/update', args: '[version]', description: 'GitHub sürüm güncellemelerini getir ve kur' },
  {
    name: '/yolo',
    args: '[on|off]',
    description: 'YOLO otomatik onayını aç/kapat (yalnızca laboratuvar)',
  },
  {
    name: '/mode',
    args: 'ask|auto-safe|yolo|plan|act',
    description: 'izin seviyesi (ask/auto-safe/yolo) veya plan/act çalışma modu',
  },
  { name: '/act', description: 'plan modundan çık (/mode act takma adı)' },
  {
    name: '/compact-mode',
    args: '[on|off]',
    description: 'daha sıkı döküm aralığını aç/kapat (girdiler arasında boş satır yok)',
  },
  { name: '/exit', description: 'eschaton uygulamasından çık' },
];

/**
 * Filter a catalog by what the user has typed so far. Empty input
 * returns the full list; `/he` returns `/help`; partial commands match
 * by prefix on the command name (case-insensitive). `extras` is appended
 * to SLASH_ITEMS so callers can splice in dynamic items (e.g. one
 * `/<skill-name>` entry per loaded skill) without mutating the static
 * catalog.
 *
 * Matching is prefix-first: `/he` → `/help`. When NOTHING prefix-matches we
 * fall back to a fuzzy subsequence match on the chars after the slash, so a
 * typo or a match-anywhere query still finds the command (`/povider` →
 * `/provider`, `/grql` → a `/graphql` skill) instead of an empty menu.
 */
export function filterSlash(input: string, extras: SlashItem[] = []): SlashItem[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return [];
  // If the user already finished a slash command and is typing args
  // (whitespace after the command), suppress the menu.
  if (/\s/.test(trimmed.slice(1))) return [];
  const all = extras.length > 0 ? [...SLASH_ITEMS, ...extras] : SLASH_ITEMS;
  const needle = trimmed.toLowerCase();
  if (needle === '/') return all;
  const prefix = all.filter((s) => s.name.toLowerCase().startsWith(needle));
  if (prefix.length > 0) return prefix;
  // Fuzzy fallback: subsequence of the typed chars (sans leading slash)
  // anywhere in the command name.
  const chars = needle.slice(1);
  if (!chars) return [];
  return all.filter((s) => isSubsequence(chars, s.name.toLowerCase().slice(1)));
}

/** True if every char of `needle` appears in `hay` in order (not necessarily
 *  contiguous) — the classic fuzzy-finder subsequence test. */
function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (let j = 0; j < hay.length && i < needle.length; j += 1) {
    if (hay[j] === needle[i]) i += 1;
  }
  return i === needle.length;
}
