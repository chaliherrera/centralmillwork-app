import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Camera, Eye, EyeOff, Trash2, Loader2, X, ChevronLeft, ChevronRight,
  Image as ImageIcon, Filter,
} from 'lucide-react'
import toast from 'react-hot-toast'
import clsx from 'clsx'
import { produccionService } from '@/services/produccion'
import { useAuth } from '@/context/AuthContext'
import type { AvanceFoto } from '@/types/produccion'

/**
 * Sección "Fotos de avance" del detalle de orden de producción.
 *
 * Muestra todas las fotos subidas desde el kiosko por los operarios como
 * evidencia de avance, agrupadas por estación. Funcionalidades:
 *   - Click en miniatura → lightbox con navegación
 *   - Filtros: solo visibles para cliente / por estación
 *   - Toggle visible_cliente por foto (solo ADMIN/SHOP_MANAGER)
 *   - Borrar foto (solo ADMIN/SHOP_MANAGER, con confirm)
 *
 * Visible para todos los roles que ven el detalle de orden. La columna
 * `visible_cliente` queda en true por default — si se decide armar un
 * portal cliente, esa columna ya filtra.
 */
interface Props {
  ordenId: number
}

const COLOR_ESTACION: Record<string, string> = {
  cnc:          'bg-purple-100 text-purple-800 border-purple-200',
  edge_banding: 'bg-blue-100   text-blue-800   border-blue-200',
  assembly:     'bg-amber-100  text-amber-800  border-amber-200',
  lamina:       'bg-emerald-100 text-emerald-800 border-emerald-200',
  pintura:      'bg-pink-100   text-pink-800   border-pink-200',
  final:        'bg-indigo-100 text-indigo-800 border-indigo-200',
  registro:     'bg-gray-200   text-gray-800   border-gray-300',
  shipping:     'bg-orange-100 text-orange-800 border-orange-200',
}

export default function FotosAvanceSection({ ordenId }: Props) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const puedeEditar = user?.rol === 'ADMIN' || user?.rol === 'SHOP_MANAGER'

  const [soloVisibles, setSoloVisibles] = useState(false)
  const [estacionFiltro, setEstacionFiltro] = useState<string | null>(null)
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)

  const { data: fotos = [], isLoading } = useQuery({
    queryKey: ['orden-avance-fotos', ordenId, soloVisibles],
    queryFn:  () => produccionService.avanceFotos(ordenId, {
      visible_cliente: soloVisibles || undefined,
    }),
    // Refresca solo si el operario sube nuevas mientras vemos esta pantalla
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  })

  // Filtrar por estación seleccionada (si hay)
  const fotosFiltradas = useMemo(() => {
    if (!estacionFiltro) return fotos
    return fotos.filter((f) => f.estacion === estacionFiltro)
  }, [fotos, estacionFiltro])

  // Agrupar por estación para mostrar headers + grids separados
  const grupos = useMemo(() => {
    const m = new Map<string, AvanceFoto[]>()
    for (const f of fotosFiltradas) {
      const k = f.estacion ?? '__sin_estacion__'
      const arr = m.get(k) ?? []
      arr.push(f)
      m.set(k, arr)
    }
    return Array.from(m.entries())
  }, [fotosFiltradas])

  // Estaciones disponibles para el filtro
  const estacionesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const f of fotos) if (f.estacion) set.add(f.estacion)
    return Array.from(set).sort()
  }, [fotos])

  const toggleVisible = useMutation({
    mutationFn: ({ fotoId, visible }: { fotoId: number; visible: boolean }) =>
      produccionService.patchAvanceFoto(fotoId, { visible_cliente: visible }),
    onSuccess: () => {
      toast.success('Visibilidad actualizada')
      qc.invalidateQueries({ queryKey: ['orden-avance-fotos', ordenId] })
    },
    onError: () => toast.error('No se pudo actualizar'),
  })

  const borrar = useMutation({
    mutationFn: (fotoId: number) => produccionService.borrarAvanceFoto(fotoId),
    onSuccess: () => {
      toast.success('Foto eliminada')
      qc.invalidateQueries({ queryKey: ['orden-avance-fotos', ordenId] })
      setLightboxIdx(null)
    },
    onError: () => toast.error('No se pudo eliminar'),
  })

  // Render
  if (isLoading) {
    return (
      <div className="card">
        <h3 className="flex items-center gap-2"><Camera size={16} /> Fotos de avance</h3>
        <div className="py-8 flex justify-center">
          <Loader2 size={20} className="animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  if (fotos.length === 0) {
    return (
      <div className="card">
        <h3 className="flex items-center gap-2"><Camera size={16} /> Fotos de avance</h3>
        <div className="py-8 text-center">
          <ImageIcon size={36} className="mx-auto text-gray-300 mb-2" />
          <p className="text-sm text-gray-500">
            Todavía no se subieron fotos para esta orden.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Los operarios suben fotos desde el kiosko cuando completan cada estación.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="flex items-center gap-2">
          <Camera size={16} />
          Fotos de avance
          <span className="text-xs font-normal text-gray-500">
            ({fotosFiltradas.length}{estacionFiltro || soloVisibles ? ` de ${fotos.length}` : ''})
          </span>
        </h3>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={soloVisibles}
              onChange={(e) => setSoloVisibles(e.target.checked)}
              className="w-3.5 h-3.5"
            />
            Solo visibles para cliente
          </label>

          {estacionesDisponibles.length > 1 && (
            <select
              value={estacionFiltro ?? ''}
              onChange={(e) => setEstacionFiltro(e.target.value || null)}
              className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
            >
              <option value="">Todas las estaciones</option>
              {estacionesDisponibles.map((est) => (
                <option key={est} value={est}>{est.replace('_', ' ').toUpperCase()}</option>
              ))}
            </select>
          )}

          {(soloVisibles || estacionFiltro) && (
            <button
              onClick={() => { setSoloVisibles(false); setEstacionFiltro(null) }}
              className="text-xs text-gray-500 hover:text-forest-700 underline"
            >
              Limpiar
            </button>
          )}
        </div>
      </div>

      {fotosFiltradas.length === 0 ? (
        <div className="py-6 text-center">
          <Filter size={20} className="mx-auto text-gray-300 mb-1" />
          <p className="text-xs text-gray-500">Sin fotos con esos filtros</p>
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(([estacion, fotosGrupo]) => (
            <div key={estacion}>
              <div className="flex items-center gap-2 mb-2">
                <span className={clsx(
                  'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border uppercase tracking-wider',
                  COLOR_ESTACION[estacion] || 'bg-gray-100 text-gray-700 border-gray-200'
                )}>
                  {estacion === '__sin_estacion__' ? 'Sin estación' : estacion.replace('_', ' ')}
                </span>
                <span className="text-xs text-gray-500">
                  {fotosGrupo.length} {fotosGrupo.length === 1 ? 'foto' : 'fotos'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {fotosGrupo.map((foto) => {
                  const idxGlobal = fotosFiltradas.findIndex((f) => f.id === foto.id)
                  return (
                    <FotoThumb
                      key={foto.id}
                      foto={foto}
                      onClick={() => setLightboxIdx(idxGlobal)}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {lightboxIdx !== null && fotosFiltradas[lightboxIdx] && (
        <Lightbox
          fotos={fotosFiltradas}
          idx={lightboxIdx}
          setIdx={setLightboxIdx}
          puedeEditar={puedeEditar}
          onToggleVisible={(fotoId, visible) => toggleVisible.mutate({ fotoId, visible })}
          onBorrar={(fotoId) => {
            if (window.confirm('¿Borrar esta foto? No se puede deshacer.')) {
              borrar.mutate(fotoId)
            }
          }}
          isPending={toggleVisible.isPending || borrar.isPending}
        />
      )}
    </div>
  )
}

// ─── Thumbnail ────────────────────────────────────────────────────────────────
function FotoThumb({ foto, onClick }: { foto: AvanceFoto; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="relative aspect-square rounded-lg overflow-hidden bg-gray-100 border border-gray-200 hover:border-forest-500 transition-colors group"
    >
      {foto.url ? (
        <img
          src={foto.url}
          alt={`Foto ${foto.id}`}
          loading="lazy"
          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-400">
          <ImageIcon size={20} />
        </div>
      )}
      {/* Badge invisible si está oculta para cliente */}
      {!foto.visible_cliente && (
        <span
          title="Oculta para cliente"
          className="absolute top-1 left-1 bg-black/70 text-white p-0.5 rounded"
        >
          <EyeOff size={10} />
        </span>
      )}
      {/* Operario (iniciales) en la esquina inferior */}
      {foto.personal_iniciales && (
        <span className="absolute bottom-1 right-1 bg-black/60 text-white text-[9px] font-bold px-1 py-0.5 rounded">
          {foto.personal_iniciales}
        </span>
      )}
    </button>
  )
}

// ─── Lightbox ─────────────────────────────────────────────────────────────────
interface LightboxProps {
  fotos: AvanceFoto[]
  idx: number
  setIdx: (idx: number | null) => void
  puedeEditar: boolean
  onToggleVisible: (fotoId: number, visible: boolean) => void
  onBorrar: (fotoId: number) => void
  isPending: boolean
}

function Lightbox({ fotos, idx, setIdx, puedeEditar, onToggleVisible, onBorrar, isPending }: LightboxProps) {
  const foto = fotos[idx]
  if (!foto) return null

  const prev = () => setIdx(idx > 0 ? idx - 1 : fotos.length - 1)
  const next = () => setIdx(idx < fotos.length - 1 ? idx + 1 : 0)

  return (
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
      onClick={() => setIdx(null)}
    >
      {/* Close */}
      <button
        onClick={() => setIdx(null)}
        className="absolute top-4 right-4 p-2 bg-black/50 hover:bg-black/70 text-white rounded-full"
        aria-label="Cerrar"
      >
        <X size={20} />
      </button>

      {/* Prev / Next */}
      {fotos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); prev() }}
            className="absolute left-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full"
            aria-label="Anterior"
          >
            <ChevronLeft size={20} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); next() }}
            className="absolute right-4 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/70 text-white rounded-full"
            aria-label="Siguiente"
          >
            <ChevronRight size={20} />
          </button>
        </>
      )}

      {/* Imagen + panel info */}
      <div
        className="flex flex-col md:flex-row gap-4 max-w-6xl w-full max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex-1 flex items-center justify-center min-h-0">
          {foto.url ? (
            <img
              src={foto.url}
              alt={`Foto ${foto.id}`}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
            />
          ) : (
            <div className="text-white">Sin imagen disponible</div>
          )}
        </div>

        {/* Info panel */}
        <div className="md:w-72 bg-white rounded-xl p-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Estación</div>
            <div className="font-semibold text-forest-700">
              {foto.estacion?.replace('_', ' ').toUpperCase() ?? 'Sin estación'}
            </div>
          </div>

          {(foto.personal_nombre || foto.usuario_nombre) && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Subida por</div>
              <div className="text-gray-700">{foto.personal_nombre || foto.usuario_nombre}</div>
            </div>
          )}

          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Fecha</div>
            <div className="text-gray-700">
              {new Date(foto.created_at).toLocaleString('es-MX', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
              })}
            </div>
          </div>

          {foto.comentario && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-0.5">Comentario</div>
              <div className="text-gray-700 whitespace-pre-wrap">{foto.comentario}</div>
            </div>
          )}

          <div className="pt-3 border-t border-gray-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500">Visible para cliente</span>
              <button
                onClick={() => puedeEditar && onToggleVisible(foto.id, !foto.visible_cliente)}
                disabled={!puedeEditar || isPending}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold transition-colors',
                  foto.visible_cliente
                    ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                  (!puedeEditar || isPending) && 'opacity-50 cursor-not-allowed'
                )}
                title={puedeEditar ? 'Click para cambiar' : 'Solo ADMIN/SHOP_MANAGER puede modificar'}
              >
                {foto.visible_cliente ? <Eye size={12} /> : <EyeOff size={12} />}
                {foto.visible_cliente ? 'Sí' : 'No'}
              </button>
            </div>

            {puedeEditar && (
              <button
                onClick={() => onBorrar(foto.id)}
                disabled={isPending}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-red-200 text-red-700 hover:bg-red-50 text-xs font-semibold disabled:opacity-50"
              >
                {isPending ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Borrar foto
              </button>
            )}
          </div>

          {/* Contador */}
          <div className="text-center text-xs text-gray-400 pt-2 border-t border-gray-100">
            {idx + 1} de {fotos.length}
          </div>
        </div>
      </div>
    </div>
  )
}
