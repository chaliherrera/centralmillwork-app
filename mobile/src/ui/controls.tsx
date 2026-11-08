// Controles: CTA dorado (uno por pantalla), botón ghost, campo de formulario,
// segmentado, placeholder de foto. SISTEMA_DE_DISENO.md §4.
import React, { useState } from 'react'
import { Pressable, View, Text, TextInput, StyleSheet, ActivityIndicator, ScrollView, TextInputProps, StyleProp, ViewStyle } from 'react-native'
import { color, font, size, radius, space } from '../theme/tokens'
import Icon, { IconName } from './Icon'

// ── CTA primario dorado (tercio inferior, nombra el resultado).
export function PrimaryButton({ label, onPress, icon, loading, disabled, tall, style }: {
  label: string; onPress: () => void; icon?: IconName; loading?: boolean; disabled?: boolean; tall?: boolean; style?: StyleProp<ViewStyle>
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled || loading}
      style={({ pressed }) => [s.primary, { height: tall ? 60 : 56 }, (disabled || loading) && { opacity: 0.5 }, pressed && s.pressScale, style]}>
      {loading ? <ActivityIndicator color={color.onGold} /> : (
        <>
          {icon ? <Icon name={icon} size={20} color={color.onGold} strokeWidth={2.4} /> : null}
          <Text style={s.primaryText}>{label}</Text>
        </>
      )}
    </Pressable>
  )
}

// ── Acción secundaria: texto, sin caja, 52px.
export function GhostButton({ label, onPress, tone }: { label: string; onPress: () => void; tone?: 'coral' }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.ghost, pressed && { opacity: 0.6 }]}>
      <Text style={[s.ghostText, tone === 'coral' && { color: color.coral }]}>{label}</Text>
    </Pressable>
  )
}

// ── Campo de formulario: label mayúscula + input 56px, foco = borde dorado.
export function Field({ label, error, style, multiline, ...rest }: {
  label?: string; error?: string; style?: StyleProp<ViewStyle>
} & TextInputProps) {
  const [focus, setFocus] = useState(false)
  return (
    <View style={style}>
      {label ? <Text style={s.fieldLabel}>{label}</Text> : null}
      <TextInput
        placeholderTextColor={color.mutedStrong}
        {...rest}
        multiline={multiline}
        onFocus={(e) => { setFocus(true); rest.onFocus?.(e) }}
        onBlur={(e) => { setFocus(false); rest.onBlur?.(e) }}
        style={[
          s.input,
          multiline && { height: undefined, minHeight: 110, paddingTop: 14, textAlignVertical: 'top' },
          focus && s.inputFocus,
          !!error && { borderColor: color.coral },
        ]}
      />
      {error ? (
        <View style={s.errRow}>
          <Icon name="alert" size={13} color={color.coral} strokeWidth={2} />
          <Text style={s.errText}>{error}</Text>
        </View>
      ) : null}
    </View>
  )
}

// ── Segmentado 2–3 opciones (52px). Activo = tinte dorado suave (no segundo CTA).
export function Segmented<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && s.segItemOn]}>
            <Text style={[s.segText, on && s.segTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

// ── Buscador en flujo (no flotante): ícono + input, hairline, sin blur.
export function SearchField({ value, onChangeText, placeholder }: {
  value: string; onChangeText: (v: string) => void; placeholder?: string
}) {
  return (
    <View style={s.searchWrap}>
      <Icon name="search" size={18} color={color.mutedStrong} strokeWidth={1.8} />
      <TextInput
        value={value} onChangeText={onChangeText} placeholder={placeholder}
        placeholderTextColor={color.mutedStrong} style={s.searchInput}
        autoCapitalize="none" autoCorrect={false} returnKeyType="search"
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8}><Icon name="x" size={16} color={color.mutedStrong} strokeWidth={2} /></Pressable>
      ) : null}
    </View>
  )
}

// ── Chips de filtro horizontales (activo = tinte dorado suave).
export function Chips<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
      {options.map((o) => {
        const on = o.value === value
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && s.chipOn]}>
            <Text style={[s.chipText, on && s.chipTextOn]}>{o.label}</Text>
          </Pressable>
        )
      })}
    </ScrollView>
  )
}

// ── Placeholder de foto (franja). Real photos lo reemplazan.
export function StripePlaceholder({ height = 150, label = '[ foto ]', style }: { height?: number; label?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.stripe, { height }, style]}>
      <Text style={s.stripeLabel}>{label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  primary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: color.gold, borderRadius: radius.button },
  primaryText: { fontFamily: font.bodySemi, fontSize: 17, color: color.onGold },
  pressScale: { opacity: 0.9, transform: [{ scale: 0.98 }] },
  ghost: { height: 52, alignItems: 'center', justifyContent: 'center' },
  ghostText: { fontFamily: font.bodyMed, fontSize: size.body, color: color.muted },

  fieldLabel: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: color.mutedStrong, marginBottom: 8 },
  input: {
    height: 56, borderRadius: radius.input, backgroundColor: 'rgba(245,240,232,0.06)',
    borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.14)',
    paddingHorizontal: 16, color: color.ink, fontFamily: font.body, fontSize: 16,
  },
  inputFocus: { borderColor: color.gold, borderWidth: 2 },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  errText: { fontFamily: font.body, fontSize: size.secondary, color: color.coral },

  seg: { flexDirection: 'row', gap: 6, backgroundColor: 'rgba(245,240,232,0.05)', borderRadius: radius.input, padding: 4 },
  segItem: { flex: 1, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  segItemOn: { backgroundColor: 'rgba(217,164,65,0.18)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(217,164,65,0.5)' },
  segText: { fontFamily: font.bodyMed, fontSize: size.secondary, color: color.muted },
  segTextOn: { color: color.gold, fontFamily: font.bodySemi },

  stripe: { borderRadius: radius.image, backgroundColor: color.stripeA, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  stripeLabel: { fontFamily: font.mono, fontSize: 11, color: color.muted },

  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: radius.input, backgroundColor: 'rgba(245,240,232,0.06)', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.14)' },
  searchInput: { flex: 1, minWidth: 0, height: '100%', color: color.ink, fontFamily: font.body, fontSize: 16 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { height: 38, paddingHorizontal: 15, borderRadius: 19, alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.14)' },
  chipOn: { backgroundColor: 'rgba(217,164,65,0.18)', borderColor: 'rgba(217,164,65,0.5)' },
  chipText: { fontFamily: font.bodyMed, fontSize: size.secondary, color: color.muted },
  chipTextOn: { color: color.gold, fontFamily: font.bodySemi },
})
