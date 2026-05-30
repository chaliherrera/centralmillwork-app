interface Orb {
  left: string
  top: string
  size: number
  color: string
  opacity: number
}

const ORBS_WARM: Orb[] = [
  { left: '-8%',  top: '-10%', size: 620, color: '#C49B2E', opacity: 0.55 },
  { left: '78%',  top: '-5%',  size: 560, color: '#B5421E', opacity: 0.40 },
  { left: '20%',  top: '38%',  size: 700, color: '#5C4A3A', opacity: 0.55 },
  { left: '88%',  top: '55%',  size: 640, color: '#4A5240', opacity: 0.60 },
  { left: '5%',   top: '95%',  size: 540, color: '#9B7200', opacity: 0.45 },
  { left: '60%',  top: '90%',  size: 580, color: '#2c3126', opacity: 0.55 },
]

/**
 * Fondo mesh con orbs de pigmentos de marca difuminados sobre base oscura.
 * fixed + -z-10 → no scrollea con la página, vive detrás de todo.
 * Sin animación: el mesh es estático, lo que se mueve son las cards y modals.
 */
export default function MeshBackground() {
  return (
    <div
      aria-hidden
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none"
      style={{ background: '#14110c' }}
    >
      {ORBS_WARM.map((orb, i) => (
        <div
          key={i}
          className="absolute rounded-full"
          style={{
            left: orb.left,
            top: orb.top,
            width: `${orb.size}px`,
            height: `${orb.size}px`,
            background: orb.color,
            opacity: orb.opacity,
            filter: 'blur(90px)',
            transform: 'translate(-50%, -50%)',
          }}
        />
      ))}
      {/* Film grain */}
      <div
        className="absolute inset-0 mix-blend-overlay opacity-40"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.02) 1px, transparent 1px)',
          backgroundSize: '3px 3px',
        }}
      />
    </div>
  )
}
