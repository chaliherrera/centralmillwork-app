import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderPlus, CheckCircle2, ArrowRight, CalendarClock, Hammer, Send } from 'lucide-react'
import ProyectoForm from '@/components/modules/proyectos/ProyectoForm'
import type { Proyecto } from '@/types'

// ─────────────────────────────────────────────────────────────────────────────
// Alta de Estimados — proceso simplificado (Fase 2).
// Estimados hace UNA sola cosa acá: crear el take-off con la fecha que pide el
// cliente. Al crearlo, el proyecto se manda solo al Scheduler, que arma el plan
// y se lo devuelve (aparece en la Bandeja de Estimados para mandárselo al cliente).
// La factibilidad y el armado del plan ya NO son de Estimados (son del Scheduler).
// La firma del contrato se registra después, como tarea del escritorio de Estimados
// (cuando el cliente aprueba el cronograma).
// ─────────────────────────────────────────────────────────────────────────────

const MES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const fmt = (iso?: string | null) => { if (!iso) return null; const d = new Date(iso.slice(0, 10) + 'T00:00:00'); return `${d.getDate()} ${MES[d.getMonth()]} ${d.getFullYear()}` }

export default function EstimadosWizard() {
  const [formOpen, setFormOpen] = useState(false)
  const [creado, setCreado] = useState<Proyecto | null>(null)

  // ── Pantalla de confirmación: el take-off quedó enviado al Scheduler ──
  if (creado) {
    const fecha = fmt(creado.fecha_entrega_solicitada)
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-8 text-center">
        <CheckCircle2 size={44} className="text-emerald-600 mx-auto" />
        <h2 className="mt-3 text-xl font-bold text-stone-900">Take-off enviado al Scheduler</h2>
        <p className="mt-1 text-stone-600">
          <b className="font-mono text-forest-700">{creado.codigo}</b> · {creado.nombre}
          {fecha ? <> — fecha pedida por el cliente: <b>{fecha}</b>.</> : <> — <span className="text-amber-700">sin fecha solicitada (cargala para que el Scheduler pueda armar el plan).</span></>}
        </p>
        <p className="mt-2 text-sm text-forest-700">El Scheduler arma el plan y te lo devuelve a tu <b>Bandeja</b> para que se lo mandes al cliente.</p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <button onClick={() => setCreado(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-4 py-2">
            <FolderPlus size={15} /> Crear otro take-off
          </button>
          <Link to={`/proyectos/${creado.id}`} className="text-sm text-stone-500 hover:text-stone-800 px-3 py-2 inline-flex items-center gap-1">
            Ver el proyecto <ArrowRight size={15} />
          </Link>
        </div>
      </div>
    )
  }

  // ── Pantalla inicial: crear el take-off ──
  return (
    <div className="rounded-2xl border border-stone-200 bg-white overflow-hidden">
      <div className="p-6">
        <h3 className="font-bold text-stone-800 text-lg">Nuevo take-off</h3>
        <p className="text-sm text-stone-500 mt-1 max-w-xl">
          Cargá la hoja de intake con los datos del deal y la <b>fecha que pide el cliente</b>.
          Al crearlo, el proyecto se manda solo al Scheduler.
        </p>

        {/* Qué pasa después (3 pasos, en lenguaje natural) */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <Paso icon={<FolderPlus size={16} />} n={1} t="Creás el take-off" d="Con la fecha que pide el cliente." activo />
          <Paso icon={<Hammer size={16} />} n={2} t="El Scheduler arma el plan" d="Ve la carga real y te lo devuelve." />
          <Paso icon={<Send size={16} />} n={3} t="Se lo mandás al cliente" d="Aparece en tu Bandeja cuando está listo." />
        </div>

        <button onClick={() => setFormOpen(true)}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-semibold px-5 py-2.5">
          <FolderPlus size={16} /> Crear take-off
        </button>

        <div className="mt-4 flex items-start gap-2 text-[12px] text-stone-500">
          <CalendarClock size={14} className="shrink-0 mt-0.5 text-forest-600" />
          <span>La firma del contrato se registra más adelante, como tarea de tu escritorio, cuando el cliente aprueba el cronograma.</span>
        </div>
      </div>

      <ProyectoForm open={formOpen} onClose={() => setFormOpen(false)} hideDates intake
        onCreated={(p) => { setFormOpen(false); setCreado(p) }} />
    </div>
  )
}

function Paso({ icon, n, t, d, activo }: { icon: React.ReactNode; n: number; t: string; d: string; activo?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${activo ? 'border-forest-200 bg-forest-50/50' : 'border-stone-200 bg-stone-50/50'}`}>
      <div className="flex items-center gap-2">
        <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${activo ? 'bg-forest-600 text-white' : 'bg-stone-200 text-stone-500'}`}>{icon}</div>
        <span className="text-[11px] uppercase tracking-wide text-stone-400 font-semibold">Paso {n}</span>
      </div>
      <div className="mt-2 text-sm font-semibold text-stone-800">{t}</div>
      <div className="text-xs text-stone-500">{d}</div>
    </div>
  )
}
