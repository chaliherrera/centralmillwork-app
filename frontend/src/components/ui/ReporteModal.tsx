import { useState } from 'react'
import { Download, FileText, Loader2, Link, Check } from 'lucide-react'
import toast from 'react-hot-toast'
import Modal from './Modal'
import { reportesService } from '@/services/reportes'

type Tipo = 'compras' | 'produccion'
type Accion = 'download' | 'share'
type LoadingKey = `${Tipo}-${Accion}` | null

interface Props {
  open: boolean
  onClose: () => void
}

export default function ReporteModal({ open, onClose }: Props) {
  const [loading, setLoading] = useState<LoadingKey>(null)
  const [copied, setCopied]   = useState<Tipo | null>(null)

  async function handleDownload(tipo: Tipo) {
    setLoading(`${tipo}-download`)
    try {
      if (tipo === 'compras') await reportesService.downloadCompras()
      else                    await reportesService.downloadProduccion()
      toast.success(`Reporte ${tipo} descargado`)
      onClose()
    } catch {
      toast.error('Error al generar el reporte')
    } finally {
      setLoading(null)
    }
  }

  async function handleCompartir(tipo: Tipo) {
    setLoading(`${tipo}-share`)
    try {
      const url = tipo === 'compras'
        ? await reportesService.compartirCompras()
        : await reportesService.compartirProduccion()

      await navigator.clipboard.writeText(url)
      setCopied(tipo)
      toast.success('URL copiada al portapapeles — comparte por WhatsApp', { duration: 4000 })
      setTimeout(() => setCopied(null), 3000)
    } catch (err: any) {
      const msg = err?.response?.data?.message ?? err?.message ?? 'Error al compartir'
      toast.error(msg)
    } finally {
      setLoading(null)
    }
  }

  const isLoading = (tipo: Tipo, accion: Accion) => loading === `${tipo}-${accion}`
  const anyLoading = !!loading

  function ReporteCard({
    tipo, label, sublabel, accent,
  }: { tipo: Tipo; label: string; sublabel: string; accent: 'gold' | 'forest' }) {
    const g = accent === 'gold'
    return (
      <div className={`rounded-xl border p-4 flex flex-col gap-3 ${g ? 'border-gold-200 bg-gold-50' : 'border-forest-200 bg-forest-50'}`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${g ? 'bg-gold-100' : 'bg-forest-100'}`}>
            <FileText size={20} className={g ? 'text-gold-600' : 'text-forest-600'} />
          </div>
          <div>
            <p className={`text-sm font-semibold ${g ? 'text-gold-700' : 'text-forest-700'}`}>{label}</p>
            <p className={`text-xs mt-0.5 ${g ? 'text-gold-500' : 'text-forest-500'}`}>{sublabel}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {/* Descargar */}
          <button
            onClick={() => handleDownload(tipo)}
            disabled={anyLoading}
            className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed
              ${g ? 'bg-gold-100 hover:bg-gold-200 text-gold-700' : 'bg-forest-100 hover:bg-forest-200 text-forest-700'}`}
          >
            {isLoading(tipo, 'download')
              ? <Loader2 size={13} className="animate-spin" />
              : <Download size={13} />}
            Descargar
          </button>

          {/* Compartir */}
          <button
            onClick={() => handleCompartir(tipo)}
            disabled={anyLoading}
            className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-gray-900 hover:bg-gray-800 text-white"
          >
            {isLoading(tipo, 'share') ? (
              <Loader2 size={13} className="animate-spin" />
            ) : copied === tipo ? (
              <><Check size={13} /> Copiado</>
            ) : (
              <><Link size={13} /> Compartir</>
            )}
          </button>
        </div>
      </div>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title="Generar Reporte" size="sm">
      <p className="text-sm text-gray-500 mb-4">
        <strong>Descargar</strong> guarda el HTML en tu equipo.{' '}
        <strong>Compartir</strong> sube el reporte a GitHub Pages y copia la URL pública para enviar por WhatsApp o abrir desde el iPhone.
      </p>

      <div className="space-y-3">
        <ReporteCard tipo="compras"   label="Reporte Compras"    sublabel="OCs, vendors, materiales" accent="gold"   />
        <ReporteCard tipo="produccion" label="Reporte Producción" sublabel="MTO, recepciones, status" accent="forest" />
      </div>

      <div className="flex justify-end mt-4 pt-4 border-t border-gray-100">
        <button onClick={onClose} className="btn-ghost text-sm">Cerrar</button>
      </div>
    </Modal>
  )
}
