import api from './api'

export interface Plano {
  id: number
  filename: string
  original_name: string
  size_bytes: number | null
  created_at: string
  uploaded_by_nombre: string | null
  url: string | null
}

export const planosService = {
  async list(proyectoId: number, numeroItem: string): Promise<Plano[]> {
    const { data } = await api.get<{ data: Plano[] }>(
      `/proyectos/${proyectoId}/items/${encodeURIComponent(numeroItem)}/planos`
    )
    return data.data
  },

  async upload(proyectoId: number, numeroItem: string, file: File): Promise<Plano> {
    const fd = new FormData()
    fd.append('plano', file)
    const { data } = await api.post<{ data: Plano }>(
      `/proyectos/${proyectoId}/items/${encodeURIComponent(numeroItem)}/planos`,
      fd,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
    return data.data
  },
}
