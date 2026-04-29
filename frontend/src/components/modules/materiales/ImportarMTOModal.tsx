import { useState, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, FileSpreadsheet, CheckCircle2, AlertCircle, X } from 'lucide-react'
import clsx from 'clsx'
import Modal from '@/components/ui/Modal'
import { materialesService } from '@/services/materiales'
import { proyectosService } from '@/services/proyectos'

interface Props {
  open: boolean
  onClose: () => void
  defaultProyectoId?: number
}

type Modo = 'agregar' | 'reemplazar'

export default function ImportarMTOModal({ open, onClose, defaultProyectoId }: Props) {
  const [proyectoId, setProyectoId] = useState<number | ''>(defaultProyectoId ?? '')
  const [modo, setModo]             = useState<Modo>('agregar')
  const [archivo, setArchivo]       = useState<File | null>(null)
  const [result, setResult]         = useState<{ importados: number; omitidos: number; fecha_importacion: string } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data: proyData } = useQuery({
    queryKey: ['proyectos-select'],
    queryFn: () => proyectosService.getAll({ limit: 100 }),
    staleTime: 60_000,
    enabled: open,
  })
  const proyectos = proyData?.data ?? []

  const mutation = useMutation({
    mutationFn: () => {
      if (!proyectoId || !archivo) throw new Error('Faltan datos')
      return materialesService.importar(proyectoId as number, modo, archivo)
    },
    onSuccess: (res) => {
      setResult(res.data!)
      qc.invalidateQueries({ queryKey: ['materiales'] })
      qc.invalidateQueries({ queryKey: ['materiales-kpis'] })
      qc.invalidateQueries({ queryKey: ['materiales-all'] })
      qc.invalidateQueries({ queryKey: ['materiales-import-dates'] })
    },
  })

  const handleClose = () => {
    setArchivo(null)
    setResult(null)
    setModo('agregar')
    mutation.reset()
    onClose()
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) setArchivo(f)
    e.target.value = ''
  }

  const canSubmit = !!proyectoId && !!archivo && !mutation.isPending

  // ── Result view ─────────────────────────────────────────────────────────────
  if (result) {
    return (
      <Modal open={open} onClose={handleClose} title="Importación completada" size="sm">
        <div className="text-center space-y-4 py-2">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-green-600" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">{result.importados}</p>
            <p className="text-sm text-gray-500">materiales importados</p>
          </div>
          <div className="grid grid-cols-2 gap-3 text-center">
            <div className="bg-green-50 rounded-xl px-4 py-3">
              <p className="text-xl font-bold text-green-700">{result.importados}</p>
              <p className="text-xs text-green-600 font-medium">Importados</p>
            </div>
            <div className="bg-gray-50 rounded-xl px-4 py-3">
              <p className="text-xl font-bold text-gray-500">{result.omitidos}</p>
              <p className="text-xs text-gray-400 font-medium">Omitidos</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            Fecha de importación: <strong>{result.fecha_importacion}</strong>
          </p>
          <button onClick={handleClose} className="btn-primary w-full justify-center">
            Cerrar
          </button>
        </div>
      </Modal>
    )
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <Modal open={open} onClose={handleClose} title="Importar MTO desde Excel" size="md">
      <div className="space-y-5">

        {/* Error */}
        {mutation.isError && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm">
            <AlertCircle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
            <p className="text-red-700">
              {(mutation.error as any)?.response?.data?.message ?? (mutation.error as Error).message}
            </p>
          </div>
        )}

        {/* Proyecto */}
        <div>
          <label className="label">Proyecto</label>
          <select
            value={proyectoId}
            onChange={(e) => setProyectoId(e.target.value === '' ? '' : parseInt(e.target.value))}
            className="input w-full"
          >
            <option value="">— Seleccionar proyecto —</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>{p.codigo} — {p.nombre}</option>
            ))}
          </select>
        </div>

        {/* Archivo */}
        <div>
          <label className="label">Archivo Excel</label>
          {archivo ? (
            <div className="flex items-center gap-3 p-3 bg-forest-50 border border-forest-200 rounded-lg">
              <FileSpreadsheet size={20} className="text-forest-600 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-forest-700 truncate">{archivo.name}</p>
                <p className="text-xs text-forest-500">{(archivo.size / 1024).toFixed(1)} KB</p>
              </div>
              <button
                onClick={() => setArchivo(null)}
                className="p-1 text-forest-400 hover:text-red-500 transition-colors"
                title="Quitar archivo"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => inputRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-200 hover:border-gold-400 hover:bg-gold-50/30 rounded-xl transition-colors text-gray-400 hover:text-gold-600"
            >
              <Upload size={24} />
              <span className="text-sm font-medium">Seleccionar archivo .xlsx</span>
              <span className="text-xs text-gray-300">Máx 20 MB</span>
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={handleFile}
          />
        </div>

        {/* Modo */}
        <div>
          <label className="label">Modo de importación</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { value: 'agregar',    label: 'Agregar',    desc: 'Agrega los materiales al proyecto sin eliminar los existentes' },
              { value: 'reemplazar', label: 'Reemplazar', desc: 'Elimina todos los materiales actuales del proyecto y los sustituye' },
            ] as { value: Modo; label: string; desc: string }[]).map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setModo(value)}
                className={clsx(
                  'text-left p-3 rounded-xl border-2 transition-colors',
                  modo === value
                    ? value === 'reemplazar'
                      ? 'border-red-400 bg-red-50'
                      : 'border-forest-500 bg-forest-50'
                    : 'border-gray-200 hover:border-gray-300'
                )}
              >
                <p className={clsx(
                  'text-sm font-semibold',
                  modo === value
                    ? value === 'reemplazar' ? 'text-red-700' : 'text-forest-700'
                    : 'text-gray-700'
                )}>{label}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-snug">{desc}</p>
              </button>
            ))}
          </div>
          {modo === 'reemplazar' && (
            <p className="mt-2 text-xs text-red-600 font-medium flex items-center gap-1">
              <AlertCircle size={12} />
              Todos los materiales actuales del proyecto serán eliminados
            </p>
          )}
        </div>

        {/* Mapping info */}
        <details className="text-xs text-gray-500">
          <summary className="cursor-pointer hover:text-gray-700 font-medium">
            Columnas reconocidas automáticamente
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-gray-400 pl-2">
            {[
              ['Item', 'Número de ítem'],
              ['CM Code', 'Código interno'],
              ['Vendor Code', 'Código proveedor'],
              ['Vendor', 'Proveedor'],
              ['Description / Descripción', 'Descripción'],
              ['Color / Finish', 'Color'],
              ['Manufacturer', 'Fabricante'],
              ['Category / Categoría', 'Categoría'],
              ['Unit / UOM', 'Unidad'],
              ['Size', 'Tamaño'],
              ['QTY / Quantity', 'Cantidad'],
              ['Unit Price', 'Precio unitario'],
              ['Total Price', 'Total'],
            ].map(([col, field]) => (
              <p key={col}><span className="font-mono text-gray-500">{col}</span> → {field}</p>
            ))}
          </div>
        </details>

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <button onClick={handleClose} className="btn-ghost flex-1">Cancelar</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="btn-primary flex-1 justify-center disabled:opacity-50"
          >
            {mutation.isPending ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <><Upload size={15} /> Importar</>
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
