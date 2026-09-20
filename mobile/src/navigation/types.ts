import type { OrdenCompra } from '../services/ordenesCompra'
import type { InstallProyecto } from '../services/schedule'

// Rutas del stack raíz. Los nombres de módulo coinciden con RouteName en
// src/config/modulos.ts (lo que el Home ofrece según el rol).
export type RootStackParamList = {
  Home: undefined
  // Recepciones (existentes)
  Recepciones: undefined
  OCDetail: { oc: OrdenCompra }
  // Buscar / Instalación (existentes)
  Buscar: undefined
  Instalacion: undefined
  InstallDetail: { proyecto: InstallProyecto }
  ReporteObra: { proyectoId: number; codigo: string; nombre: string }
  PlanosObra: { proyectoId: number; codigo: string }
  // Consola Admin (nuevas, solo lectura en Fase 0)
  MaterialesMto: undefined
  ControlMto: undefined
  OrdenesCompra: undefined
  GenerarOC: undefined
  Proyectos: undefined
}
