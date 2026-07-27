// PlanosItemCard — Card para el shop manager en CrearOrden (2026-07-17).
// Muestra los planos PDF ya subidos para (proyecto, numero_item) y permite
// subir nuevos. Los planos son compartidos entre todas las OPs del mismo
// ítem — se cargan una vez y quedan disponibles para futuras OPs.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { FileText, Upload, ExternalLink, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { planosService } from '@/services/planos'

interface Props {
  proyectoId: number | null
  numeroItem: string
}

const fmtSize = (bytes: number | null): string => {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const fmtDate = (s: string | null | undefined): string => {
  if (!s) return '—'
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function PlanosItemCard({ proyectoId, numeroItem }: Props) {
  const qc = useQueryClient()
  const [uploading, setUploading] = useState(false)

  // Contexto habilitado solo si tenemos ambos datos
  const enabled = !!proyectoId && numeroItem.trim().length > 0

  const { data: planos = [], isLoading, error } = useQuery({
    queryKey: ['planos-item', proyectoId, numeroItem.trim()],
    queryFn: () => planosService.list(proyectoId!, numeroItem.trim()),
    enabled,
  })

  const uploadMut = useMutation({
    mutationFn: (file: File) => planosService.upload(proyectoId!, numeroItem.trim(), file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['planos-item', proyectoId, numeroItem.trim()] })
      toast.success('Plano subido')
    },
    onError: (err: any) => {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err?.message || 'Error'
      toast.error(`No se pudo subir: ${detail}`)
    },
    onSettled: () => setUploading(false),
  })

  const handleFile = (file: File) => {
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Solo se aceptan archivos PDF')
      return
    }
    if (file.size > 25 * 1024 * 1024) {
      toast.error('El archivo excede 25 MB')
      return
    }
    setUploading(true)
    uploadMut.mutate(file)
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={16} className="text-forest-700" />
        <h3 className="text-sm font-semibold text-forest-900">Planos del ítem</h3>
      </div>

      {!enabled && (
        <p className="text-xs text-gray-500 italic">
          Elegí un proyecto e ingresá el número de ítem para ver o cargar planos.
        </p>
      )}

      {enabled && isLoading && (
        <div className="flex items-center gap-2 text-xs text-gray-500 py-2">
          <Loader2 size={14} className="animate-spin" /> Cargando planos…
        </div>
      )}

      {enabled && error && (
        <div className="flex items-start gap-2 text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
          <span>No se pudieron cargar los planos.</span>
        </div>
      )}

      {enabled && !isLoading && !error && planos.length === 0 && (
        <div className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded p-3 text-center">
          Sin planos cargados para este ítem.<br />
          <span className="text-gray-400">Subí un PDF para que quede disponible en toda OP futura del ítem.</span>
        </div>
      )}

      {enabled && !isLoading && planos.length > 0 && (
        <ul className="space-y-1.5">
          {planos.map((p) => (
            <li key={p.id} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-md p-2 text-xs">
              <FileText size={14} className="text-red-600 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-gray-800 truncate" title={p.original_name}>
                  {p.original_name}
                </div>
                <div className="text-gray-500 text-[10px]">
                  {fmtDate(p.created_at)}
                  {p.size_bytes ? ` · ${fmtSize(p.size_bytes)}` : ''}
                  {p.uploaded_by_nombre ? ` · ${p.uploaded_by_nombre}` : ''}
                </div>
              </div>
              {p.url ? (
                <a
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-forest-600 hover:bg-forest-700 text-white text-[11px] font-medium flex-shrink-0"
                >
                  <ExternalLink size={11} /> Ver
                </a>
              ) : (
                <span className="text-[10px] text-gray-400 italic flex-shrink-0">no disponible</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {enabled && (
        <>
          <label
            className={`flex items-center justify-center gap-2 py-2 px-3 border-2 border-dashed rounded-md cursor-pointer transition-colors ${
              uploading
                ? 'bg-gray-100 border-gray-200 cursor-not-allowed'
                : 'bg-white border-forest-300 hover:border-forest-500 hover:bg-forest-50/30'
            }`}
          >
            {uploading ? (
              <>
                <Loader2 size={14} className="animate-spin text-forest-600" />
                <span className="text-xs text-gray-600">Subiendo…</span>
              </>
            ) : (
              <>
                <Upload size={14} className="text-forest-600" />
                <span className="text-xs text-forest-700 font-medium">Subir plano PDF</span>
              </>
            )}
            <input
              type="file"
              accept="application/pdf,.pdf"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) handleFile(file)
                e.target.value = '' // permitir subir el mismo archivo dos veces
              }}
            />
          </label>
          {planos.length > 0 && (
            <div className="flex items-center gap-1.5 text-[10px] text-gray-500 justify-center">
              <CheckCircle2 size={10} className="text-emerald-500" />
              Los planos son compartidos entre todas las OPs de este ítem
            </div>
          )}
        </>
      )}
    </div>
  )
}
