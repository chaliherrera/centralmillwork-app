import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ordenesCompraService, OrdenCompra } from '../services/ordenesCompra'
import { EtaBadge } from '../components/EtaBadge'
import {
  Screen, Toolbar, SearchField, StatusDot, LoadingRows, ErrorState, EmptyState,
  color, font, size, space,
} from '../ui'

interface Props {
  onSelect: (oc: OrdenCompra) => void
  onBack: () => void
}

function money(s: string): string { const n = parseFloat(s); return isNaN(n) ? s : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function OCsListScreen({ onSelect, onBack }: Props) {
  const insets = useSafeAreaInsets()
  const [ocs, setOcs] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const data = await ordenesCompraService.getPendientesRecepcion()
      data.sort((a, b) => (b.fecha_emision || '').localeCompare(a.fecha_emision || ''))
      setOcs(data)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al cargar OCs')
    } finally { setLoading(false); setRefreshing(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  const onRefresh = () => { setRefreshing(true); fetchData() }

  const q = search.toLowerCase().trim()
  const filtered = ocs.filter((oc) => !q || [oc.numero, oc.proveedor?.nombre, oc.proyecto?.nombre, oc.proyecto?.codigo].some((x) => x?.toLowerCase().includes(q)))

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Recepciones" subtitle={`${filtered.length} OCs por recibir`} onBack={onBack} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}><SearchField value={search} onChangeText={setSearch} placeholder="Número, vendor o proyecto…" /></View>
        {loading ? <View style={styles.pad}><LoadingRows /></View>
          : error ? <ErrorState message={error} onRetry={fetchData} />
          : filtered.length === 0 ? <EmptyState title={q ? 'Sin coincidencias' : 'Nada por recibir'} line={q ? undefined : 'No hay OCs pendientes de recepción.'} />
          : (
            <FlatList
              data={filtered} keyExtractor={(item) => String(item.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={color.gold} />}
              renderItem={({ item }) => <Row oc={item} onPress={() => onSelect(item)} />}
            />
          )}
      </View>
    </Screen>
  )
}

function Row({ oc, onPress }: { oc: OrdenCompra; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.head}>
        <Text style={styles.code}>{oc.numero}</Text>
        <StatusDot estado={oc.estado_display} />
      </View>
      <Text style={styles.prov}>{oc.proveedor?.nombre || 'Sin vendor'}</Text>
      <Text style={styles.proy} numberOfLines={1}>{oc.proyecto?.codigo} · {oc.proyecto?.nombre}</Text>
      <View style={styles.foot}>
        <EtaBadge eta={oc.fecha_entrega_estimada} />
        <Text style={styles.total}>${money(oc.total)}</Text>
      </View>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.margin, paddingTop: 8, paddingBottom: 8 },
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
  row: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  code: { fontFamily: font.kickerSemi, fontSize: 12, letterSpacing: 1, color: color.gold },
  prov: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },
  proy: { fontFamily: font.body, fontSize: size.secondary, color: color.mutedStrong, marginTop: 3 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 },
  total: { fontFamily: font.bodyBold, fontSize: size.row, color: color.gold },
})
