// Primitivas planas de contenido (nunca vidrio): estado ●+palabra, kicker,
// encabezado de sección, métrica/progreso, separador.
import React from 'react'
import { View, Text, StyleSheet, TextStyle, ViewStyle } from 'react-native'
import { color, space, font, size } from '../theme/tokens'
import { t } from '../theme/text'
import { estadoInfo } from '../theme/estado'

// ── Estado: ● 7px + palabra 12.5px/600 del color del estado (nunca chip tintado).
export function StatusDot({ estado, colorOverride, label }: { estado?: string | null; colorOverride?: string; label?: string }) {
  const info = estadoInfo(estado)
  const c = colorOverride ?? info.color
  return (
    <View style={s.statusRow}>
      <View style={[s.dot, { backgroundColor: c }]} />
      <Text style={[s.statusText, { color: color.ink }]}>{label ?? info.label}</Text>
    </View>
  )
}

// ── Kicker: label mayúscula Archivo Narrow.
export function Kicker({ children, style }: { children: React.ReactNode; style?: TextStyle }) {
  return <Text style={[t.kicker, style]}>{children}</Text>
}

// ── Encabezado de sección: Spectral 19 + contador opcional a la derecha.
export function SectionHeader({ title, count, style }: { title: string; count?: number | string; style?: ViewStyle }) {
  return (
    <View style={[s.sectionRow, style]}>
      <Text style={t.section}>{title}</Text>
      {count != null && <Text style={s.count}>{count}</Text>}
    </View>
  )
}

// ── Métrica + barra de progreso (relleno sólido dorado, o verde al 100%).
export function Progress({ label, pct }: { label: string; pct: number }) {
  const clamped = Math.max(0, Math.min(100, Math.round(pct)))
  const fill = clamped >= 100 ? color.green : color.gold
  return (
    <View>
      <View style={s.progressHead}>
        <Text style={s.progressLabel}>{label}</Text>
        <Text style={[s.progressPct, { color: fill }]}>{clamped}%</Text>
      </View>
      <View style={s.track}>
        <View style={[s.trackFill, { width: `${clamped}%`, backgroundColor: fill }]} />
      </View>
    </View>
  )
}

// ── Separador hairline (reemplaza tarjetas).
export function Divider({ style }: { style?: ViewStyle }) {
  return <View style={[s.divider, style]} />
}

const s = StyleSheet.create({
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontFamily: font.bodySemi, fontSize: size.status },
  sectionRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  count: { fontFamily: font.body, fontSize: 12, color: color.mutedStrong },
  progressHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 10 },
  progressLabel: { fontFamily: font.body, fontSize: size.secondary, color: color.muted },
  progressPct: { fontFamily: font.titleSemi, fontSize: 22 },
  track: { height: 8, borderRadius: 4, backgroundColor: 'rgba(245,240,232,0.12)', overflow: 'hidden' },
  trackFill: { height: '100%', borderRadius: 4 },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.line },
})
