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
