import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Hammer, Play, Loader2, ClipboardCheck, Download, ListChecks, X } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type InstalacionPM } from '@/services/ingenieria'
import api from '@/services/api'

interface PunchItem {
  id: number; descripcion: string; area: string | null; estado: string
  foto_problema_url: string | null; foto_resuelto_url: string | null; nota_resuelto: string | null; created_at: string
}

// Modal con el detalle de la punch list de un proyecto (para verla en la web).
function PunchModal({ proyectoId, codigo, onClose }: { proyectoId: number; codigo: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['punch', proyectoId],
    queryFn: () => api.get(`/schedule/proyecto/${proyectoId}/punch`).then((r) => r.data.data as PunchItem[]),
  })
  const items = data ?? []
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-fuchsia-50/50">
          <ListChecks size={16} className="text-fuchsia-700" />
          <h3 className="font-bold text-stone-800">Punch list · <span className="font-mono text-fuchsia-700">{codigo}</span></h3>
          <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-700 p-1 rounded-md hover:bg-stone-100"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-4 space-y-2.5">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="animate-spin text-fuchsia-600" /></div>
          ) : items.length === 0 ? (
            <p className="text-sm text-stone-500 text-center py-8">Sin pendientes cargados.</p>
          ) : items.map((it) => (
            <div key={it.id} className={`rounded-xl border p-3 ${it.estado === 'resuelto' ? 'border-emerald-200 bg-emerald-50/40' : 'border-rose-200 bg-rose-50/40'}`}>
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-stone-800">{it.descripcion}</div>
                  {it.area && <div className="text-[11px] text-stone-500 mt-0.5">{it.area}</div>}
                  {it.nota_resuelto && <div className="text-[11px] text-emerald-700 italic mt-0.5">Resuelto: {it.nota_resuelto}</div>}
                </div>
                <span className={`shrink-0 text-[10px] font-bold uppercase rounded-full px-2 py-0.5 ${it.estado === 'resuelto' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>{it.estado}</span>
              </div>
              {(it.foto_problema_url || it.foto_resuelto_url) && (
                <div className="flex gap-2 mt-2">
                  {it.foto_problema_url && <a href={it.foto_problema_url} target="_blank" rel="noopener noreferrer"><img src={it.foto_problema_url} className="w-16 h-16 object-cover rounded-lg border border-stone-200" alt="Problema" /></a>}
                  {it.foto_resuelto_url && <a href={it.foto_resuelto_url} target="_blank" rel="noopener noreferrer"><img src={it.foto_resuelto_url} className="w-16 h-16 object-cover rounded-lg border border-emerald-200" alt="Resuelto" /></a>}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Descarga la punch list del proyecto como CSV (para trabajar/imprimir).
async function exportarPunch(proyectoId: number, codigo: string) {
  try {
    const res = await api.get(`/schedule/proyecto/${proyectoId}/punch/export`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data as Blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `punch-${codigo || proyectoId}.csv`
    document.body.appendChild(a); a.click(); a.remove()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('No se pudo exportar la punch list')
  }
}

// Bandeja del PM — Instalaciones (handoff de 3 etapas, Chali 2026-09-08).
//  · etapa 'iniciar'   → el PM arranca la instalación → pasa a Campo (verificación en móvil).
//  · etapa 'completar' → Campo verificó (ítems + punch + firma del cliente) → el PM cierra.
// Se oculta si no hay nada.

export default function InstalacionesPM() {
  const qc = useQueryClient()
  const [verPunch, setVerPunch] = useState<{ proyectoId: number; codigo: string } | null>(null)
  const { data } = useQuery({
    queryKey: ['instalaciones-pm'],
    queryFn: () => ingenieriaService.instalacionesPM(),
    refetchInterval: 20_000,
    refetchOnMount: 'always',
    staleTime: 0,
  })
  const items: InstalacionPM[] = data?.data ?? []

  const iniciar = useMutation({
    mutationFn: (t: InstalacionPM) => ingenieriaService.avanceTarea(t.tarea_id, { estado: 'en_curso' }),
    onSuccess: () => { toast.success('Instalación iniciada → pasa a Campo para verificar'); invalidar() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo iniciar'),
  })
  const completar = useMutation({
    mutationFn: (t: InstalacionPM) => ingenieriaService.avanceTarea(t.tarea_id, { estado: 'hecha', fecha_fin_real: new Date().toISOString().slice(0, 10) }),
    onSuccess: () => { toast.success('Instalación completada ✓'); invalidar() },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'No se pudo completar'),
  })
  function invalidar() {
    qc.invalidateQueries({ queryKey: ['instalaciones-pm'] })
    qc.invalidateQueries({ queryKey: ['escritorio'] }); qc.invalidateQueries({ queryKey: ['escritorio-resumen'] })
  }

  if (!items.length) return null
  return (
    <>
    <div className="rounded-2xl border border-fuchsia-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-stone-100 bg-fuchsia-50/50">
        <Hammer size={16} className="text-fuchsia-700" />
        <h2 className="font-bold text-stone-800">Instalaciones</h2>
        <span className="text-xs text-stone-400 hidden sm:inline">iniciá la instalación o cerrala cuando Campo verificó</span>
        <span className="ml-auto text-[11px] font-bold rounded-full bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5">{items.length}</span>
      </div>
      <div className="divide-y divide-stone-100">
        {items.map((t) => (
          <div key={t.tarea_id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                {t.proyecto_ext && <span className="font-mono text-[12px] font-bold text-fuchsia-700">{t.proyecto_ext}</span>}
                {t.proyecto_nombre && <span className="text-sm text-stone-600 truncate">{t.proyecto_nombre}</span>}
              </div>
              <div className="text-[11px] text-stone-400 mt-0.5">
                {t.etapa === 'iniciar'
                  ? 'Listo para iniciar — al arrancar pasa a Campo para la verificación'
                  : t.etapa === 'en_obra'
                  ? <>Campo trabajando: {t.items_instalados}/{t.items_total} ítems · punch {t.punch_abiertos === 0 ? 'cerrado' : `${t.punch_abiertos} abierto(s)`} · sin firmar aún</>
                  : <>Campo verificó: {t.items_instalados}/{t.items_total} ítems · punch {t.punch_abiertos === 0 ? 'cerrado' : `${t.punch_abiertos} abierto(s)`} {t.firmada && '· firma ✓'}</>}
              </div>
            </div>
            {t.etapa === 'iniciar' ? (
              <button onClick={() => iniciar.mutate(t)} disabled={iniciar.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 shrink-0">
                {iniciar.isPending ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} Iniciar instalación
              </button>
            ) : (
              <div className="flex items-center gap-2 shrink-0">
                {t.proyecto_id != null && (
                  <button onClick={() => setVerPunch({ proyectoId: t.proyecto_id!, codigo: t.proyecto_ext ?? '' })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-600 text-xs font-semibold px-3 py-1.5"
                    title="Ver la punch list">
                    <ListChecks size={14} /> Ver punch
                  </button>
                )}
                {t.proyecto_id != null && (
                  <button onClick={() => exportarPunch(t.proyecto_id!, t.proyecto_ext ?? '')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-stone-300 hover:bg-stone-50 text-stone-600 text-xs font-semibold px-3 py-1.5"
                    title="Descargar la punch list en CSV">
                    <Download size={14} /> CSV
                  </button>
                )}
                {t.etapa === 'completar' && (
                  <button onClick={() => completar.mutate(t)} disabled={completar.isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5">
                    {completar.isPending ? <Loader2 className="animate-spin" size={14} /> : <ClipboardCheck size={14} />} Completar instalación
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
    {verPunch && <PunchModal proyectoId={verPunch.proyectoId} codigo={verPunch.codigo} onClose={() => setVerPunch(null)} />}
    </>
  )
}
