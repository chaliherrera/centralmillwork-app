// Estados y avisos: toast (vidrio), vacío, cargando (skeleton), error. Reemplaza
// States.tsx con el sistema. SISTEMA_DE_DISENO.md §4.
import React, { useEffect, useRef } from 'react'
import { Animated, View, Text, StyleSheet, ActivityIndicator, Pressable } from 'react-native'
import { color, font, size, space, motion, radius, glass, shadowFloat } from '../theme/tokens'
import { t } from '../theme/text'
import { GlassFill } from './Glass'
import Icon from './Icon'

// ── Toast de vidrio con hairline del color del estado. 2.6s, autodesaparece.
export function Toast({ message, tone = 'success', onDone }: {
  message: string; tone?: 'success' | 'error'; onDone?: () => void
}) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => {
    Animated.timing(a, { toValue: 1, duration: 260, useNativeDriver: true }).start()
    const timer = setTimeout(() => {
      Animated.timing(a, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => onDone?.())
    }, motion.toast - 500)
    return () => clearTimeout(timer)
  }, [])
  const borderColor = tone === 'error' ? color.coral : color.green
  return (
    <Animated.View style={[styles.toast, { opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }]}>
      <View style={[styles.toastInner, { borderColor }]}>
        <GlassFill recipe="sheet" />
        <Icon name={tone === 'error' ? 'alert' : 'check'} size={18} color={borderColor} strokeWidth={2.2} />
        <Text style={styles.toastText}>{message}</Text>
      </View>
    </Animated.View>
  )
}

// ── Estado vacío: sin ilustración. Título Spectral + una línea + (acción opcional).
export function EmptyState({ title, line, action }: { title: string; line?: string; action?: React.ReactNode }) {
  return (
    <View style={styles.center}>
      <Text style={[t.section, { textAlign: 'center' }]}>{title}</Text>
      {line ? <Text style={[t.secondary, { textAlign: 'center', marginTop: 6 }]}>{line}</Text> : null}
      {action ? <View style={{ marginTop: 18 }}>{action}</View> : null}
    </View>
  )
}

// ── Cargando: skeletons planos con pulso (no spinner a pantalla completa).
export function LoadingRows({ count = 5 }: { count?: number }) {
  const a = useRef(new Animated.Value(0.4)).current
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.timing(a, { toValue: 0.4, duration: 600, useNativeDriver: true }),
    ])).start()
  }, [])
  return (
    <View>
      {Array.from({ length: count }).map((_, i) => (
        <View key={i} style={styles.skelRow}>
          <Animated.View style={[styles.skelLine, { width: '55%', opacity: a }]} />
          <Animated.View style={[styles.skelLine, { width: '80%', opacity: a, marginTop: 8 }]} />
        </View>
      ))}
    </View>
  )
}

// Spinner puntual (solo bloqueo real).
export function Spinner() {
  return <View style={styles.center}><ActivityIndicator size="large" color={color.gold} /></View>
}

// ── Error: mensaje claro + "Reintentar".
export function ErrorState({ message, onRetry }: { message?: string; onRetry?: () => void }) {
  return (
    <View style={styles.center}>
      <Icon name="alert" size={26} color={color.coral} strokeWidth={2} />
      <Text style={[t.body, { textAlign: 'center', marginTop: 10 }]}>{message ?? 'Algo salió mal.'}</Text>
      {onRetry ? (
        <Pressable onPress={onRetry} style={({ pressed }) => [styles.retry, pressed && { opacity: 0.85 }]}>
          <Icon name="refresh" size={16} color={color.onGold} strokeWidth={2} />
          <Text style={styles.retryText}>Reintentar</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  toast: { position: 'absolute', left: space.margin, right: space.margin, bottom: 110, zIndex: 60 },
  toastInner: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 18,
    borderRadius: radius.image, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth * 2, ...shadowFloat,
  },
  toastText: { fontFamily: font.bodyMed, fontSize: 14.5, color: color.ink, flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.margin, minHeight: 200 },
  skelRow: { paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  skelLine: { height: 12, borderRadius: 6, backgroundColor: 'rgba(245,240,232,0.06)' },
  retry: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, backgroundColor: color.gold, paddingHorizontal: 18, height: 48, borderRadius: radius.button, justifyContent: 'center' },
  retryText: { fontFamily: font.bodySemi, fontSize: size.button, color: color.onGold },
})
