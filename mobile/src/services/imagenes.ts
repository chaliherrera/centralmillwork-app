import { api } from './api'

export const imagenesService = {
  /**
   * Sube una imagen al endpoint /ordenes-compra/:id/imagenes
   * @param ocId    ID de la orden de compra
   * @param uri     URI local de la foto (file://)
   * @param tipo    'recepcion' o 'orden_compra'
   */
  async upload(ocId: number, uri: string, tipo: string = 'recepcion') {
    const filename = uri.split('/').pop() || `photo_${Date.now()}.jpg`
    const match = /\.(\w+)$/.exec(filename)
    const ext = match ? match[1].toLowerCase() : 'jpg'
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg'

    const formData = new FormData()
    formData.append('imagen', {
      uri,
      name: filename,
      type: mimeType,
    } as any)
    formData.append('tipo', tipo)

    const { data } = await api.post(`/ordenes-compra/${ocId}/imagenes`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 60000,
    })
    return data
  },
}
