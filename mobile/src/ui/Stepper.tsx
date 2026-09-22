// Stepper de proceso (SISTEMA_DE_DISENO.md §4). Círculos 30px unidos por línea 2px.
// done = relleno verde + check · current = borde dorado + número · todo = gris.
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import { color, font } from '../theme/tokens'

export type StepState = 'done' | 'current' | 'todo'
export interface Step { name: string; state: StepState }

const GREEN_LINE = 'rgba(111,191,139,0.5)'
const IDLE_LINE = 'rgba(245,240,232,0.14)'

export default function Stepper({ steps }: { steps: Step[] }) {
  // índice del actual (o del último done) para pintar los conectores.
  const currentIdx = steps.findIndex((s) => s.state === 'current')
  const doneUntil = currentIdx >= 0 ? currentIdx : steps.filter((s) => s.state === 'done').length - 1

  return (
    <View style={s.row}>
      {steps.map((st, i) => {
        const c = st.state === 'done' ? color.green : st.state === 'current' ? color.gold : color.grey
        const leftLine = i === 0 ? 'transparent' : (i <= doneUntil ? GREEN_LINE : IDLE_LINE)
        const rightLine = i === steps.length - 1 ? 'transparent' : (i < doneUntil ? GREEN_LINE : IDLE_LINE)
        return (
          <View key={i} style={s.col}>
            <View style={s.lineRow}>
              <View style={[s.line, { backgroundColor: leftLine }]} />
              <View style={[s.circle, { borderColor: c, backgroundColor: st.state === 'done' ? color.green : 'transparent' }]}>
                {st.state === 'done' ? (
                  <Svg width={14} height={14} viewBox="0 0 22 22"><Polyline points="4,11 9,16 18,6" stroke={color.onGold} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" /></Svg>
                ) : (
                  <Text style={[s.num, { color: c }]}>{i + 1}</Text>
                )}
              </View>
              <View style={[s.line, { backgroundColor: rightLine }]} />
            </View>
            <Text style={[s.label, { color: c }]} numberOfLines={2}>{st.name}</Text>
          </View>
        )
      })}
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row' },
  col: { flex: 1, alignItems: 'center', gap: 9 },
  lineRow: { flexDirection: 'row', alignItems: 'center', width: '100%' },
  line: { flex: 1, height: 2 },
  circle: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  num: { fontFamily: font.bodyBold, fontSize: 12 },
  label: { fontFamily: font.bodyMed, fontSize: 11.5, textAlign: 'center', maxWidth: 76, lineHeight: 14 },
})
