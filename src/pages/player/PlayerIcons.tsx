// Íconos de línea de los controles del reproductor (mismo trazo que Theme2Icons). Heredan el color del texto.

const ten = (
  <text x="12" y="15.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="currentColor" stroke="none">
    10
  </text>
)

const PATHS = {
  play: <path d="M7 4.5v15a.5.5 0 0 0 .77.42l11.5-7.5a.5.5 0 0 0 0-.84L7.77 4.08A.5.5 0 0 0 7 4.5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
      <rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor" />
    </>
  ),
  back10: (
    <>
      <path d="M4 12a8 8 0 1 0 2.35-5.65" />
      <path d="M4 3v4h4" />
      {ten}
    </>
  ),
  fwd10: (
    <>
      <path d="M20 12a8 8 0 1 1-2.35-5.65" />
      <path d="M20 3v4h-4" />
      {ten}
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />,
  fullscreen: <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />,
  /** Picture-in-Picture: pantalla con una ventanita abajo a la derecha. */
  pip: (
    <>
      <path d="M21 11V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5" />
      <rect x="13" y="13" width="9" height="7" rx="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  /** Parlante: silenciado, bajo y alto. */
  volumeOff: (
    <>
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </>
  ),
  volumeLow: (
    <>
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
    </>
  ),
  volumeHigh: (
    <>
      <path d="M4 9.5h3.5L12 5v14l-4.5-4.5H4z" />
      <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
      <path d="M18 7a7 7 0 0 1 0 10" />
    </>
  ),
  /** Ajustar / llenar / estirar: un rectángulo con flechas hacia afuera. */
  fit: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M8 12H5.5M16 12h2.5M7 10.5 5.5 12 7 13.5M17 10.5l1.5 1.5-1.5 1.5" />
    </>
  ),
  gear: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  unlock: (
    <>
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 7.5-2" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3l10 18H2z" />
      <path d="M12 10v5M12 18v.01" />
    </>
  ),
}

export type PlayerIconName = keyof typeof PATHS

export function PlayerIcon({ name, size = 24 }: { name: PlayerIconName; size?: number }) {
  return (
    <svg
      className="player-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  )
}
