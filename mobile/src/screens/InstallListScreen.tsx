import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { scheduleService, InstallProyecto } from '../services/schedule'
import OutboxBanner, { useOutbox } from '../components/OutboxBanner'
import {
  Screen, Toolbar, Stepper, StatusDot, LoadingRows, ErrorState, EmptyState,
  color, font, size, space, type Step,
} from '../ui'

interface Props {
  onSelect: (p: InstallProyecto) => void
  onBack: () => void
}

// Etapas de instalación en orden, para el mini-stepper de cada obra.
const PASOS: { codigo: string; label: string }[] = [
  { codigo: 'I-04', label: 'Check-in' },
  { codigo: 'I-05', label: 'Avance' },
  { codigo: 'I-06', label: 'Punch' },
  { codigo: 'I-07', label: 'Entrega' },
]

export default function InstallListScreen({ onSelect, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const { pendientes } = useOutbox()
  const [items, setItems] = useState<InstallProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      setItems(await scheduleService.getInstallQueue())
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo cargar la cola de instalación')
    } finally {
      setLoading(false); setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  const onRefresh = () => { setRefreshing(true); fetchData() }

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Obras por instalar" subtitle={`${items.length} con entrega pendiente`} onBack={onBack} offlineCount={pendientes} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <OutboxBanner />
        {loading ? (
          <View style={styles.pad}><LoadingRows count={4} /></View>
        ) : error ? (
          <ErrorState message={error} onRetry={fetchData} />
        ) : items.length === 0 ? (
          <EmptyState title="Sin obras por instalar" line="Las que entren en ventana de instalación aparecen acá." />
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.proyecto_id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.gold} />}
            renderItem={({ item }) => <InstallRow p={item} onPress={() => onSelect(item)} />}
          />
        )}
      </View>
    </Screen>
  )
}

function InstallRow({ p, onPress }: { p: InstallProyecto; onPress: () => void }) {
  const done = new Set(p.hitos.filter((h) => h.fecha_real).map((h) => h.codigo))
  const firstUndone = PASOS.findIndex((s) => !done.has(s.codigo))
  const steps: Step[] = PASOS.map((paso, i) => ({
    name: paso.label,
    state: done.has(paso.codigo) ? 'done' : i === firstUndone ? 'current' : 'todo',
  }))

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.rowHead}>
        <Text style={styles.code}>{p.codigo}</Text>
        {p.punch_abiertos > 0 ? <StatusDot colorOverride={color.coral} label={`${p.punch_abiertos} punch`} /> : null}
      </View>
      <Text style={styles.nombre} numberOfLines={1}>{p.nombre}</Text>
      {p.cliente ? <Text style={styles.meta} numberOfLines={1}>{p.cliente}</Text> : null}

      <View style={styles.stepper}><Stepper steps={steps} /></View>

      <Text style={styles.footer}>
        {p.items_total > 0 ? `${p.items_instalados}/${p.items_total} ítems · ` : ''}
        {p.fecha_objetivo ? `entrega ${p.fecha_objetivo}` : 'sin fecha objetivo'}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
  row: { paddingVertical: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  code: { fontFamily: font.kickerSemi, fontSize: 12, letterSpacing: 1, color: color.gold },
  nombre: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },
  meta: { fontFamily: font.body, fontSize: size.secondary, color: color.mutedStrong, marginTop: 3 },
  stepper: { marginTop: 16, marginBottom: 4 },
  footer: { fontFamily: font.body, fontSize: size.status, color: color.muted, marginTop: 10 },
})
