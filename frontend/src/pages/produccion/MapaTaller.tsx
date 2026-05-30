import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { produccionService } from '@/services/produccion'
import Timer from '@/components/kiosk/Timer'
import type { EstacionOrdenRunning, OrdenesKpis } from '@/types/produccion'

// ─── Tokens blueprint (también definidos en tailwind, acá inline para SVGs y style) ────
const BP = {
  paper:      '#F2EEE4',
  line:       '#C9C0AC',
  ink:        '#1F1B14',
  inkMuted:   '#7A6F58',
  inkSubtle:  '#9C9384',
  active:     '#16A34A',
  warn:       '#D89412',
  idle:       '#9C9384',
  overdue:    '#B53A3A',
}

// ─── Tipo unificado de Card ──────────────────────────────────────────────────
// Cada celda del Blueprint Map puede ser:
//  - una estación normal (CNC, Edge, Pintura, …)
//  - un carpintero individual de Assembly (Juan, Rolando, …)
type CardData = {
  id: string
  col: 1 | 2 | 3 | 4
  row: number
  name: string
  kind: 'machine' | 'assembly' | 'finishing' | 'output'
  cap: number
  status: 'active' | 'warn' | 'idle'
  ordenes_activas: number
  // Solo aplica a estaciones (no a celdas de carpintero individual)
  workers: { ini: string; name: string }[]
  // Item activo "running" para mostrar timer + datos del item
  // Si pausa_activa tiene valor, el operario está en pausa AHORA — no mostrar timer
  itemActivo: {
    numero_orden: string
    hora_inicio: string
    pausa_activa: { motivo: string | null; hora_inicio: string } | null
  } | null
  // Orden destacada (running o queued) para mostrar proyecto + due
  ordenRunning: EstacionOrdenRunning | null
  // Solo para carpinteros: link directo a filtrar órdenes por personal
  href: string
}

// ─── Layout: zonas y columnas ────────────────────────────────────────────────
const ZONE_CODES = ['MAQ', 'ENS', 'ACA', 'SAL'] as const
const ZONE_LABELS = ['Maquinado', 'Ensamble', 'Acabados', 'Salida'] as const
const ASSEMBLY_COL_X = 2

// Map de tipo de estación → kind del blueprint
function estacionKind(nombre: string): CardData['kind'] {
  if (nombre === 'cnc' || nombre === 'edge_banding') return 'machine'
  if (nombre === 'assembly')                          return 'assembly'
  if (nombre === 'pintura' || nombre === 'lamina')    return 'finishing'
  return 'output'  // final / registro / shipping
}

function deriveStatus(activas: number, cap: number, hasOverdue = false): CardData['status'] {
  if (activas === 0)        return 'idle'
  if (activas > cap)        return 'warn'
  if (hasOverdue)           return 'warn'
  return 'active'
}

// ─── Componente principal ────────────────────────────────────────────────────
export default function MapaTaller() {
  const { data: estaciones = [], isLoading } = useQuery({
    queryKey: ['estaciones'],
    queryFn:  produccionService.estaciones,
    refetchInterval: 30_000,
  })

  const { data: kpis } = useQuery({
    queryKey: ['ordenes-produccion-kpis'],
    queryFn:  produccionService.ordenesKpis,
    refetchInterval: 30_000,
  })

  // Convertir estaciones del backend en CardData[] (assembly se expande por carpintero)
  const cards: CardData[] = useMemo(() => {
    const out: CardData[] = []

    for (const e of estaciones) {
      if (e.nombre === 'assembly') {
        // Una card por carpintero (col 2, rows 1..N)
        const carpinteros = [...e.personal].sort((a, b) => a.personal_id - b.personal_id)
        carpinteros.forEach((p, idx) => {
          const cap = e.capacidad_max ?? 3
          const status = deriveStatus(p.ordenes_activas, cap, p.ordenes_alta_prioridad > 0)
          out.push({
            id: `assembly-${p.personal_id}`,
            col: ASSEMBLY_COL_X as 2,
            row: idx + 1,
            name: p.nombre_completo.split(' ')[0],
            kind: 'assembly',
            cap,
            status,
            ordenes_activas: p.ordenes_activas,
            workers: [{ ini: p.iniciales, name: p.nombre_completo }],
            itemActivo: p.item_activo ? {
              numero_orden: p.item_activo.numero_orden,
              hora_inicio:  p.item_activo.hora_inicio,
              pausa_activa: p.item_activo.pausa_activa,
            } : null,
            // Para carpinteros, el "ordenRunning" se construye desde item_activo si existe
            // (no tenemos fecha_entrega en item_activo, sólo numero_orden + proyecto_codigo)
            ordenRunning: p.item_activo ? {
              numero_orden:    p.item_activo.numero_orden,
              proyecto_nombre: null,
              proyecto_codigo: p.item_activo.proyecto_codigo,
              fecha_entrega:   null,
              prioridad:       'Media',
              state:           'running',
            } : null,
            href: `/produccion/ordenes?estacion=assembly&personal_id=${p.personal_id}`,
          })
        })
      } else if (e.posicion_x != null && e.posicion_y != null) {
        const cap = e.capacidad_max ?? 1
        const hasOverdue = (e.ordenes_alta_prioridad ?? 0) > 0
        const status = deriveStatus(e.ordenes_activas, cap, hasOverdue)
        // Buscar primer item_activo de cualquier operador en esa estación
        const personaTrabajando = e.personal.find((p) => p.item_activo)
        out.push({
          id: e.nombre,
          col: e.posicion_x as 1 | 2 | 3 | 4,
          row: e.posicion_y,
          name: prettyName(e.nombre),
          kind: estacionKind(e.nombre),
          cap,
          status,
          ordenes_activas: e.ordenes_activas,
          workers: e.personal.map((p) => ({ ini: p.iniciales, name: p.nombre_completo })),
          itemActivo: personaTrabajando?.item_activo ? {
            numero_orden: personaTrabajando.item_activo.numero_orden,
            hora_inicio:  personaTrabajando.item_activo.hora_inicio,
            pausa_activa: personaTrabajando.item_activo.pausa_activa,
          } : null,
          ordenRunning: e.orden_running,
          href: `/produccion/ordenes?estacion=${e.nombre}`,
        })
      }
    }
    return out
  }, [estaciones])

  // Agrupar por columnas
  const columnas = useMemo(() => {
    return [1, 2, 3, 4].map((c) =>
      cards.filter((card) => card.col === c).sort((a, b) => a.row - b.row)
    )
  }, [cards])

  const totalEstaciones = cards.length
  const totalOperadores = useMemo(() => {
    // Operadores únicos por estación (no double-counting cuando un carp aparece en assembly)
    const set = new Set<string>()
    estaciones.forEach((e) => e.personal.forEach((p) => set.add(p.iniciales)))
    return set.size
  }, [estaciones])

  if (isLoading) {
    return <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-gray-400" /></div>
  }

  return (
    <div className="space-y-5" style={{ fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* KPI Row — estilo handoff. 5 cards: la del medio es la OP que se está
          moviendo entre estaciones (no un contador, sino el identificador de
          la OP concreta). Para que el SHOP_MANAGER vea de un vistazo qué se
          está moviendo en el taller ahora mismo. */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <KpiCard label="Órdenes activas"  value={kpis?.activas         ?? '—'} />
        <KpiCardOpEnMovimiento op={kpis?.op_en_movimiento ?? null} />
        <KpiCard label="Completadas hoy"  value={kpis?.completadas_hoy ?? '—'} />
        <KpiCard label="Pausadas"         value={kpis?.pausadas        ?? '—'} muted />
        <KpiCard label="Vencidas"         value={kpis?.vencidas        ?? '—'} alert={(kpis?.vencidas ?? 0) > 0} />
      </div>

      {/* Blueprint Panel */}
      <div
        className="relative"
        style={{
          backgroundColor: BP.paper,
          border: `1px solid ${BP.line}`,
          borderRadius: 4,
          padding: '24px 28px',
          backgroundImage:
            `linear-gradient(${BP.line}55 1px, transparent 1px), ` +
            `linear-gradient(90deg, ${BP.line}55 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      >
        <CornerTicks />

        {/* Header del panel */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <div
              className="font-mono text-[10px] font-bold"
              style={{ color: BP.inkMuted, letterSpacing: 1.5 }}
            >
              PLANTA · NIVEL 1 · ESC 1:50
            </div>
            <h2 className="text-[22px] font-semibold mt-1" style={{ color: BP.ink, letterSpacing: -0.4 }}>
              Mapa del taller
            </h2>
          </div>
          <div className="flex items-center gap-[18px] font-mono text-[11px]">
            <span style={{ color: BP.inkMuted }}>FLUJO →</span>
            <Legend />
          </div>
        </div>

        {/* Body: 4 columnas + 3 flow arrows */}
        <div className="flex items-stretch gap-0">
          {columnas.map((col, i) => (
            <div key={i} className="contents">
              <div className="flex-1 min-w-0">
                <ZoneHeader idx={i + 1} code={ZONE_CODES[i]} label={ZONE_LABELS[i]} />
                <div className="flex flex-col gap-2.5">
                  {col.map((card) => <StationCard key={card.id} card={card} />)}
                </div>
              </div>
              {i < columnas.length - 1 && <FlowArrow />}
            </div>
          ))}
        </div>

        {/* Footer de dimensión */}
        <div
          className="mt-[18px] pt-3 flex justify-between font-mono text-[10px]"
          style={{ borderTop: `1px dashed ${BP.line}`, color: BP.inkMuted, letterSpacing: 1 }}
        >
          <span>← MATERIA PRIMA</span>
          <span>{totalEstaciones} ESTACIONES · {totalOperadores} OPERADORES</span>
          <span>PRODUCTO TERMINADO →</span>
        </div>
      </div>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({ label, value, alert, muted }: { label: string; value: number | string; alert?: boolean; muted?: boolean }) {
  return (
    <div
      className="bg-white"
      style={{
        border: '1px solid #ECE7DC',
        borderRadius: 10,
        padding: '18px 20px',
      }}
    >
      <div
        className="text-[11px] font-semibold uppercase"
        style={{ color: '#6B6356', letterSpacing: 0.6 }}
      >
        {label}
      </div>
      <div
        className="text-[32px] font-semibold mt-1.5"
        style={{
          color: alert ? '#B53A3A' : muted ? '#6B6356' : '#1F1B14',
          letterSpacing: -1,
        }}
      >
        {value}
      </div>
    </div>
  )
}

// ─── KpiCardOpEnMovimiento ───────────────────────────────────────────────────
//
// KPI especial: en vez de un contador muestra el identificador concreto de la
// OP que cambió de estación más recientemente. Clickeable → /produccion/ordenes/:id.
// Si no hay ninguna OP en proceso con movimientos, muestra un empty state discreto.
function KpiCardOpEnMovimiento({ op }: { op: OrdenesKpis['op_en_movimiento'] }) {
  const baseStyle = {
    border: '1px solid #ECE7DC',
    borderRadius: 10,
    padding: '18px 20px',
  }
  const labelStyle = { color: '#6B6356', letterSpacing: 0.6 }

  if (!op) {
    return (
      <div className="bg-white" style={baseStyle}>
        <div className="text-[11px] font-semibold uppercase" style={labelStyle}>
          OP en movimiento
        </div>
        <div className="text-[13.5px] mt-2.5" style={{ color: '#9C9384', fontStyle: 'italic' }}>
          Sin movimientos recientes
        </div>
      </div>
    )
  }

  // Tiempo desde el último movimiento — formato corto (m / h / d)
  const haceMin = Math.max(0, Math.floor((Date.now() - new Date(op.movido_en).getTime()) / 60000))
  const haceLabel = haceMin < 60
    ? `hace ${haceMin}m`
    : haceMin < 60 * 24
    ? `hace ${Math.floor(haceMin / 60)}h`
    : `hace ${Math.floor(haceMin / 1440)}d`

  return (
    <Link
      to={`/produccion/ordenes/${op.orden_id}`}
      className="bg-white block hover:shadow-sm transition-shadow"
      style={baseStyle}
      title={`Abrir ${op.numero_orden}`}
    >
      <div className="text-[11px] font-semibold uppercase" style={labelStyle}>
        OP en movimiento
      </div>
      <div
        className="text-[17px] font-semibold mt-1.5 font-mono truncate"
        style={{ color: '#1F1B14', letterSpacing: -0.3 }}
      >
        {op.proyecto_codigo ?? op.numero_orden}
      </div>
      <div className="text-[11.5px] mt-1 truncate" style={{ color: '#6B6356' }}>
        <span className="font-medium">#{op.numero_item}</span>
        {op.estacion_destino && (
          <span> · {op.estacion_origen ?? '—'} → <span className="font-medium" style={{ color: '#1F1B14' }}>{op.estacion_destino}</span></span>
        )}
      </div>
      <div className="text-[10.5px] mt-0.5" style={{ color: '#9C9384' }}>
        {op.numero_orden} · {haceLabel}
      </div>
    </Link>
  )
}

// ─── Zone Header ──────────────────────────────────────────────────────────────
function ZoneHeader({ idx, code, label }: { idx: number; code: string; label: string }) {
  return (
    <div className="mb-3">
      <div
        className="font-mono text-[9.5px] font-bold"
        style={{ color: BP.inkMuted, letterSpacing: 1.5 }}
      >
        ZONE {String(idx).padStart(2, '0')} · {code}
      </div>
      <div
        className="text-[14px] font-semibold mt-px"
        style={{ color: BP.ink, letterSpacing: -0.1 }}
      >
        {label}
      </div>
    </div>
  )
}

// ─── Flow Arrow entre columnas ────────────────────────────────────────────────
function FlowArrow() {
  return (
    <div
      className="flex items-center justify-center"
      style={{ flex: '0 0 28px' }}
    >
      <svg width="28" height="14" viewBox="0 0 28 14" style={{ opacity: 0.55 }}>
        <line x1="0" y1="7" x2="22" y2="7" stroke={BP.line} strokeWidth="1" strokeDasharray="2 3" />
        <path d="M22 3 28 7 22 11" fill="none" stroke={BP.line} strokeWidth="1" />
      </svg>
    </div>
  )
}

// ─── Corner Ticks (en panel y cards) ──────────────────────────────────────────
function CornerTicks({ size = 10, color = BP.line }: { size?: number; color?: string }) {
  const Tick = ({ style }: { style: React.CSSProperties }) => (
    <svg width={size} height={size} viewBox="0 0 10 10" style={style}>
      <path d={`M0 5h5V0`} stroke={color} strokeWidth="1" fill="none" />
    </svg>
  )
  return (
    <>
      <Tick style={{ position: 'absolute', top: -1, left: -1 }} />
      <Tick style={{ position: 'absolute', top: -1, right: -1, transform: 'scaleX(-1)' }} />
      <Tick style={{ position: 'absolute', bottom: -1, left: -1, transform: 'scaleY(-1)' }} />
      <Tick style={{ position: 'absolute', bottom: -1, right: -1, transform: 'scale(-1)' }} />
    </>
  )
}

// ─── Legend ───────────────────────────────────────────────────────────────────
function Legend() {
  const items = [
    { color: '#DCFCE7', label: 'Trabajando' },
    { color: '#FFEDD5', label: '1-2 días' },
    { color: '#FEF3C7', label: 'Vence hoy' },
    { color: '#FECACA', label: 'Vencida' },
    { color: '#DBEAFE', label: 'En pausa' },
  ]
  return (
    <div className="flex items-center gap-3 flex-wrap">
      {items.map((i) => (
        <div key={i.label} className="flex items-center gap-1.5">
          <span style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: i.color, border: '1px solid rgba(0,0,0,0.08)', display: 'inline-block' }} />
          <span className="text-[11px] font-medium" style={{ color: '#6B6356' }}>{i.label}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Station Card (V2Card del handoff) ────────────────────────────────────────
function StationCard({ card }: { card: CardData }) {
  const filled = card.ordenes_activas
  const pct = card.cap === 0 ? 0 : Math.min(1, filled / card.cap)
  const enPausa = !!card.itemActivo?.pausa_activa
  const trabajando = !!card.itemActivo && !enPausa  // hay segmento abierto y NO está en pausa
  const urgency = computeUrgency(card.ordenRunning?.fecha_entrega ?? null)
  const accent = enPausa
    ? '#1d4ed8'  // azul de pausa
    : urgency === 'overdue' ? BP.overdue
    : urgency === 'today'   ? BP.warn
    : trabajando            ? BP.active
    : card.status === 'active' ? BP.active
    : card.status === 'warn'    ? BP.warn
    : BP.idle

  // Fondo de la card según estado. Hace mucho más evidente cuándo se está
  // trabajando algo o cuándo una orden vence pronto:
  //  - en pausa  → azul muy claro
  //  - vencida   → rojo claro (gana sobre todo lo demás excepto pausa)
  //  - vence hoy → amarillo claro
  //  - vence en 1-2 días → naranja muy claro
  //  - trabajando ahora → verde claro
  //  - default → blanco translúcido del paper
  const cardBg = enPausa             ? '#DBEAFE'        // azul-100
              : urgency === 'overdue' ? '#FECACA'        // red-200
              : urgency === 'today'   ? '#FEF3C7'        // amber-100
              : urgency === 'soon'    ? '#FFEDD5'        // orange-100
              : trabajando            ? '#DCFCE7'        // green-100
                                      : 'rgba(255,255,255,0.55)'

  const kindTag = { machine: 'M', assembly: 'A', finishing: 'F', output: 'O' }[card.kind]
  const kindFull = { machine: 'MAQ', assembly: 'ENS', finishing: 'ACA', output: 'SAL' }[card.kind]
  const dueLabel = formatDue(card.ordenRunning?.fecha_entrega ?? null)
  const isOverdue = urgency === 'overdue'

  return (
    <Link
      to={card.href}
      className="relative block transition-all"
      style={{
        backgroundColor: cardBg,
        border: `1px solid ${BP.line}`,
        textDecoration: 'none',
        color: BP.ink,
      }}
      onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#A89E84')}
      onMouseLeave={(e) => (e.currentTarget.style.borderColor = BP.line)}
    >
      <CornerTicks />
      {/* Stripe de status — más ancha y vibrante para hacerla evidente */}
      <div
        style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: 5, backgroundColor: accent,
        }}
      />

      <div style={{ padding: '10px 12px 10px 16px' }}>
        {/* Línea 1: código + tag */}
        <div className="flex items-baseline justify-between">
          <div
            className="font-mono text-[9.5px] font-bold"
            style={{ color: BP.inkMuted, letterSpacing: 1.5 }}
          >
            {kindFull}-{card.col}.{String(card.row).padStart(2, '0')}
          </div>
          <div
            className="font-mono text-[10px]"
            style={{ color: BP.inkMuted, letterSpacing: 1 }}
          >
            {kindTag}
          </div>
        </div>

        {/* Línea 2: nombre estación */}
        <div
          className="text-[18px] font-semibold uppercase mt-0.5"
          style={{ color: BP.ink, letterSpacing: -0.3, lineHeight: 1.1 }}
        >
          {card.name}
        </div>

        {/* Bloque de orden running */}
        {card.ordenRunning ? (
          <div className="mt-2.5" style={{ lineHeight: 1.4 }}>
            <div className="font-mono text-[11px]" style={{ color: BP.inkMuted }}>
              ▸ {card.ordenRunning.numero_orden}
            </div>
            <div className="text-[11px] font-medium" style={{ color: BP.ink }}>
              {card.ordenRunning.proyecto_nombre || card.ordenRunning.proyecto_codigo || '—'}
            </div>
            {dueLabel && (
              <div
                className="font-mono text-[11px] mt-0.5"
                style={{ color: isOverdue ? BP.overdue : BP.inkMuted }}
              >
                due {dueLabel}
              </div>
            )}
            {/* Estado en vivo del operario: trabajando (● timer verde) o en pausa (⏸ azul) */}
            {card.itemActivo && card.itemActivo.pausa_activa ? (
              <div
                className="font-mono text-[11px] mt-0.5 font-semibold"
                style={{ color: '#1d4ed8' }}
                title={`Pausa desde ${new Date(card.itemActivo.pausa_activa.hora_inicio).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`}
              >
                ⏸ Pausa{card.itemActivo.pausa_activa.motivo ? `: ${card.itemActivo.pausa_activa.motivo.toLowerCase()}` : ''} · <Timer startISO={card.itemActivo.pausa_activa.hora_inicio} format="hm" className="inline tabular-nums" />
              </div>
            ) : card.itemActivo ? (
              <div
                className="font-mono text-[11px] mt-0.5 font-semibold"
                style={{ color: BP.active }}
              >
                ● <Timer startISO={card.itemActivo.hora_inicio} format="hm" className="inline tabular-nums" />
              </div>
            ) : null}
          </div>
        ) : (
          <div className="mt-2.5 text-[11px] italic" style={{ color: BP.inkSubtle }}>
            — vacante —
          </div>
        )}

        {/* Barra de capacidad */}
        <div className="mt-3">
          <div
            className="flex justify-between font-mono text-[9.5px] mb-1"
            style={{ color: BP.inkMuted, letterSpacing: 1 }}
          >
            <span>OCUPACIÓN</span>
            <span className="font-semibold" style={{ color: BP.ink }}>
              {filled}/{card.cap}
            </span>
          </div>
          <div
            className="relative"
            style={{ height: 6, backgroundColor: 'rgba(0,0,0,0.05)' }}
          >
            {/* Notches (líneas verticales entre slots) */}
            {Array.from({ length: card.cap - 1 }, (_, i) => (
              <div
                key={i}
                style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${((i + 1) / card.cap) * 100}%`,
                  width: 1, backgroundColor: BP.paper,
                }}
              />
            ))}
            {/* Fill */}
            <div
              style={{
                height: '100%',
                width: `${pct * 100}%`,
                backgroundColor: accent,
              }}
            />
          </div>
        </div>

        {/* Footer: avatares + cola */}
        <div className="mt-2.5 flex items-center justify-between">
          {card.workers.length > 0 ? (
            <AvatarStack workers={card.workers} />
          ) : (
            <span
              className="text-[10px] italic"
              style={{ color: BP.inkSubtle }}
            >
              sin operadores
            </span>
          )}
          {card.ordenes_activas > 1 && (
            <div
              className="font-mono text-[10px]"
              style={{ color: BP.inkMuted, letterSpacing: 0.5 }}
            >
              +{card.ordenes_activas - 1} EN COLA
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── Avatar Stack ─────────────────────────────────────────────────────────────
function AvatarStack({ workers, max = 4 }: { workers: { ini: string; name: string }[]; max?: number }) {
  const shown = workers.slice(0, max)
  const extra = workers.length - shown.length
  const size = 18
  return (
    <div className="inline-flex items-center">
      {shown.map((w, i) => (
        <div
          key={w.ini + i}
          style={{
            marginLeft: i === 0 ? 0 : -6,
            border: '2px solid #fff',
            borderRadius: '50%',
            display: 'inline-flex',
          }}
          title={w.name}
        >
          <div
            style={{
              width: size, height: size, borderRadius: '50%',
              backgroundColor: '#1F1B14', color: '#F2EAD8',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontSize: size * 0.42, fontWeight: 600,
            }}
          >
            {w.ini}
          </div>
        </div>
      ))}
      {extra > 0 && (
        <div
          style={{
            marginLeft: -6,
            width: size, height: size, borderRadius: '50%',
            backgroundColor: '#F1EEE6', color: '#6B6356',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: size * 0.38, fontWeight: 600,
            border: '2px solid #fff',
          }}
        >
          +{extra}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function prettyName(nombre: string): string {
  // 'edge_banding' → 'Edge Banding'
  return nombre.split('_').map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' ')
}

/** Categoría de urgencia según días al vencimiento. Tipos:
 *   - 'overdue': pasó la fecha (rojo)
 *   - 'today':   vence hoy (amarillo)
 *   - 'soon':    1-2 días (naranja)
 *   - 'normal':  3+ días o sin fecha
 */
function computeUrgency(fecha: string | null): 'overdue' | 'today' | 'soon' | 'normal' {
  if (!fecha) return 'normal'
  const d = new Date(fecha)
  const now = new Date()
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDias = Math.floor((target.getTime() - hoy.getTime()) / 86_400_000)
  if (diffDias < 0)  return 'overdue'
  if (diffDias === 0) return 'today'
  if (diffDias <= 2)  return 'soon'
  return 'normal'
}

function formatDue(fecha: string | null): string | null {
  if (!fecha) return null
  const d = new Date(fecha)
  const now = new Date()
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDias = Math.floor((target.getTime() - hoy.getTime()) / 86_400_000)

  if (diffDias < 0)  return 'Vencida'
  if (diffDias === 0) return 'Hoy'
  if (diffDias === 1) return 'Mañana'
  return d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
}
