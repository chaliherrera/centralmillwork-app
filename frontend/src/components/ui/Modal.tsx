import { X } from 'lucide-react'
import { useEffect } from 'react'
import clsx from 'clsx'

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const sizeMap = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}

export default function Modal({ open, onClose, title, children, size = 'md' }: ModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/*
        max-h-[90vh] + flex flex-col + overflow-y-auto en el body hace que
        si el contenido es más alto que el viewport, el body scrollea y el
        header se mantiene visible. Sin esto, modales con listas largas
        (ej. Asignar operario, MaterialForm) empujaban los botones de
        acción fuera de la pantalla y obligaban a reducir zoom para verlos.
      */}
      <div className={clsx(
        'relative w-full bg-white rounded-2xl shadow-2xl flex flex-col max-h-[90vh]',
        sizeMap[size]
      )}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-base font-semibold text-forest-700">{title}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}
