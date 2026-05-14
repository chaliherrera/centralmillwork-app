import { useRef, useState, FormEvent } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  FileText, Upload, Trash2, ExternalLink, Loader2, Image as ImageIcon, FileX,
} from 'lucide-react'
import clsx from 'clsx'
import toast from 'react-hot-toast'
import Modal from '@/components/ui/Modal'
import { produccionService } from '@/services/produccion'
import type { OrdenDocumento, OrdenProceso } from '@/types/produccion'

interface Props {
  ordenId: number
  procesos: OrdenProceso[]
}

/**
 * Panel de documentos adjuntos a una orden, agrupado por estación.
 *
 * Decisión de UX: una sección por cada estación que la orden atraviesa + una
 * sección "Generales" para docs no vinculados a estación específica.
 * Cada sección tiene su propio botón "Subir" que abre un modal con campos
 * (descripción opcional, multi-archivo).
 *
 * Cuando hay > 0 docs en una estación, el operario también los ve en el
 * kiosko cuando esa orden está en su cola.
 */
export default function OrdenDocumentos({ ordenId, procesos }: Props) {
  const { data: docs = [], isLoading } = useQuery({
    queryKey: ['orden-docs', ordenId],
    queryFn:  () => produccionService.documentos(ordenId),
  })

  // Sección "Generales" (estacion = null) + una sección por cada estación de los procesos.
  // Mantengo el orden secuencial de los procesos para que el SHOP_MANAGER los vea
  // en el mismo orden del flujo.
  const secciones: { key: string; label: string; estacion: string | null }[] = [
    { key: 'general', label: 'Generales (toda la orden)', estacion: null },
    ...procesos
      .sort((a, b) => a.secuencia - b.secuencia)
      .map((p) => ({
        key: p.estacion,
        label: p.estacion.replace('_', ' ').toUpperCase(),
        estacion: p.estacion,
      })),
  ]

  // Agrupar docs por estación (key)
  const docsPorSeccion: Record<string, OrdenDocumento[]> = {}
  for (const d of docs) {
    const k = d.estacion ?? 'general'
    if (!docsPorSeccion[k]) docsPorSeccion[k] = []
    docsPorSeccion[k].push(d)
  }

  return (
    <div className="card space-y-3">
      <div className="flex items-center gap-2">
        <FileText size={16} className="text-gold-600" />
        <h3 className="!text-base">Documentos</h3>
        <span className="text-xs text-gray-400">
          {docs.length} {docs.length === 1 ? 'archivo' : 'archivos'}
        </span>
      </div>

      <p className="text-xs text-gray-500 -mt-1">
        PDFs y planos por estación. El operario del kiosko verá los de su estación + los generales.
      </p>

      {isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 size={18} className="animate-spin text-gray-400" /></div>
      ) : (
        <div className="space-y-3">
          {secciones.map((sec) => (
            <SeccionDocs
              key={sec.key}
              ordenId={ordenId}
              titulo={sec.label}
              estacion={sec.estacion}
              docs={docsPorSeccion[sec.key] ?? []}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Una sección por estación (o "Generales") ────────────────────────────────
function SeccionDocs({ ordenId, titulo, estacion, docs }: {
  ordenId: number
  titulo: string
  estacion: string | null
  docs: OrdenDocumento[]
}) {
  const [uploadOpen, setUploadOpen] = useState(false)
  const qc = useQueryClient()

  const borrar = useMutation({
    mutationFn: (docId: number) => produccionService.borrarDocumento(docId),
    onSuccess: () => {
      toast.success('Documento eliminado')
      qc.invalidateQueries({ queryKey: ['orden-docs', ordenId] })
      qc.invalidateQueries({ queryKey: ['kiosk', 'mi-cola'] })
    },
  })

  const empty = docs.length === 0
  const general = estacion === null

  return (
    <div className={clsx(
      'rounded-xl border',
      general ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white',
    )}>
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <span className={clsx(
            'inline-flex items-center gap-1 text-xs font-bold tracking-wider',
            general ? 'text-gray-600' : 'text-forest-700'
          )}>
            {titulo}
          </span>
          {docs.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-gold-100 text-gold-800 text-[10px] font-bold">
              {docs.length}
            </span>
          )}
        </div>
        <button
          onClick={() => setUploadOpen(true)}
          className="text-xs font-semibold text-forest-700 hover:text-gold-600 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 transition-colors"
        >
          <Upload size={12} /> Subir
        </button>
      </div>

      {empty ? (
        <p className="px-4 py-3 text-xs text-gray-400 italic">
          Sin documentos. Subí el {general ? 'archivo general' : 'plano / hoja para esta estación'}.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-gold-50 transition-colors">
              <FileIcon mime={d.mime_type} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{d.nombre}</div>
                <div className="text-[11px] text-gray-500 flex items-center gap-1.5 flex-wrap">
                  <span>{formatSize(d.size_bytes)}</span>
                  <span>·</span>
                  <span>{new Date(d.created_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                  {d.uploaded_by_nombre && (
                    <><span>·</span><span>{d.uploaded_by_nombre}</span></>
                  )}
                </div>
                {d.descripcion && (
                  <div className="text-[11px] text-gray-600 italic mt-0.5 truncate">"{d.descripcion}"</div>
                )}
              </div>
              <a
                href={d.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                className="p-1.5 text-gray-400 hover:text-forest-700 hover:bg-gray-100 rounded transition-colors"
                title="Abrir"
              >
                <ExternalLink size={14} />
              </a>
              <button
                onClick={() => {
                  if (confirm(`¿Eliminar "${d.nombre}"?`)) borrar.mutate(d.id)
                }}
                disabled={borrar.isPending}
                className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                title="Eliminar"
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {uploadOpen && (
        <UploadModal
          ordenId={ordenId}
          estacion={estacion}
          titulo={titulo}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </div>
  )
}

// ─── Modal de upload (multi-archivo + descripción) ────────────────────────────
function UploadModal({ ordenId, estacion, titulo, onClose }: {
  ordenId: number
  estacion: string | null
  titulo: string
  onClose: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [files, setFiles] = useState<File[]>([])
  const [descripcion, setDescripcion] = useState('')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 })
  const qc = useQueryClient()

  function pickFiles() {
    inputRef.current?.click()
  }

  function onFilesPicked(list: FileList | null) {
    if (!list) return
    const incoming = Array.from(list)
    // Validación cliente: PDF + imágenes, máx 20MB cada uno
    const TOO_BIG  = incoming.filter((f) => f.size > 20 * 1024 * 1024)
    const WRONG   = incoming.filter((f) => !/\.(pdf|jpe?g|png|webp)$/i.test(f.name))
    if (TOO_BIG.length) {
      toast.error(`${TOO_BIG.length} archivo(s) superan 20MB`)
    }
    if (WRONG.length) {
      toast.error(`${WRONG.length} archivo(s) con extensión no permitida`)
    }
    const ok = incoming.filter((f) => !TOO_BIG.includes(f) && !WRONG.includes(f))
    setFiles((prev) => [...prev, ...ok])
  }

  function removeFile(idx: number) {
    setFiles((prev) => prev.filter((_, i) => i !== idx))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (files.length === 0) {
      toast.error('Elegí al menos un archivo')
      return
    }
    setUploading(true)
    setProgress({ done: 0, total: files.length })
    let okCount = 0
    let errCount = 0

    // Subir secuencialmente para no saturar el endpoint y mostrar progreso real
    for (const file of files) {
      try {
        await produccionService.subirDocumento(ordenId, file, {
          estacion,
          descripcion: descripcion.trim() || undefined,
        })
        okCount++
      } catch {
        errCount++
      }
      setProgress((p) => ({ ...p, done: p.done + 1 }))
    }

    if (okCount > 0) {
      toast.success(`${okCount} archivo${okCount > 1 ? 's' : ''} subido${okCount > 1 ? 's' : ''}`)
      qc.invalidateQueries({ queryKey: ['orden-docs', ordenId] })
      qc.invalidateQueries({ queryKey: ['kiosk', 'mi-cola'] })
    }
    if (errCount > 0) toast.error(`${errCount} archivo(s) fallaron`)

    setUploading(false)
    if (errCount === 0) onClose()
  }

  return (
    <Modal open onClose={uploading ? () => {} : onClose} title={`Subir documentos — ${titulo}`} size="md">
      <form onSubmit={submit} className="space-y-4">
        {/* Drop area / file picker */}
        <div
          onClick={pickFiles}
          className="border-2 border-dashed border-gray-300 hover:border-gold-400 hover:bg-gold-50 rounded-xl px-4 py-6 text-center cursor-pointer transition-colors"
        >
          <Upload size={24} className="mx-auto text-gray-400 mb-1" />
          <p className="text-sm text-gray-700 font-medium">Click para elegir archivos</p>
          <p className="text-xs text-gray-500 mt-0.5">PDF, JPG, PNG, WebP · máx 20 MB cada uno</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".pdf,image/jpeg,image/jpg,image/png,image/webp"
            className="hidden"
            onChange={(e) => onFilesPicked(e.target.files)}
          />
        </div>

        {/* Lista de archivos elegidos */}
        {files.length > 0 && (
          <div className="border border-gray-200 rounded-xl divide-y max-h-44 overflow-y-auto">
            {files.map((f, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2">
                <FileIcon mime={f.type} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm truncate">{f.name}</div>
                  <div className="text-[11px] text-gray-500">{formatSize(f.size)}</div>
                </div>
                {!uploading && (
                  <button
                    type="button"
                    onClick={() => removeFile(i)}
                    className="p-1 text-gray-400 hover:text-red-600 rounded"
                    title="Quitar de la lista"
                  >
                    <FileX size={14} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Descripción común a todos */}
        <div>
          <label className="label">Descripción <span className="text-xs text-gray-400 font-normal">(opcional, se aplica a todos)</span></label>
          <input
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="ej: Plano v3 con corrección"
            className="input w-full"
            maxLength={200}
          />
        </div>

        {/* Progreso */}
        {uploading && (
          <div>
            <div className="text-xs text-gray-600 mb-1">
              Subiendo {progress.done} de {progress.total}…
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gold-500 transition-all"
                style={{ width: `${progress.total === 0 ? 0 : (progress.done / progress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} disabled={uploading} className="btn-ghost">
            Cancelar
          </button>
          <button type="submit" disabled={uploading || files.length === 0} className="btn-primary">
            {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
            Subir {files.length > 0 && `(${files.length})`}
          </button>
        </div>
      </form>
    </Modal>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function FileIcon({ mime }: { mime: string | null }) {
  if (mime?.startsWith('image/')) {
    return (
      <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center shrink-0">
        <ImageIcon size={16} className="text-blue-600" />
      </div>
    )
  }
  return (
    <div className="w-9 h-9 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
      <FileText size={16} className="text-red-600" />
    </div>
  )
}

function formatSize(bytes: number | null): string {
  if (bytes == null) return '—'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
