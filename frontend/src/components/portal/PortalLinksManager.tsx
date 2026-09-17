import { useEffect, useState } from 'react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import { Share2, Copy, X, ExternalLink, Plus } from 'lucide-react'
import { scheduleService, type PortalTokenRow } from '@/services/schedule'

const fmt = (d: string | null) => {
  if (!d) return ''
  const [y, m, day] = d.split('-'); return `${day}/${m}/${y.slice(2)}`
}

// Gestión de links del portal para un proyecto: listar, generar (con destinatario
// + email), copiar, revocar, y ABRIR el portal en vivo (para probar la interacción
// real). Se usa en la Consola del portal. La misma capacidad existe en el Schedule.
export default function PortalLinksManager({ proyectoId }: { proyectoId: number }) {
  const [tokens, setTokens] = useState<PortalTokenRow[]>([])
  const [nombre, setNombre] = useState('')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [nuevo, setNuevo] = useState<string | null>(null)   // link recién generado, para copiar

  async function load() {
    try { setTokens((await scheduleService.listPortalTokens(proyectoId)).data ?? []) } catch { /* silencioso */ }
  }
  useEffect(() => { setTokens([]); setNombre(''); setEmail(''); setNuevo(null); load() }, [proyectoId])

  async function generar() {
    setBusy(true)
    try {
      const r = await scheduleService.crearPortalToken(proyectoId, nombre.trim() || undefined, email.trim() || undefined)
      const url = `${window.location.origin}/portal/${r.data.token}`
      setNuevo(url)
      navigator.clipboard?.writeText(url).then(() => toast.success('Link generado y copiado'), () => toast.success('Link generado'))
      setNombre(''); setEmail(''); await load()
    } catch { /* toast */ } finally { setBusy(false) }
  }
  async function revocar(id: number) {
    if (!window.confirm('¿Revocar este link? El cliente deja de poder acceder de inmediato.')) return
    try { await scheduleService.revocarPortalToken(proyectoId, id); toast.success('Link revocado'); await load() }
    catch { /* toast */ }
  }
  const urlDe = (t: string) => `${window.location.origin}/portal/${t}`

  return (
    <div className="rounded-2xl border border-card-border bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-card-border flex items-center gap-2">
        <Share2 size={16} className="text-forest-600" />
        <h3 className="font-semibold text-stone-800 text-[15px]">Links del portal</h3>
      </div>

      {tokens.length > 0 && (
        <div className="divide-y divide-stone-100">
          {tokens.map((t) => {
            const estado = !t.activo ? 'revocado' : t.vencido ? 'vencido' : 'activo'
            const badge = estado === 'activo' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : estado === 'vencido' ? 'bg-rose-50 text-rose-700 border-rose-200'
              : 'bg-stone-100 text-stone-500 border-stone-200'
            const venceTxt = t.expires_at == null ? 'sin vencimiento'
              : t.vencido ? `vencido el ${fmt(t.expires_at)}` : `vence en ${t.dias_para_vencer}d`
            return (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-stone-800 truncate">{t.contacto_nombre || t.contacto_email || 'Contacto sin nombre'}</span>
                  <span className={clsx('text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border', badge)}>{estado}</span>
                </div>
                <div className="text-[11px] text-stone-400 mt-0.5">
                  {t.contacto_email && <span>{t.contacto_email} · </span>}
                  generado {fmt(t.created_at)} · {t.last_access_at ? 'abierto por el cliente' : 'sin abrir aún'} · {venceTxt}
                </div>
                {t.activo && !t.vencido && (
                  <div className="flex items-center gap-3 mt-2">
                    <button onClick={() => window.open(urlDe(t.token), '_blank', 'noopener')}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-forest-700 hover:text-forest-900"><ExternalLink size={13} /> Abrir portal en vivo</button>
                    <button onClick={() => { navigator.clipboard?.writeText(urlDe(t.token)); toast.success('Link copiado') }}
                            className="inline-flex items-center gap-1 text-xs font-medium text-stone-600 hover:text-stone-900"><Copy size={13} /> Copiar link</button>
                    <button onClick={() => revocar(t.id)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"><X size={13} /> Revocar</button>
                  </div>
                )}
                {t.activo && t.vencido && (
                  <div className="mt-2"><button onClick={() => revocar(t.id)} className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700"><X size={13} /> Revocar</button></div>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="px-4 py-3 border-t border-card-border bg-app-bg/40">
        <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Generar un link de prueba</div>
        <div className="grid sm:grid-cols-2 gap-2">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Destinatario (opcional)" className="input w-full" />
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (opcional)" className="input w-full" />
        </div>
        <div className="mt-2 flex justify-end">
          <button onClick={generar} disabled={busy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 disabled:opacity-50 text-white text-sm font-semibold px-3.5 py-2">
            <Plus size={15} /> Generar link
          </button>
        </div>
        {nuevo && (
          <div className="mt-3 rounded-xl border border-forest-200 bg-forest-50/60 p-2.5">
            <div className="text-[11px] font-semibold text-forest-700 mb-1.5">Link listo (ya copiado):</div>
            <div className="flex gap-2 items-center">
              <input readOnly value={nuevo} onFocus={(e) => e.target.select()} className="input w-full text-xs bg-white" />
              <button onClick={() => { navigator.clipboard?.writeText(nuevo); toast.success('Copiado') }}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-xs font-semibold px-2.5 py-2"><Copy size={13} /> Copiar</button>
              <button onClick={() => window.open(nuevo, '_blank', 'noopener')}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-forest-300 text-forest-700 hover:bg-forest-50 text-xs font-semibold px-2.5 py-2"><ExternalLink size={13} /> Abrir</button>
            </div>
          </div>
        )}
        <p className="mt-1.5 text-[11px] text-stone-400">"Abrir portal en vivo" abre el portal real (con las acciones habilitadas) para que pruebes aprobar/rechazar como el cliente.</p>
      </div>
    </div>
  )
}
