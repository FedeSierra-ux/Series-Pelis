import { useEffect, useState } from 'react'
import { useNearViewport } from '../pages/home/lazy'
import { getWikiTrivia, type WikiTrivia as Trivia } from '../lib/wikiTrivia'
import { peekMemory } from '../lib/cache'

/** "¿Sabías que?" en la ficha: 3-5 datos de Wikipedia en español. Si no hay nada útil, no aparece. */
export function WikiTrivia({ imdbId }: { imdbId: string }) {
  // Se pide recién cuando la sección se acerca a la pantalla (casi siempre está al final de la ficha).
  const [ref, near] = useNearViewport<HTMLDivElement>(false)
  const [data, setData] = useState<{ id: string; trivia: Trivia }>(() => {
    const mem = peekMemory<Trivia>(`wiki-trivia:v1:${imdbId}`)?.data
    return { id: imdbId, trivia: mem ?? { points: [] } }
  })

  useEffect(() => {
    if (!near) return
    let alive = true
    getWikiTrivia(imdbId)
      .then((trivia) => alive && setData({ id: imdbId, trivia }))
      .catch(() => alive && setData({ id: imdbId, trivia: { points: [] } }))
    return () => {
      alive = false
    }
  }, [near, imdbId])

  const trivia = data.id === imdbId ? data.trivia : undefined
  if (!trivia?.points.length) return <div ref={ref} className="wiki-trivia-sentinel" aria-hidden />

  return (
    <div ref={ref}>
      <section className="wiki-trivia" aria-labelledby="wiki-trivia-title">
        <h2 id="wiki-trivia-title">¿Sabías que?</h2>
        <ul className="wiki-trivia-list">
          {trivia.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {trivia.url && (
          <p className="wiki-trivia-source muted small">
            <a className="btn btn-small" href={trivia.url} target="_blank" rel="noreferrer">
              Ver en Wikipedia
            </a>
            <span>
              Fuente: artículo “{trivia.title}” de Wikipedia en español (
              <a href="https://creativecommons.org/licenses/by-sa/4.0/deed.es" target="_blank" rel="noreferrer" tabIndex={-1}>
                CC BY-SA 4.0
              </a>
              ).
            </span>
          </p>
        )}
      </section>
    </div>
  )
}
