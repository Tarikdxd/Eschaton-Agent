const enabled = Boolean(process.stdout.isTTY) && !process.env.NO_COLOR

export type Paint = (text: string) => string

function paint(code: string): Paint {
  if (!enabled) return (text) => text
  return (text) => `\x1b[${code}m${text}\x1b[0m`
}

export const c = {
  bold: paint('1'),
  dim: paint('2'),
  italic: paint('3'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  magenta: paint('35'),
  cyan: paint('36'),
  gray: paint('90'),
  white: paint('97'),
}

export const sym = {
  prompt: '›',
  tool: '▸',
  ok: '✓',
  fail: '✗',
  dot: '·',
  arrow: '→',
}
