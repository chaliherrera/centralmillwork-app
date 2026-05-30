import { CSSProperties, ReactNode } from 'react'

interface GlassProps {
  tint?: 'light' | 'dark'        // default light
  blur?: number                  // default 24
  sat?: number                   // default 180
  radius?: number                // default 18
  border?: boolean               // default true
  shine?: boolean                // default true
  className?: string
  style?: CSSProperties
  children: ReactNode
  onClick?: (e: React.MouseEvent) => void
}

/**
 * Primitive de glass — capa con backdrop-filter blur + saturate + shine inset.
 * Usar inline style porque Tailwind no soporta arbitrary backdrop-filter values
 * de forma dinámica limpiamente.
 */
export default function Glass({
  tint = 'light',
  blur = 24,
  sat = 180,
  radius = 18,
  border = true,
  shine = true,
  className,
  style,
  children,
  onClick,
}: GlassProps) {
  const bg = tint === 'light' ? 'rgba(255,255,250,0.10)' : 'rgba(20,18,14,0.42)'
  const borderColor = tint === 'light' ? 'rgba(255,255,250,0.20)' : 'rgba(255,255,250,0.10)'
  const shineShadow = tint === 'light'
    ? 'inset 1px 1.5px 1px rgba(255,255,255,0.45), inset -1px -1px 1px rgba(255,255,255,0.10)'
    : 'inset 1px 1.5px 1px rgba(255,255,255,0.18), inset -1px -1px 1px rgba(0,0,0,0.10)'
  const dropShadow = '0 8px 22px -8px rgba(0,0,0,0.35)'

  const combinedStyle: CSSProperties = {
    background: bg,
    backdropFilter: `blur(${blur}px) saturate(${sat}%)`,
    WebkitBackdropFilter: `blur(${blur}px) saturate(${sat}%)`,
    borderRadius: `${radius}px`,
    border: border ? `0.5px solid ${borderColor}` : 'none',
    boxShadow: shine ? `${shineShadow}, ${dropShadow}` : dropShadow,
    ...style,
  }

  return (
    <div className={className} style={combinedStyle} onClick={onClick}>
      {children}
    </div>
  )
}
