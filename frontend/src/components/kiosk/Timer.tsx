import { useEffect, useState } from 'react'

/**
 * Hook que devuelve `Date.now()` y se re-renderiza cada `intervalMs`.
 * Default 1s — para timers visuales que no necesitan precisión sub-segundo.
 */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

interface TimerProps {
  startISO: string
  className?: string
  format?: 'hms' | 'hm'
}

/**
 * Muestra el tiempo transcurrido desde `startISO` hasta ahora.
 * Re-renderiza cada segundo (hms) o cada 30s (hm).
 */
export default function Timer({ startISO, className, format = 'hms' }: TimerProps) {
  const now = useNow(format === 'hms' ? 1000 : 30000)
  const start = new Date(startISO).getTime()
  const diffSec = Math.max(0, Math.floor((now - start) / 1000))

  const h = Math.floor(diffSec / 3600)
  const m = Math.floor((diffSec % 3600) / 60)
  const s = diffSec % 60

  const text = format === 'hms'
    ? `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${h}h ${String(m).padStart(2, '0')}m`

  return <span className={className}>{text}</span>
}
