import { describe, expect, it } from 'vitest'

// Vigila el "sistema" del CSS (v0.36): la escala de capas, los respaldos de color-mix() para las TVs viejas y los
// tokens de color. Lee las hojas como texto (con `?raw` vitest devuelve vacío para los .css: se usa `node:fs`).
const mod = 'node:fs'
const fs = (await import(/* @vite-ignore */ mod)) as {
  readFileSync: (p: URL, enc: 'utf8') => string
  readdirSync: (p: URL, o: { recursive: true }) => string[]
}
const SRC = new URL('../', import.meta.url)
const SHEETS: Record<string, string> = {}
for (const f of fs.readdirSync(SRC, { recursive: true }).filter((p) => p.endsWith('.css')).sort()) SHEETS['../' + f.replace(/\\/g, '/')] = fs.readFileSync(new URL(f, SRC), 'utf8')

interface Node {
  prelude: string
  decls: Array<{ prop: string; value: string }>
  children: Node[]
}

/** Parser mínimo de CSS: bloques anidados (@media, @supports) con sus declaraciones, sin comentarios. */
function parse(css: string): Node {
  const root: Node = { prelude: '', decls: [], children: [] }
  const stack = [root]
  let buf = ''
  let paren = 0
  let quote = ''
  const pushDecl = () => {
    const t = buf.trim()
    buf = ''
    const m = t.match(/^([-\w]+)\s*:([\s\S]*)$/)
    if (m) stack[stack.length - 1].decls.push({ prop: m[1].toLowerCase(), value: m[2].trim() })
  }
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const ch of text) {
    if (quote) {
      buf += ch
      if (ch === quote) quote = ''
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      buf += ch
    } else if (ch === '(') {
      paren++
      buf += ch
    } else if (ch === ')') {
      paren--
      buf += ch
    } else if (ch === '{' && paren === 0) {
      const node: Node = { prelude: buf.trim().replace(/\s+/g, ' '), decls: [], children: [] }
      stack[stack.length - 1].children.push(node)
      stack.push(node)
      buf = ''
    } else if (ch === '}' && paren === 0) {
      if (buf.trim()) pushDecl()
      buf = ''
      if (stack.length > 1) stack.pop()
    } else if (ch === ';' && paren === 0) {
      pushDecl()
    } else buf += ch
  }
  return root
}

function walk(node: Node, fn: (n: Node, ancestors: string[]) => void, ancestors: string[] = []) {
  for (const c of node.children) {
    fn(c, ancestors)
    walk(c, fn, [...ancestors, c.prelude])
  }
}

const PARSED = Object.entries(SHEETS).map(([file, css]) => ({ file: file.replace('../', 'src/'), css, tree: parse(css) }))
const RULES: Array<{ file: string; selector: string; ancestors: string[]; node: Node }> = []
for (const s of PARSED) walk(s.tree, (n, anc) => RULES.push({ file: s.file, selector: n.prelude, ancestors: anc, node: n }))

/** Las variables de :root de styles.css y de theme2.css. */
const TOKENS: Record<string, string> = {}
for (const r of RULES) {
  if (/^:root(\[data-theme=['"]2['"]\])?$/.test(r.selector)) for (const d of r.node.decls) if (d.prop.startsWith('--')) TOKENS[d.prop] = d.value.replace(/\s*\/\*.*$/, '').trim()
}

describe('escala de capas (z-index)', () => {
  const scale = Object.entries(TOKENS)
    .filter(([k]) => k.startsWith('--z-'))
    .map(([k, v]) => [k, Number(v)] as const)

  it('hay una escala y ningún nivel empata con otro', () => {
    expect(scale.length).toBeGreaterThanOrEqual(10)
    const values = scale.map(([, v]) => v)
    expect(values.every((v) => Number.isInteger(v))).toBe(true)
    expect(new Set(values).size).toBe(values.length)
  })

  it('el protector va al tope y los modales con tráiler/perfiles quedan debajo', () => {
    const z = Object.fromEntries(scale)
    expect(Math.max(...scale.map(([, v]) => v))).toBe(z['--z-system'])
    expect(z['--z-trailer']).toBeLessThan(z['--z-system'])
    expect(z['--z-profiles']).toBeLessThan(z['--z-trailer'])
  })

  it('el aviso de sin conexión queda sobre la portada fija y bajo el riel', () => {
    const z = Object.fromEntries(scale)
    expect(z['--z-banner']).toBeGreaterThan(z['--z-hero'])
    expect(z['--z-banner']).toBeLessThan(z['--z-rail'])
  })

  it('fuera de la escala solo quedan valores internos (-1 a 6): lo demás usa var(--z-…)', () => {
    const loose: string[] = []
    for (const r of RULES)
      for (const d of r.node.decls)
        if (d.prop === 'z-index' && !/^var\(--z-[a-z]+\)$/.test(d.value) && !(Number.isInteger(Number(d.value)) && Math.abs(Number(d.value)) <= 6)) loose.push(`${r.file} ${r.selector}: ${d.value}`)
    expect(loose).toEqual([])
  })

  it('cada var(--z-…) usada existe en la escala', () => {
    const names = new Set(scale.map(([k]) => k))
    const unknown: string[] = []
    for (const r of RULES)
      for (const d of r.node.decls) {
        const m = d.prop === 'z-index' ? d.value.match(/^var\((--z-[a-z]+)\)$/) : null
        if (m && !names.has(m[1])) unknown.push(`${r.file} ${r.selector}: ${m[1]}`)
      }
    expect(unknown).toEqual([])
  })
})

describe('respaldo de color-mix() para las TVs con Chromium < 111', () => {
  // Una declaración con var() no se descarta al parsear: la de color-mix() pisa a la anterior y, en un navegador que no la
  // entiende, queda inválida al calcular (transparente). Una línea previa con rgba() NO sirve de respaldo: va un
  // `@supports not (color: color-mix(…))` justo después de la regla, con el mismo selector y el mismo @media.
  const FALLBACK_QUERY = /^@supports not \(\s*color:\s*color-mix\(/

  it('toda declaración con color-mix() tiene su respaldo en un @supports not, después de la regla', () => {
    const missing: string[] = []
    RULES.forEach((r, i) => {
      if (r.ancestors.some((p) => FALLBACK_QUERY.test(p))) return
      for (const d of r.node.decls) {
        if (!d.value.includes('color-mix(') || d.prop.startsWith('--')) continue
        const twin = RULES.findIndex(
          (x, j) =>
            j > i &&
            x.file === r.file &&
            x.selector === r.selector &&
            x.ancestors.some((p) => FALLBACK_QUERY.test(p)) &&
            x.ancestors.filter((p) => !FALLBACK_QUERY.test(p)).join('|') === r.ancestors.join('|') &&
            x.node.decls.some((y) => y.prop === d.prop && !y.value.includes('color-mix(')),
        )
        if (twin < 0) missing.push(`${r.file} ${r.selector} { ${d.prop} }`)
      }
    })
    expect(missing).toEqual([])
  })

  it('los respaldos no llevan color-mix() adentro', () => {
    const bad: string[] = []
    for (const r of RULES) if (r.ancestors.some((p) => FALLBACK_QUERY.test(p))) for (const d of r.node.decls) if (d.value.includes('color-mix(')) bad.push(`${r.file} ${r.selector} { ${d.prop} }`)
    expect(bad).toEqual([])
  })

  it('los respaldos con rgba(var(--x-rgb)) usan canales que existen', () => {
    const used = new Set<string>()
    for (const s of PARSED) for (const m of s.css.matchAll(/var\((--[\w-]+-rgb)\)/g)) used.add(m[1])
    expect([...used].filter((k) => !(k in TOKENS) && k !== '--portada-ink-rgb')).toEqual([])
  })

  it('los canales -rgb son los mismos colores que su variable', () => {
    const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', ')
    for (const name of ['bg', 'bg-2', 'text', 'accent', 'danger']) {
      const color = name === 'danger' ? TOKENS['--danger'] : TOKENS[`--${name}`]
      expect(color, `--${name}`).toMatch(/^#[0-9a-f]{6}$/i)
      expect(TOKENS[`--${name}-rgb`], `--${name}-rgb`).toBe(hex(color))
    }
  })
})

describe(':has() en las TVs viejas', () => {
  it('ninguna lista de selectores mezcla :has() con otros: sin soporte se perdería la regla entera', () => {
    const mixed: string[] = []
    for (const r of RULES) {
      if (r.ancestors.some((p) => p.startsWith('@supports selector(:has'))) continue
      const parts = r.selector.split(/,(?![^(]*\))/).map((p) => p.trim())
      if (parts.length > 1 && parts.some((p) => p.includes(':has(')) && parts.some((p) => !p.includes(':has('))) mixed.push(`${r.file} ${r.selector}`)
    }
    expect(mixed).toEqual([])
  })
})

describe('tokens de tamaño, sombra y foco', () => {
  it('toda var(--fs-…), --shadow-…, --focus-… o --z-… usada está definida', () => {
    const unknown = new Set<string>()
    for (const s of PARSED) for (const m of s.css.matchAll(/var\((--(?:fs|shadow|focus|z)-[\w-]+)\s*[,)]/g)) if (!(m[1] in TOKENS)) unknown.add(`${s.file} ${m[1]}`)
    expect([...unknown]).toEqual([])
  })

  it('los tamaños de letra de los tokens son rem y van de menor a mayor', () => {
    const fs = Object.entries(TOKENS).filter(([k]) => k.startsWith('--fs-'))
    expect(fs.length).toBeGreaterThanOrEqual(8)
    const rem = fs.map(([, v]) => parseFloat(v))
    expect(fs.every(([, v]) => /^[0-9.]+rem$/.test(v))).toBe(true)
    expect([...rem].sort((a, b) => a - b)).toEqual(rem)
  })

  it('el foco usa un anillo del sistema: nada de `var(--focus-ring, …)` con un respaldo que contradice al token', () => {
    const bad: string[] = []
    for (const r of RULES) for (const d of r.node.decls) if (d.prop === 'outline' && /var\(--focus-ring[a-z-]*\s*,/.test(d.value)) bad.push(`${r.file} ${r.selector}`)
    expect(bad).toEqual([])
  })

  it('los radios no llevan un respaldo muerto (var(--radius-sm, 12px)): los tokens siempre existen', () => {
    const bad: string[] = []
    for (const r of RULES) for (const d of r.node.decls) if (/var\(--radius(-sm|-lg)?\s*,/.test(d.value)) bad.push(`${r.file} ${r.selector}`)
    expect(bad).toEqual([])
  })
})

describe('pesos de fuente', () => {
  // theme.ts carga DM Sans 400/500/700 y Sora 700/800: declarar 600, 900 o 300 engaña (el navegador usa otro peso).
  it('solo se declaran pesos que se cargan', () => {
    const bad: string[] = []
    for (const r of RULES) for (const d of r.node.decls) if (d.prop === 'font-weight' && !/^(400|500|700|800|normal|bold|inherit|initial|unset)(\s*!important)?$/.test(d.value)) bad.push(`${r.file} ${r.selector}: ${d.value}`)
    expect(bad).toEqual([])
  })
})
