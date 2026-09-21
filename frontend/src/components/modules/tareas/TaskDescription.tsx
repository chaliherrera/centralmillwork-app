import React from 'react'

// Renderiza la descripción de una tarea mostrando cualquier FOTO embebida (ej.
// reportes de obra, que guardan "Foto: <url>") como miniatura clickeable, en vez
// del link pelado. El resto del texto se muestra igual.
const IMG_RE = /(https?:\/\/[^\s]+?\.(?:jpe?g|png|webp)(?:\?[^\s]*)?)/gi

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface Props {
  text: string
  className?: string
  style?: React.CSSProperties
}

export default function TaskDescription({ text, className, style }: Props) {
  const urls = Array.from(new Set(text.match(IMG_RE) ?? []))

  // Saca del texto las líneas "Foto: <url>" y las URLs sueltas para no duplicar.
  let clean = text
  for (const u of urls) {
    clean = clean
      .replace(new RegExp(`\\n*\\s*Foto:\\s*${escapeRegExp(u)}`, 'gi'), '')
      .replace(u, '')
  }
  clean = clean.replace(/\n{3,}/g, '\n\n').trim()

  return (
    <div>
      {clean && <p className={className} style={style}>{clean}</p>}
      {urls.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noopener noreferrer" title="Abrir foto">
              <img
                src={u}
                alt="Foto"
                loading="lazy"
                className="w-24 h-24 object-cover rounded-lg border border-gray-200 hover:opacity-90 transition"
              />
            </a>
          ))}
        </div>
      )}
    </div>
  )
}
