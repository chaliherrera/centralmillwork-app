// Helpers del link del portal del cliente: derivar el código "de cliente" y copiar
// el link ENMASCARADO (texto lindo, no la URL cruda) para pegarlo en un email.

// PRY-2026-618 → 26-618 (año de 2 dígitos + número). Otros códigos (ej. 26-588) se usan tal cual.
export function codigoCliente(codigo: string): string {
  const m = /^PRY-\d{2}(\d{2})-(\d+)$/.exec(codigo || '')
  return m ? `${m[1]}-${m[2]}` : (codigo || '')
}

// Texto visible del link, ej: "26-618 Preston Plaza PROJECT SCHEDULE".
export function etiquetaPortal(codigo: string, nombre: string): string {
  const cod = codigoCliente(codigo)
  return `${cod ? cod + ' ' : ''}${(nombre || '').trim()} PROJECT SCHEDULE`.trim()
}

// Copia el link como HIPERVÍNCULO CON NOMBRE: al pegar en Outlook/Gmail aparece el
// texto "26-618 Preston Plaza PROJECT SCHEDULE" (clickeable), no la URL de staging.
// Si el navegador no soporta copiar HTML, cae a copiar la URL cruda.
export async function copiarLinkEnmascarado(url: string, etiqueta: string): Promise<boolean> {
  const safe = etiqueta.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const html = `<a href="${url}">${safe}</a>`
  try {
    if (navigator.clipboard && (window as any).ClipboardItem) {
      const item = new (window as any).ClipboardItem({
        // Con formato (Outlook/Gmail): hipervínculo con el nombre lindo.
        'text/html': new Blob([html], { type: 'text/html' }),
        // Sin formato (barra de direcciones, campos planos): la URL REAL, para que
        // se pueda abrir directo. Si pusiéramos "Etiqueta — URL" no navegaría.
        'text/plain': new Blob([url], { type: 'text/plain' }),
      })
      await navigator.clipboard.write([item])
      return true
    }
  } catch { /* cae al fallback */ }
  try { await navigator.clipboard?.writeText(url); return true } catch { return false }
}
