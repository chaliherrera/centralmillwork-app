// Superficie de vidrio (SISTEMA_DE_DISENO.md §2 — la regla más importante).
// Vidrio SOLO en nav/controles/sheet/FAB/toast. En RN el blur lo hace <BlurView>.
// Fallback a sólido `#282320` si el device no soporta blur o hay "reducir
// transparencia" activado (manteniendo borde y sombra).
import React, { useEffect, useState } from 'react'
import { AccessibilityInfo, StyleSheet, View, ViewStyle } from 'react-native'
import { BlurView } from 'expo-blur'
import { glass, shadowFloat } from '../theme/tokens'

type Recipe = keyof Pick<typeof glass, 'floating' | 'bar' | 'sheet' | 'fab'>

interface Props {
  recipe: Recipe
  style?: ViewStyle | ViewStyle[]
  radius?: number
  shadow?: boolean
  children?: React.ReactNode
}

/** Capas de vidrio (blur + tinte) en absoluteFill, para superficies con forma/borde
 * propios (toolbar anclada, FAB circular). Respeta "reducir transparencia". */
export function GlassFill({ recipe }: { recipe: Recipe }) {
  const reduce = useReduceTransparency()
  const r = glass[recipe]
  if (reduce) return <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.solid }]} />
  return (
    <>
      <BlurView intensity={r.intensity} tint={r.tint} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: r.overlay }]} />
    </>
  )
}

/** Detecta "reducir transparencia" (accesibilidad) para caer a sólido. */
function useReduceTransparency(): boolean {
  const [reduce, setReduce] = useState(false)
  useEffect(() => {
    let alive = true
    AccessibilityInfo.isReduceTransparencyEnabled?.().then((v) => { if (alive) setReduce(!!v) })
    const sub = AccessibilityInfo.addEventListener('reduceTransparencyChanged', setReduce)
    return () => { alive = false; sub?.remove?.() }
  }, [])
  return reduce
}

export default function Glass({ recipe, style, radius = 30, shadow = true, children }: Props) {
  const reduce = useReduceTransparency()
  const r = glass[recipe]
  const border = { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: r.border, borderRadius: radius }

  return (
    <View style={[shadow && shadowFloat, { borderRadius: radius }, style]}>
      <View style={[StyleSheet.absoluteFill, border, { overflow: 'hidden' }]}>
        {reduce ? (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: glass.solid }]} />
        ) : (
          <>
            <BlurView intensity={r.intensity} tint={r.tint} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, { backgroundColor: r.overlay }]} />
          </>
        )}
      </View>
      {children}
    </View>
  )
}
