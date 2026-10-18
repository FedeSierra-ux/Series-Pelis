import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ContinueCard } from '../components/ContinueCard'
import { PosterCard } from '../components/PosterCard'
import { ProfileAvatar } from '../components/ProfileAvatar'
import { Row } from '../components/Row'
import { Theme2Icon, type Theme2IconName } from '../components/Theme2Icons'
import { useTitle } from '../lib/hooks'
import { openProfilePicker } from '../lib/profiles'
import { useActiveProfile, useProfiles } from '../lib/profileSwitch'
import { formatStars, isHighStars } from '../lib/stars'
import { continueWatching, hideFromContinue, progressStore, ratingsStore, useStore } from '../lib/store'
import { HistoryGoal } from './goals/GoalLink'
import { HistoryFeed, HistoryStats } from './history/HistoryFeed'
import { MyListSection } from './MyList'
import './me.css'

// v0.14 (U26): "Vos", estilo "Mi Netflix" pero con el historial adentro. Junta lo personal que antes estaba
// repartido: Seguir viendo, Mi lista, lo que te gustó (4-5 ★), lo que viste (por día) y los accesos.
// v0.23: Mi lista completa (en grilla) es lo principal, y los accesos son Historial, Calendario y Tu año.

/** Cuántas entradas del historial se ven acá; el resto, en "Ver todo el historial". */
const HISTORY_PREVIEW = 8
const ROW_MAX = 20
const UNDO_MS = 5000

const detailLink = (e: { type: string; metaId: string; season?: number; videoId: string }) =>
  `/detail/${e.type}/${encodeURIComponent(e.metaId)}${e.season !== undefined ? `?season=${e.season}&video=${encodeURIComponent(e.videoId)}` : ''}`

/** Perfiles (v0.18): con más de uno, quién está mirando y "Cambiar"; con uno solo, nada más el acceso para agregar. */
function ProfileSwitcher() {
  const multi = useProfiles().length > 1
  const profile = useActiveProfile()
  if (!multi) {
    return (
      <button type="button" className="btn btn-ghost btn-small me-profiles" onClick={() => openProfilePicker(true)}>
        Perfiles
      </button>
    )
  }
  return (
    <div className="me-profile">
      <ProfileAvatar profile={profile} size={48} />
      <div className="me-profile-text">
        <span className="muted">Mirando como</span>
        <strong>{profile.name}</strong>
      </div>
      <button type="button" className="btn btn-small" onClick={() => openProfilePicker()}>
        Cambiar de perfil
      </button>
      <button type="button" className="btn btn-ghost btn-small" onClick={() => openProfilePicker(true)}>
        Administrar
      </button>
    </div>
  )
}

export function Me() {
  useTitle('Vos')
  const progress = useStore(progressStore)
  const ratings = useStore(ratingsStore)
  const resume = useMemo(() => continueWatching(progress), [progress])
  const liked = useMemo(
    () =>
      Object.entries(ratings)
        .filter(([, r]) => isHighStars(r.stars))
        .sort(([, a], [, b]) => b.stars - a.stars || b.at - a.at)
        .slice(0, ROW_MAX),
    [ratings],
  )
  const watchedMovies = useMemo(
    () => new Set(Object.values(progress).filter((e) => e.type === 'movie' && e.watched).map((e) => e.metaId)),
    [progress],
  )
  const { undo, hide, restore } = useUndoHide()

  return (
    <div className="page me-page">
      <header className="page-header me-header">
        <div>
          <h1>Vos</h1>
          <p className="muted me-sub">Lo que estás viendo, lo que guardaste y todo lo que ya viste.</p>
        </div>
        <ProfileSwitcher />
      </header>

      <MeShortcuts />
      <HistoryGoal />
      <MyListSection />

      {resume.length > 0 && (
        <Row title="Seguir viendo">
          {resume.map((e) => (
            <ContinueCard key={e.videoId} entry={e} to={detailLink(e)} onRemove={() => hide(e.metaId, e.name)} />
          ))}
        </Row>
      )}

      {liked.length > 0 && (
        <Row title="Te gustaron">
          {liked.map(([id, r]) => (
            <PosterCard
              key={id}
              meta={{ id, type: r.type, name: r.name, poster: r.poster }}
              subtitle={`★ ${formatStars(r.stars)} · tu puntaje`}
              watched={watchedMovies.has(id)}
            />
          ))}
        </Row>
      )}

      <section className="me-history" aria-labelledby="me-history-title">
        <header className="me-history-head">
          <h2 id="me-history-title">Lo que viste</h2>
          <HistoryStats className="stats me-stats" />
          <Link to="/history" className="row-more">
            Historial completo
          </Link>
        </header>
        <HistoryFeed limit={HISTORY_PREVIEW} monthHeading="h3" />
      </section>

      {undo && (
        <div className="undo-toast" role="status">
          <span>
            Quitado de Seguir viendo<span className="muted"> · {undo.name}</span>
          </span>
          <button type="button" className="btn btn-small" onClick={restore}>
            Deshacer
          </button>
        </div>
      )}
    </div>
  )
}

interface Tile {
  to: string
  icon: Theme2IconName
  label: string
  hint: string
  primary?: boolean
}

/** Accesos (v0.23, en este orden): Historial, Calendario y Tu año. */
function MeShortcuts() {
  const year = new Date().getFullYear()
  const tiles: Tile[] = [
    { to: '/history', icon: 'history', label: 'Historial', hint: 'Todo lo que viste, por día' },
    { to: '/calendar', icon: 'calendar', label: 'Calendario', hint: 'Episodios que salen' },
    { to: '/history/year', icon: 'sparkles', label: `Tu año ${year}`, hint: 'Tu resumen del año', primary: true },
  ]
  return (
    <nav className="me-tiles" aria-label="Accesos de Vos">
      {tiles.map((t) => (
        <Link key={t.to} to={t.to} className={`me-tile${t.primary ? ' is-primary' : ''}`}>
          <span className="me-tile-icon" aria-hidden>
            <Theme2Icon name={t.icon} size={24} />
          </span>
          <span className="me-tile-text">
            <strong>{t.label}</strong>
            <span>{t.hint}</span>
          </span>
        </Link>
      ))}
    </nav>
  )
}

/** "Quitado de Seguir viendo · Deshacer" (igual que en Inicio). */
function useUndoHide() {
  const [undo, setUndo] = useState<{ name: string; ids: string[] }>()
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(
    () => () => {
      clearTimeout(timer.current)
    },
    [],
  )

  const hide = useCallback((metaId: string, name: string) => {
    const ids = Object.values(progressStore.get())
      .filter((e) => e.metaId === metaId && !e.hidden)
      .map((e) => e.videoId)
    hideFromContinue(metaId)
    setUndo({ name, ids })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setUndo(undefined), UNDO_MS)
  }, [])

  const restore = useCallback(() => {
    if (!undo) return
    progressStore.set((all) => {
      const copy = { ...all }
      for (const id of undo.ids) {
        if (!copy[id]) continue
        const { hidden: _hidden, ...rest } = copy[id]
        copy[id] = rest
      }
      return copy
    })
    clearTimeout(timer.current)
    setUndo(undefined)
  }, [undo])

  return { undo, hide, restore }
}
