// ─────────────────────────────────────────────────────────────────────────────
// La cantidad de un componente, tal como la escribe el estimador.
//
// En el Excel la cantidad se tipea como aritmética suelta dentro de la celda:
//     =(4.17*2*2)+(3.25*2)     → 23,18 LF de estante
// Eso NO es un vicio: es el razonamiento. "4,17 pies de corrida, dos estantes,
// dos tramos, más dos de 3,25". Si le pedimos que escriba 23,18 perdemos el
// porqué, y nadie puede revisar de dónde salió.
//
// Así que se guarda la expresión Y el resultado. Esto evalúa la expresión sin
// usar eval(): un parser de descenso recursivo que sólo entiende números y
// + − × ÷ con paréntesis. Nada que venga del usuario llega a ejecutarse.
// ─────────────────────────────────────────────────────────────────────────────

export class ExpresionInvalida extends Error {
  constructor(mensaje: string) {
    super(mensaje)
    this.name = 'ExpresionInvalida'
  }
}

type Token = { t: 'num'; v: number } | { t: 'op'; v: string }

function tokenizar(src: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if (c === ' ' || c === '\t' || c === ',') { i++; continue }  // la coma como separador visual
    if (c >= '0' && c <= '9') {
      let j = i
      while (j < src.length && ((src[j] >= '0' && src[j] <= '9') || src[j] === '.')) j++
      const txt = src.slice(i, j)
      if ((txt.match(/\./g) || []).length > 1) {
        throw new ExpresionInvalida(`número inválido: ${txt}`)
      }
      tokens.push({ t: 'num', v: parseFloat(txt) })
      i = j
      continue
    }
    if (c === '.') {                               // ".5" es válido
      let j = i + 1
      while (j < src.length && src[j] >= '0' && src[j] <= '9') j++
      if (j === i + 1) throw new ExpresionInvalida('punto suelto')
      tokens.push({ t: 'num', v: parseFloat(src.slice(i, j)) })
      i = j
      continue
    }
    if ('+-*/×÷()'.includes(c)) {
      tokens.push({ t: 'op', v: c === '×' ? '*' : c === '÷' ? '/' : c })
      i++
      continue
    }
    throw new ExpresionInvalida(`no entiendo "${c}"`)
  }
  return tokens
}

/**
 * Evalúa una expresión aritmética simple. Acepta lo que el estimador ya escribe:
 * `(4.17*2*2)+(3.25*2)`, con o sin el `=` adelante, y con × ÷ si los usa.
 *
 * Devuelve el número, o tira ExpresionInvalida con un mensaje que se le puede
 * mostrar tal cual a la persona.
 */
export function evaluarCantidad(expresion: string): number {
  const src = String(expresion).trim().replace(/^=/, '')
  if (!src) throw new ExpresionInvalida('la cantidad está vacía')
  if (src.length > 200) throw new ExpresionInvalida('la cantidad es demasiado larga')

  const tk = tokenizar(src)
  if (!tk.length) throw new ExpresionInvalida('la cantidad está vacía')
  let pos = 0

  const mirar = () => tk[pos]
  const comer = (v: string) => {
    const t = mirar()
    if (t && t.t === 'op' && t.v === v) { pos++; return true }
    return false
  }

  // expresión := término (('+' | '-') término)*
  function expr(): number {
    let n = termino()
    for (;;) {
      if (comer('+')) n += termino()
      else if (comer('-')) n -= termino()
      else return n
    }
  }

  // término := factor (('*' | '/') factor)*
  function termino(): number {
    let n = factor()
    for (;;) {
      if (comer('*')) n *= factor()
      else if (comer('/')) {
        const d = factor()
        if (d === 0) throw new ExpresionInvalida('no se puede dividir por cero')
        n /= d
      } else return n
    }
  }

  // factor := '-'? ( número | '(' expresión ')' )
  function factor(): number {
    if (comer('-')) return -factor()
    if (comer('+')) return factor()
    const t = mirar()
    if (!t) throw new ExpresionInvalida('la cuenta queda cortada')
    if (t.t === 'num') { pos++; return t.v }
    if (t.v === '(') {
      pos++
      const n = expr()
      if (!comer(')')) throw new ExpresionInvalida('falta cerrar un paréntesis')
      return n
    }
    throw new ExpresionInvalida(`no esperaba "${t.v}" acá`)
  }

  const valor = expr()
  if (pos !== tk.length) throw new ExpresionInvalida('sobra algo al final de la cuenta')
  if (!Number.isFinite(valor)) throw new ExpresionInvalida('la cuenta no da un número')
  if (valor < 0) throw new ExpresionInvalida('la cantidad no puede ser negativa')
  // 6 decimales: es la precisión de la columna cantidad_unidad.
  return Math.round(valor * 1e6) / 1e6
}

/**
 * Normaliza lo que vino del formulario: puede ser un número o una expresión.
 * Devuelve las dos cosas, que es lo que se guarda (`cantidad_unidad` y
 * `cantidad_expr`), para poder reconstruir el razonamiento después.
 */
export function parsearCantidad(entrada: string | number): {
  cantidad: number
  expresion: string | null
} {
  if (typeof entrada === 'number') {
    if (!Number.isFinite(entrada) || entrada < 0) {
      throw new ExpresionInvalida('la cantidad no es válida')
    }
    return { cantidad: entrada, expresion: null }
  }
  const txt = String(entrada).trim()
  const cantidad = evaluarCantidad(txt)
  // Si escribió un número pelado no hay razonamiento que guardar.
  const esNumeroPelado = /^=?\s*\d+(\.\d+)?\s*$/.test(txt)
  return { cantidad, expresion: esNumeroPelado ? null : txt.replace(/^=/, '') }
}
