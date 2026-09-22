// Presets tipográficos reutilizables (SISTEMA_DE_DISENO.md §1). Se combinan con
// estilos locales; centralizan familia+tamaño+color para no repetirlos por pantalla.
import { TextStyle } from 'react-native'
import { color, font, size } from './tokens'

export const t = {
  // Títulos — Spectral
  title: { fontFamily: font.titleSemi, fontSize: size.title, lineHeight: size.title * 1.15, color: color.ink, letterSpacing: -0.4 } as TextStyle,
  titleSm: { fontFamily: font.titleSemi, fontSize: size.titleSm, lineHeight: size.titleSm * 1.15, color: color.ink, letterSpacing: -0.3 } as TextStyle,
  sheetTitle: { fontFamily: font.titleSemi, fontSize: size.sheetTitle, lineHeight: size.sheetTitle * 1.2, color: color.ink } as TextStyle,
  section: { fontFamily: font.titleSemi, fontSize: size.section, color: color.ink } as TextStyle,

  // Cuerpo — Archivo
  button: { fontFamily: font.bodySemi, fontSize: size.button, color: color.ink } as TextStyle,
  row: { fontFamily: font.bodyMed, fontSize: size.row, lineHeight: size.row * 1.3, color: color.ink } as TextStyle,
  body: { fontFamily: font.body, fontSize: size.body, lineHeight: size.body * 1.55, color: color.ink2 } as TextStyle,
  secondary: { fontFamily: font.body, fontSize: size.secondary, color: color.muted } as TextStyle,
  meta: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong } as TextStyle,
  status: { fontFamily: font.bodySemi, fontSize: size.status, color: color.ink } as TextStyle,

  // Kicker — Archivo Narrow, mayúsculas
  kicker: { fontFamily: font.kickerSemi, fontSize: size.kicker, letterSpacing: 1.5, textTransform: 'uppercase', color: color.mutedStrong } as TextStyle,

  // Monoespaciada — solo códigos escaneables
  code: { fontFamily: font.mono, fontSize: size.secondary, color: color.muted, letterSpacing: 0.5 } as TextStyle,
}
