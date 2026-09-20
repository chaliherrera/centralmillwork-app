import React from 'react'
import { View, Text, ActivityIndicator, TouchableOpacity, StyleSheet } from 'react-native'

export function Cargando() {
  return <View style={s.box}><ActivityIndicator size="large" color="#C18A2D" /></View>
}

export function ErrorBox({ mensaje, onRetry }: { mensaje: string; onRetry?: () => void }) {
  return (
    <View style={s.box}>
      <Text style={s.err}>{mensaje}</Text>
      {onRetry && (
        <TouchableOpacity onPress={onRetry} style={s.retry}>
          <Text style={s.retryText}>Reintentar</Text>
        </TouchableOpacity>
      )}
    </View>
  )
}

export function Vacio({ mensaje }: { mensaje: string }) {
  return <View style={s.box}><Text style={s.empty}>{mensaje}</Text></View>
}

const s = StyleSheet.create({
  box: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  err: { color: '#B4463C', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retry: { backgroundColor: '#C18A2D', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '700' },
  empty: { color: '#5A5F52', fontSize: 14, textAlign: 'center' },
})
