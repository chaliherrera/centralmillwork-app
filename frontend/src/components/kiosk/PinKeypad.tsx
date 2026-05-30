import { useEffect } from 'react'
import { Delete } from 'lucide-react'
import clsx from 'clsx'

interface Props {
  pin: string
  onChange: (pin: string) => void
  onSubmit?: (pin: string) => void
  maxLength?: number
  disabled?: boolean
}

/**
 * Teclado numérico touch-friendly para tablets.
 * - Auto-submit cuando se completan los maxLength dígitos.
 * - Acepta input por teclado físico también (números, backspace, enter).
 */
export default function PinKeypad({ pin, onChange, onSubmit, maxLength = 4, disabled }: Props) {
  // Soporte de teclado físico (útil en desarrollo y para tablets con teclado)
  useEffect(() => {
    if (disabled) return
    function onKey(e: KeyboardEvent) {
      if (/^\d$/.test(e.key)) {
        e.preventDefault()
        push(e.key)
      } else if (e.key === 'Backspace') {
        e.preventDefault()
        pop()
      } else if (e.key === 'Enter' && pin.length === maxLength && onSubmit) {
        e.preventDefault()
        onSubmit(pin)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, disabled, maxLength])

  function push(d: string) {
    if (disabled) return
    if (pin.length >= maxLength) return
    const next = pin + d
    onChange(next)
    if (next.length === maxLength && onSubmit) {
      // Pequeño delay para que se vea el dígito antes de submit
      setTimeout(() => onSubmit(next), 100)
    }
  }

  function pop() {
    if (disabled) return
    onChange(pin.slice(0, -1))
  }

  function clear() {
    if (disabled) return
    onChange('')
  }

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

  return (
    <div className="flex flex-col items-center gap-6">
      {/* Display de los dígitos */}
      <div className="flex items-center gap-3">
        {Array.from({ length: maxLength }).map((_, i) => (
          <div
            key={i}
            className={clsx(
              'w-14 h-16 rounded-xl border-2 flex items-center justify-center text-3xl font-bold transition-all',
              pin.length > i
                ? 'border-gold-500 bg-gold-50 text-forest-700'
                : 'border-gray-200 bg-white text-gray-300'
            )}
          >
            {pin[i] ? '•' : ''}
          </div>
        ))}
      </div>

      {/* Grid 3x4 del teclado */}
      <div className="grid grid-cols-3 gap-3">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => push(k)}
            disabled={disabled}
            className="w-20 h-20 rounded-2xl bg-white border border-gray-200 text-3xl font-semibold text-forest-700
                       hover:bg-gold-50 hover:border-gold-300 active:bg-gold-100 active:scale-95
                       transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={clear}
          disabled={disabled}
          className="w-20 h-20 rounded-2xl bg-white border border-gray-200 text-sm font-medium text-gray-500
                     hover:bg-gray-100 active:scale-95 transition-all duration-100 disabled:opacity-50 shadow-sm"
        >
          Borrar
        </button>
        <button
          type="button"
          onClick={() => push('0')}
          disabled={disabled}
          className="w-20 h-20 rounded-2xl bg-white border border-gray-200 text-3xl font-semibold text-forest-700
                     hover:bg-gold-50 hover:border-gold-300 active:bg-gold-100 active:scale-95
                     transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
        >
          0
        </button>
        <button
          type="button"
          onClick={pop}
          disabled={disabled}
          className="w-20 h-20 rounded-2xl bg-white border border-gray-200 flex items-center justify-center text-gray-500
                     hover:bg-gray-100 active:scale-95 transition-all duration-100 disabled:opacity-50 shadow-sm"
          aria-label="Borrar último dígito"
        >
          <Delete size={24} />
        </button>
      </div>
    </div>
  )
}
