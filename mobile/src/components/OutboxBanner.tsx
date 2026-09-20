import React, { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { subscribe, getState, retryErrors, OutboxState } from '../services/outbox'

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

// Banner que aparece solo cuando hay acciones de obra esperando sincronizar.
export default function OutboxBanner() {
  const { pendientes, errores } = useOutbox()
  if (pendientes === 0 && errores === 0) return null

  const hayError = errores > 0
  return (
    <View style={[styles.bar, hayError && styles.barError]}>
      <View style={styles.dot} />
      <Text style={styles.text}>
        {pendientes > 0 ? `${pendientes} cambio(s) sin sincronizar` : ''}
        {pendientes > 0 && hayError ? ' · ' : ''}
        {hayError ? `${errores} con error` : ''}
      </Text>
      {hayError && (
        <TouchableOpacity onPress={() => retryErrors()} style={styles.retry}>
          <Text style={styles.retryText}>Reintentar</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#4a3f1c', paddingHorizontal: 15, paddingVertical: 8 },
  barError: { backgroundColor: '#5a2a24' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#E8B84B' },
  text: { color: '#F4E3B0', fontSize: 12, fontWeight: '700', flex: 1 },
  retry: { backgroundColor: '#C18A2D', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  retryText: { color: '#fff', fontSize: 11, fontWeight: '800' },
})
