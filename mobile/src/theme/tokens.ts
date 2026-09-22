// ─────────────────────────────────────────────────────────────────────────────
// Sistema de diseño Central Millwork — tokens únicos (app de campo)
// Fuente única de color/tipografía/vidrio/espaciado. Reemplaza los 5+ mapas de
// color duplicados que había por pantalla. Regla: NO se agregan colores fuera de
// esta paleta cerrada. Ver SISTEMA_DE_DISENO.md (handoff de diseño).
// ─────────────────────────────────────────────────────────────────────────────

/** Paleta cerrada. Fondo oscuro cálido (no negro). No hay pantallas claras. */
export const color = {
  bg: '#1E1A16',            // único fondo de app
  stripeA: '#2A251F',       // placeholder de foto (franjas 135°)
  stripeB: '#332C24',
  ink: '#F5F0E8',           // texto principal (~15:1)
  ink2: '#D8D1C6',          // párrafos largos
  ink3: '#C4BCB0',          // subtítulo sobre hero
  muted: '#A9A196',         // labels/ayudas/metadatos 11–14px (~7:1)
  mutedStrong: '#8C8479',   // metadato tenue — PISO ABSOLUTO de contraste para texto
  line: 'rgba(245,240,232,0.09)', // separador hairline 1px (reemplaza tarjetas)
  gold: '#D9A441',          // acento de marca · CTA primario · estado pendiente · activo
  goldHi: '#E8BC69',        // dorado presionado/hover
  green: '#6FBF8B',         // completado / resuelto
  coral: '#F0806A',         // bloqueado / daño / vencido
  grey: '#8C8479',          // inactivo / cancelado / archivado
  onGold: '#1E1A16',        // texto/íconos sobre dorado (NUNCA blanco sobre dorado)
} as const

/** Estado → color (vocabulario fijo). El estado se muestra como ● + palabra. */
export const estadoColor = {
  completado: color.green,
  resuelto: color.green,
  pendiente: color.gold,
  en_curso: color.gold,
  bloqueado: color.coral,
  danado: color.coral,
  vencido: color.coral,
  inactivo: color.grey,
  cancelado: color.grey,
  archivado: color.grey,
} as const

// Familias tipográficas (claves que expone useFonts de @expo-google-fonts).
// Spectral = títulos · Archivo = cuerpo · Archivo Narrow = kickers/columnas.
export const font = {
  titleSemi: 'Spectral_600SemiBold',
  titleMed: 'Spectral_500Medium',
  body: 'Archivo_400Regular',
  bodyMed: 'Archivo_500Medium',
  bodySemi: 'Archivo_600SemiBold',
  bodyBold: 'Archivo_700Bold',
  kickerMed: 'ArchivoNarrow_500Medium',
  kickerSemi: 'ArchivoNarrow_600SemiBold',
  mono: 'Courier',          // solo códigos escaneables (OC/remito/SKU) y placeholders
} as const

// Escala tipográfica cerrada — no inventar tamaños intermedios.
export const size = {
  title: 32,        // título de pantalla grande
  titleSm: 28,      // título de pantalla / hero
  sheetTitle: 24,   // título de bottom sheet
  section: 19,      // encabezado de sección
  button: 16.5,     // texto de botón
  row: 15.5,        // título de fila
  body: 15,         // párrafo
  secondary: 13.5,  // secundario
  status: 12.5,     // estado y metadato — mínimo absoluto de texto
  kicker: 11,       // label mayúscula de alto contraste (único < 12.5)
} as const

// Espaciado (múltiplos de 4) y forma.
export const space = {
  margin: 24,       // margen lateral de pantalla, siempre
  gapSm: 14,
  gapMd: 22,
  gapLg: 26,
  gapXl: 34,        // aire arriba de encabezado de sección
  scrollReserve: 140, // reserva inferior para que el flotante no tape la última fila
  safeTop: 44,
  safeBottom: 34,
} as const

export const radius = {
  thumb: 8,
  image: 14,        // imágenes y toasts
  input: 16,
  button: 18,       // botón grande
  pill: 24,         // pill / botón circular
  glass: 30,        // superficies de vidrio flotantes
  glassLg: 33,
  phone: 46,
} as const

// Recetas de vidrio (solo nav/controles/sheet/FAB/toast — NUNCA en contenido).
// En RN el blur lo hace <BlurView> de expo-blur; `overlay` es el tinte por encima,
// `intensity`/`tint` van al BlurView, y `border`/`shadow` al contenedor.
export const glass = {
  // flotante sobre contenido (tab bar, FAB contextual)
  floating: {
    intensity: 60,
    tint: 'dark' as const,
    overlay: 'rgba(40,35,29,0.40)',
    border: 'rgba(245,240,232,0.18)',
  },
  // barra anclada a un borde (toolbar superior)
  bar: {
    intensity: 55,
    tint: 'dark' as const,
    overlay: 'rgba(30,26,22,0.42)',
    border: 'rgba(245,240,232,0.14)',
  },
  // sheet / modal
  sheet: {
    intensity: 70,
    tint: 'dark' as const,
    overlay: 'rgba(40,35,29,0.48)',
    border: 'rgba(245,240,232,0.22)',
  },
  // FAB dorado
  fab: {
    intensity: 40,
    tint: 'dark' as const,
    overlay: 'rgba(217,164,65,0.85)',
    border: 'rgba(255,255,255,0.28)',
  },
  // brillo superior interno (la "señal" de vidrio del handoff: inset 0 1px 0 …)
  highlight: 'rgba(255,255,255,0.14)',
  scrim: 'rgba(10,8,6,0.55)',
  // Sólido equivalente si el device no soporta blur o hay "reducir transparencia".
  solid: '#282320',
} as const

// Sombra estándar de elemento flotante (iOS/Android).
export const shadowFloat = {
  shadowColor: '#000',
  shadowOpacity: 0.5,
  shadowRadius: 24,
  shadowOffset: { width: 0, height: 14 },
  elevation: 12,
} as const

// Movimiento — duraciones/curvas de la tabla del sistema (ms).
export const motion = {
  push: 280,
  sheet: 300,
  scrim: 220,
  stateChange: 200,
  toast: 2600,
  press: 100,
  easing: [0.22, 0.8, 0.3, 1] as const, // cubic-bezier del sistema
  reducedFade: 120,
} as const

// Lista de fuentes para useFonts (App.tsx). Import estático de cada peso.
import {
  Spectral_500Medium, Spectral_600SemiBold,
} from '@expo-google-fonts/spectral'
import {
  Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold,
} from '@expo-google-fonts/archivo'
import {
  ArchivoNarrow_500Medium, ArchivoNarrow_600SemiBold,
} from '@expo-google-fonts/archivo-narrow'

export const fontsToLoad = {
  Spectral_500Medium, Spectral_600SemiBold,
  Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold,
  ArchivoNarrow_500Medium, ArchivoNarrow_600SemiBold,
}
