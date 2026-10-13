import { describe, expect, it } from 'vitest'

// Un efecto escrito como `useEffect(() => algo())` devuelve lo que devuelva `algo()`, y React lo llama al
// desmontar. Si es una promesa (desde Chrome 150 `scrollTo` devuelve una), tira "is not a function" y la
// pantalla queda en negro. Estas llamadas del navegador devuelven promesas: van siempre con llaves.
const PROMISE_APIS = /use(Layout)?Effect\(\s*\(\)\s*=>\s*[\w.?]*\b(scrollTo|scrollBy|scroll|scrollIntoView|play|requestFullscreen|exitFullscreen)\(/

// Todo el código de la app (sin los tests), como texto.
const SOURCES = import.meta.glob<string>(['../**/*.{ts,tsx}', '!../**/*.test.{ts,tsx}'], { query: '?raw', import: 'default', eager: true })

describe('efectos', () => {
  it('no devuelven la promesa de una llamada del navegador como limpieza', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    const bad = Object.entries(SOURCES).flatMap(([file, text]) =>
      text
        .split('\n')
        .map((line, i) => (PROMISE_APIS.test(line) ? `${file}:${i + 1}` : ''))
        .filter(Boolean),
    )
    expect(bad).toEqual([])
  })
})
