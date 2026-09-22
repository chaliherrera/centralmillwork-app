import React, { useEffect, useState } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { subscribe, getState, retryErrors, OutboxState } from '../services/outbox'
import { color, font } from '../theme/tokens'

export function useOutbox() {
  const [state, setState] = useState<OutboxState>({ pendientes: 0, errores: 0 })
  useEffect(() => {
    let mounted = true
    const refresh = () => { getState().then((s) => { if (mounted) setState(s) }).catch(() => {}) }
    refresh()
    const unsub = subscribe(refresh)
    return () => { mounted = false; unsub() }
  }, [])
  return state
}

// Banner slim (solo cuando hay errores de sincronización): hairline coral + Reintentar.
// Los pendientes normales se muestran en la línea de la Toolbar (offlineCount).
export default function OutboxBanner() {
  const { errores } = useOutbox()
  if (errores === 0) return null
  return (
    <View style={styles.bar}>
      <View style={styles.dot} />
      <Text style={styles.text}>{errores} cambio(s) con error de envío</Text>
      <Pressable onPress={() => retryErrors()} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}>
        <Text style={styles.retryText}>Reintentar</Text>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(240,128,106,0.5)',
    backgroundColor: 'rgba(240,128,106,0.08)',
  },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.coral },
  text: { color: color.ink, fontFamily: font.bodyMed, fontSize: 12.5, flex: 1 },
  retry: { borderRadius: 8, paddingHorizontal: 12, height: 32, justifyContent: 'center', backgroundColor: color.gold },
  retryText: { color: color.onGold, fontFamily: font.bodySemi, fontSize: 12 },
})
