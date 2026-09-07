import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Hammer, Play, Loader2, ClipboardCheck } from 'lucide-react'
import toast from 'react-hot-toast'
import { ingenieriaService, type InstalacionPM } from '@/services/ingenieria'

// Bandeja del PM — Instalaciones (handoff de 3 etapas, Chali 2026-09-08).
//  · etapa 'iniciar'   → el PM arranca la instalación → pasa a Campo (verificación en móvil).
//  · etapa 'completar' → Campo verificó (ítems + punch + firma del cliente) → el PM cierra.
// Se oculta si no hay nada.

export default function InstalacionesPM() {
  const qc = useQueryClient()
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
                  : <>Campo verificó: {t.items_instalados}/{t.items_total} ítems · punch {t.punch_abiertos === 0 ? 'cerrado' : `${t.punch_abiertos} abierto(s)`} {t.firmada && '· firma ✓'}</>}
              </div>
            </div>
            {t.etapa === 'iniciar' ? (
              <button onClick={() => iniciar.mutate(t)} disabled={iniciar.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 shrink-0">
                {iniciar.isPending ? <Loader2 className="animate-spin" size={14} /> : <Play size={14} />} Iniciar instalación
              </button>
            ) : (
              <button onClick={() => completar.mutate(t)} disabled={completar.isPending}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold px-3 py-1.5 shrink-0">
                {completar.isPending ? <Loader2 className="animate-spin" size={14} /> : <ClipboardCheck size={14} />} Completar instalación
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
