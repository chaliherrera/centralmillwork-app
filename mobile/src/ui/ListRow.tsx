// Fila de lista — el patrón más usado de la app (SISTEMA_DE_DISENO.md §4).
// button de ancho completo, padding vertical 16, separador hairline abajo, SIN
// fondo ni borde. [thumb 64 opcional] · [título + meta + ● estado] · [chevron].
import React from 'react'
import { Pressable, View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native'
import { color, font, size, space } from '../theme/tokens'
import { StatusDot } from './primitives'
import Icon from './Icon'

interface Props {
  title: string
  meta?: string
  code?: string
  estado?: string | null
  estadoLabel?: string
  estadoColor?: string
  thumb?: React.ReactNode        // miniatura 64px (foto/placeholder) opcional
  right?: React.ReactNode        // contenido alternativo a la derecha (ej. total)
  onPress?: () => void
  chevron?: boolean
  style?: StyleProp<ViewStyle>
}

export default function ListRow({
  title, meta, code, estado, estadoLabel, estadoColor, thumb, right, onPress, chevron = true, style,
}: Props) {
  const showChevron = chevron && !!onPress && !right
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [s.row, thumb ? s.rowTall : null, pressed && onPress ? s.pressed : null, style]}
    >
      {thumb ? <View style={s.thumb}>{thumb}</View> : null}
      <View style={s.body}>
        {code ? <Text style={s.code}>{code}</Text> : null}
        <Text style={s.title} numberOfLines={2}>{title}</Text>
        {meta ? <Text style={s.meta} numberOfLines={1}>{meta}</Text> : null}
        {estado != null || estadoLabel ? (
          <View style={{ marginTop: 6 }}>
            <StatusDot estado={estado} label={estadoLabel} colorOverride={estadoColor} />
          </View>
        ) : null}
      </View>
      {right ? <View style={s.rightWrap}>{right}</View> : null}
      {showChevron ? <Icon name="chevron" size={16} color="#6E665C" strokeWidth={1.8} /> : null}
    </Pressable>
  )
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: space.gapSm,
    paddingVertical: 16, minHeight: 76,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line,
  },
  rowTall: { minHeight: 96 },
  pressed: { opacity: 0.6 },
  thumb: { width: 64, height: 64, borderRadius: 8, overflow: 'hidden', backgroundColor: color.stripeA },
  body: { flex: 1, minWidth: 0 },
  code: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 1, color: color.gold, marginBottom: 3 },
  title: { fontFamily: font.bodyMed, fontSize: size.row, lineHeight: size.row * 1.3, color: color.ink },
  meta: { fontFamily: font.body, fontSize: size.secondary, color: color.mutedStrong, marginTop: 3 },
  rightWrap: { alignItems: 'flex-end', justifyContent: 'center' },
})
