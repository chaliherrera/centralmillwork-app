// Navegación de vidrio (SISTEMA_DE_DISENO.md §3): toolbar superior, back circular,
// tab bar flotante (solo raíz), FAB, y la acción contextual (= siguiente paso).
import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, font, size, space, radius, glass, shadowFloat } from '../theme/tokens'
import { GlassFill } from './Glass'
import Icon, { IconName } from './Icon'

// ── Toolbar superior anclada (vidrio, solo borde inferior). Back plano + título +
// subtítulo. `offlineCount` muestra la línea global de sin-conexión (§5).
export function Toolbar({ title, subtitle, onBack, offlineCount }: {
  title: string; subtitle?: string; onBack?: () => void; offlineCount?: number
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.toolbar, { paddingTop: insets.top + 6, minHeight: insets.top + 58 }]}>
      <GlassFill recipe="bar" />
      <View style={styles.barBorder} />
      <View style={styles.toolbarRow}>
        {onBack ? (
          <Pressable onPress={onBack} hitSlop={8} style={({ pressed }) => [styles.backPlain, pressed && styles.press]}>
            <Icon name="back" size={18} color={color.ink} strokeWidth={2} />
          </Pressable>
        ) : null}
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.toolbarTitle} numberOfLines={1}>{title}</Text>
          {offlineCount ? (
            <View style={styles.offlineRow}>
              <View style={[styles.dot, { backgroundColor: color.gold }]} />
              <Text style={styles.offlineText}>{offlineCount} cambio(s) en cola de envío</Text>
            </View>
          ) : subtitle ? (
            <Text style={styles.toolbarSub} numberOfLines={1}>{subtitle}</Text>
          ) : null}
        </View>
      </View>
    </View>
  )
}

// ── Back circular independiente (flota sobre un hero, sin barra).
export function BackButton({ onPress, top }: { onPress: () => void; top?: number }) {
  const insets = useSafeAreaInsets()
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.backCircle, { top: top ?? insets.top + 4 }]}>
      <GlassFill recipe="bar" />
      <Icon name="back" size={12} color={color.ink} strokeWidth={2} />
    </Pressable>
  )
}

// ── Tab bar flotante (solo en 2–3 destinos raíz). Máximo 3 ítems.
export interface TabItem { key: string; label: string; icon: IconName; active?: boolean; onPress: () => void }
export function TabBar({ items }: { items: TabItem[] }) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.tabbar, { bottom: Math.max(insets.bottom, 16) + 8 }]}>
      <GlassFill recipe="floating" />
      <View style={styles.tabRow}>
        {items.slice(0, 3).map((it) => (
          <Pressable key={it.key} onPress={it.onPress} style={styles.tabItem}>
            <Icon name={it.icon} size={21} color={it.active ? color.gold : color.muted} strokeWidth={1.8} />
            <Text style={[styles.tabLabel, { color: it.active ? color.gold : color.muted, fontFamily: it.active ? font.bodySemi : font.bodyMed }]}>
              {it.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  )
}

// ── FAB dorado (pantallas donde la acción es "crear").
export function Fab({ onPress, icon = 'plus' }: { onPress: () => void; icon?: IconName }) {
  const insets = useSafeAreaInsets()
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.fab, { bottom: Math.max(insets.bottom, 16) + 12 }, pressed && styles.pressScale]}>
      <GlassFill recipe="fab" />
      <Icon name={icon} size={24} color={color.onGold} strokeWidth={2.4} />
    </Pressable>
  )
}

// ── Acción contextual = el siguiente paso (kicker + botón dorado que nombra el
// resultado). Reemplaza la tab bar en pantallas de profundidad ≥ 1.
export function ContextualAction({ label, onPress, kicker = 'Siguiente paso', disabled }: {
  label: string; onPress: () => void; kicker?: string; disabled?: boolean
}) {
  const insets = useSafeAreaInsets()
  return (
    <View style={[styles.ctxWrap, { bottom: Math.max(insets.bottom, 16) + 10 }]}>
      <GlassFill recipe="floating" />
      <Text style={styles.ctxKicker}>{kicker}</Text>
      <Pressable onPress={onPress} disabled={disabled} style={({ pressed }) => [styles.ctxBtn, disabled && { opacity: 0.5 }, pressed && styles.pressScale]}>
        <Text style={styles.ctxLabel} numberOfLines={1}>{label}</Text>
        <Icon name="chevron" size={16} color={color.onGold} strokeWidth={2} />
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  toolbar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, overflow: 'hidden' },
  barBorder: { position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: glass.bar.border },
  toolbarRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingBottom: 12 },
  backPlain: { width: 44, height: 44, marginLeft: -10, alignItems: 'center', justifyContent: 'center' },
  toolbarTitle: { fontFamily: font.titleSemi, fontSize: size.section, color: color.ink },
  toolbarSub: { fontFamily: font.body, fontSize: size.status, color: color.muted, marginTop: 2 },
  offlineRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 },
  offlineText: { fontFamily: font.bodyMed, fontSize: size.status, color: color.gold },
  dot: { width: 7, height: 7, borderRadius: 4 },
  press: { opacity: 0.5 },
  pressScale: { opacity: 0.85, transform: [{ scale: 0.98 }] },

  backCircle: {
    position: 'absolute', left: 20, width: 48, height: 48, borderRadius: 24, zIndex: 30,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2, borderColor: glass.bar.border, ...shadowFloat,
  },

  tabbar: {
    position: 'absolute', left: 20, right: 20, height: 66, borderRadius: radius.glassLg, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth * 2, borderColor: glass.floating.border, ...shadowFloat,
  },
  tabRow: { flexDirection: 'row', alignItems: 'center', height: '100%', paddingHorizontal: 8 },
  tabItem: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center', gap: 4 },
  tabLabel: { fontSize: 11 },

  fab: {
    position: 'absolute', right: 22, width: 64, height: 64, borderRadius: 32, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2, borderColor: glass.fab.border, ...shadowFloat,
  },

  ctxWrap: {
    position: 'absolute', left: 20, right: 20, borderRadius: radius.glass, overflow: 'hidden', padding: 8,
    borderWidth: StyleSheet.hairlineWidth * 2, borderColor: glass.floating.border, ...shadowFloat,
  },
  ctxKicker: { fontFamily: font.kickerMed, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: color.muted, marginHorizontal: 12, marginTop: 6, marginBottom: 8 },
  ctxBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 56, paddingHorizontal: 20, borderRadius: radius.pill, backgroundColor: color.gold },
  ctxLabel: { fontFamily: font.bodySemi, fontSize: size.button, color: color.onGold },
})
