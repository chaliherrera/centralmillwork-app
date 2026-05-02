import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { X, Plus, FileText } from 'lucide-react'
import toast from 'react-hot-toast'
import { imagenesService, imagenUrl } from '@/services/imagenes'

export default function DynamicImageGrid({ ocId }: { ocId: number }) {
  const [lightbox, setLightbox] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { data } = useQuery({
    queryKey: ['oc-imagenes', ocId],
    queryFn: () => imagenesService.getByOrden(ocId),
    staleTime: 10_000,
  })
  const imagenes = data?.data ?? []

  const uploadMutation = useMutation({
    mutationFn: (file: File) => imagenesService.upload(ocId, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oc-imagenes', ocId] }),
    onError: () => toast.error('Error al subir imagen'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: number) => imagenesService.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['oc-imagenes', ocId] }),
    onError: () => toast.error('Error al eliminar imagen'),
  })

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadMutation.mutate(file)
    e.target.value = ''
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {imagenes.map((img) => {
          const isPdf = img.filename.endsWith('.pdf')
          const url = imagenUrl(img)
          return (
            <div key={img.id} className="relative group rounded-lg border border-gray-200 overflow-hidden bg-gray-50">
              {isPdf ? (
                <div
                  className="flex items-center gap-2 p-2.5 cursor-pointer hover:bg-gray-100 transition-colors h-24"
                  onClick={() => window.open(url, '_blank')}
                >
                  <FileText size={20} className="text-red-400 flex-shrink-0" />
                  <span className="text-xs text-gray-600 break-all line-clamp-3">{img.original_name}</span>
                </div>
              ) : (
                <img
                  src={url}
                  alt={img.original_name}
                  className="w-full h-24 object-cover cursor-pointer"
                  onClick={() => setLightbox(url)}
                />
              )}
              <button
                onClick={() => deleteMutation.mutate(img.id)}
                disabled={deleteMutation.isPending}
                className="absolute top-1 right-1 p-0.5 bg-red-500 text-white rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 disabled:opacity-50"
              >
                <X size={11} />
              </button>
            </div>
          )
        })}

        {/* Add photo button */}
        <button
          onClick={() => inputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="h-24 rounded-lg border-2 border-dashed border-gray-200 hover:border-gold-400 hover:bg-gold-50/30 transition-colors flex flex-col items-center justify-center gap-1 text-gray-300 hover:text-gold-500 disabled:opacity-50"
        >
          {uploadMutation.isPending ? (
            <div className="w-4 h-4 border-2 border-gold-400 border-t-transparent rounded-full animate-spin" />
          ) : (
            <>
              <Plus size={16} />
              <span className="text-xs">Agregar foto</span>
            </>
          )}
        </button>
      </div>

      <input ref={inputRef} type="file" accept="image/*,.pdf" className="hidden" onChange={handleFile} />

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[200] bg-black/85 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/15 hover:bg-white/25 text-white rounded-full transition-colors"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          <img
            src={lightbox}
            alt="preview"
            className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
