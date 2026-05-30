import { useEffect } from 'react'

interface Options {
  onCommandPalette?: () => void
  onCompleteFocused?: () => void
  onPriorityCycle?: () => void
  onSearchFocus?: () => void
  onNextRow?: () => void
  onPrevRow?: () => void
  onOpenFocused?: () => void
}

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false
  const tag = el.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (el.isContentEditable) return true
  return false
}

/**
 * Atajos globales para la página de tareas. Estamos en Windows así que usamos
 * Ctrl como modificador (no ⌘). Las teclas simples (c, p, /, j, k) solo
 * disparan cuando NO se está escribiendo en un input.
 */
export function useKeyboardShortcuts(opts: Options) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+K — siempre activo, incluso dentro de inputs
      if (e.ctrlKey && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        opts.onCommandPalette?.()
        return
      }

      // Si está escribiendo en un input, solo Ctrl+K aplica (ya manejado arriba).
      // El input maneja su propio Esc/Enter; no nos metemos.
      if (isTypingTarget(e.target)) return

      // Sin modificadores: c/p/// j/k/Enter
      if (e.ctrlKey || e.metaKey || e.altKey) return

      switch (e.key) {
        case 'c':
          e.preventDefault()
          opts.onCompleteFocused?.()
          break
        case 'p':
          e.preventDefault()
          opts.onPriorityCycle?.()
          break
        case '/':
          e.preventDefault()
          opts.onSearchFocus?.()
          break
        case 'j':
        case 'ArrowDown':
          e.preventDefault()
          opts.onNextRow?.()
          break
        case 'k':
        case 'ArrowUp':
          e.preventDefault()
          opts.onPrevRow?.()
          break
        case 'Enter':
          e.preventDefault()
          opts.onOpenFocused?.()
          break
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opts])
}
