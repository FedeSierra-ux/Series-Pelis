import { describe, expect, it } from 'vitest'
import { cleanText, extractTrivia, splitSections, splitSentences, titleFromUrl, wikiUrl } from './wikiTrivia'

// Texto como lo devuelve la API (prop=extracts, explaintext, exsectionformat=wiki), resumido.
const ARTICLE = `Matrix es una película de ciencia ficción de 1999.

== Argumento ==
Thomas Anderson es un programador que de noche trabaja como hacker bajo el alias de Neo y busca a Morfeo.

== Reparto ==
Keanu Reeves como Neo.
Laurence Fishburne como Morfeo.

== Producción ==


=== Preproducción ===
Las hermanas Wachowski se inspiraron para hacer la película en el anime japonés, como Ghost in the Shell (1995).​ Para el rodaje, los actores principales entrenaron cuatro meses con expertos en artes marciales. Eso ocurrió desde octubre de 1997 hasta marzo de 1998.


=== Rodaje ===
La película se rodó a partir del 1 de septiembre de 1998 y duró 118 días, casi un mes más de lo previsto, en Sídney.​


=== Música ===
La banda sonora incluye temas de Rob Dougan, Marilyn Manson y Rage Against the Machine, entre muchos otros.


== Recepción ==
La película arrasó en taquilla y recaudó en todo el mundo más de 460 millones de dólares, lo que permitió hacer la trilogía.​ Según el filósofo William Irwin:


== Premios y nominaciones ==


=== Premios Óscar ===
(1999) Mejor montaje, para Zach Staenberg, en la ceremonia de los premios de la Academia.


== Curiosidades ==
El famoso efecto de "tiempo bala" se logró con 120 cámaras fotográficas dispuestas alrededor de los actores.
Will Smith rechazó el papel de Neo para protagonizar Wild Wild West, decisión de la que dijo arrepentirse.


== Referencias ==
Ficha de la película en un sitio de referencia de cine con muchos datos adicionales.
`

describe('splitSections', () => {
  it('arma el camino de encabezados', () => {
    const paths = splitSections(ARTICLE).map((s) => s.path.join(' > '))
    expect(paths).toContain('Producción > Preproducción')
    expect(paths).toContain('Premios y nominaciones > Premios Óscar')
    expect(paths).toContain('Curiosidades')
    // "Producción" sin texto propio (solo subsecciones) no aparece suelta.
    expect(paths).not.toContain('Producción')
  })
})

describe('splitSentences', () => {
  it('no corta en abreviaturas', () => {
    expect(splitSentences('Se estrenó en EE. UU. en marzo. Fue un éxito.')).toEqual(['Se estrenó en EE. UU. en marzo.', 'Fue un éxito.'])
    expect(splitSentences('La dirigió el Sr. Pérez. Ganó un premio.')).toEqual(['La dirigió el Sr. Pérez.', 'Ganó un premio.'])
  })

  it('corta antes de signos de apertura y números', () => {
    expect(splitSentences('Primera oración. ¿Pregunta? «Cita» al final. 1999 fue el año.')).toEqual([
      'Primera oración.',
      '¿Pregunta?',
      '«Cita» al final.',
      '1999 fue el año.',
    ])
  })
})

describe('cleanText', () => {
  it('saca espacios de ancho cero, paréntesis vacíos y espacios de más', () => {
    expect(cleanText('Hola​ ( ) mundo  , chau .')).toBe('Hola mundo, chau.')
  })
})

describe('extractTrivia', () => {
  const points = extractTrivia(ARTICLE)

  it('entre 2 y 5 puntos, empezando por "Curiosidades"', () => {
    expect(points.length).toBeGreaterThanOrEqual(2)
    expect(points.length).toBeLessThanOrEqual(5)
    expect(points[0]).toMatch(/^El famoso efecto de "tiempo bala"/)
  })

  it('alterna entre secciones: curiosidades, producción, rodaje y recepción', () => {
    expect(points).toEqual([
      'El famoso efecto de "tiempo bala" se logró con 120 cámaras fotográficas dispuestas alrededor de los actores.',
      'Las hermanas Wachowski se inspiraron para hacer la película en el anime japonés, como Ghost in the Shell (1995).',
      'La película se rodó a partir del 1 de septiembre de 1998 y duró 118 días, casi un mes más de lo previsto, en Sídney.',
      'La película arrasó en taquilla y recaudó en todo el mundo más de 460 millones de dólares, lo que permitió hacer la trilogía.',
      'Will Smith rechazó el papel de Neo para protagonizar Wild Wild West, decisión de la que dijo arrepentirse.',
    ])
  })

  it('deja afuera argumento, reparto, música, premios, referencias, frases sin contexto y las que terminan en ":"', () => {
    const all = points.join('\n')
    expect(all).not.toMatch(/Thomas Anderson|Keanu|Rob Dougan|Mejor montaje|sitio de referencia|Eso ocurrió|William Irwin/)
  })

  it('respeta el máximo', () => {
    expect(extractTrivia(ARTICLE, 3)).toHaveLength(3)
  })

  it('sin nada útil devuelve una lista vacía (la sección no se muestra)', () => {
    expect(extractTrivia('Intro.\n\n== Argumento ==\nUn hombre busca a otro durante toda la película y lo encuentra.\n')).toEqual([])
    expect(extractTrivia('== Rodaje ==\nSe filmó en Madrid durante el verano de 2010, con un equipo muy chico.\n')).toEqual([])
  })
})

describe('Wikipedia: títulos y enlaces', () => {
  it('título desde la URL de Wikidata y enlace de vuelta', () => {
    expect(titleFromUrl('https://es.wikipedia.org/wiki/Dune_(pel%C3%ADcula_de_2021)')).toBe('Dune (película de 2021)')
    expect(wikiUrl('Dune (película de 2021)')).toBe('https://es.wikipedia.org/wiki/Dune_(pel%C3%ADcula_de_2021)')
  })
})
