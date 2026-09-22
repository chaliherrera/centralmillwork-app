import type { OrdenCompra } from '../services/ordenesCompra'
import type { InstallProyecto } from '../services/schedule'
import type { Proyecto } from '../services/proyectos'
import type { AreaKey } from '../config/modulos'

// Rutas del stack raíz. Los nombres de módulo coinciden con RouteName en
// src/config/modulos.ts (lo que el Home ofrece según el rol).
export type RootStackParamList = {
  Home: undefined
  AreaHub: { area: AreaKey }
  // Recepciones (existentes)
  Recepciones: undefined
  OCDetail: { oc: OrdenCompra }
  // Buscar / Instalación (existentes)
  Buscar: undefined
  Instalacion: undefined
  InstallDetail: { proyecto: InstallProyecto }
  ReporteObra: { proyectoId: number; codigo: string; nombre: string }
  PlanosObra: { proyectoId: number; codigo: string }
  // Consola Admin
  MaterialesMto: undefined
  ControlMto: { proyecto?: Proyecto } | undefined
  OrdenesCompra: undefined
  GenerarOC: undefined
  NuevaCompra: undefined
  Proyectos: undefined
}
