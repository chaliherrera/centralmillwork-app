import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ordenesCompraService, OrdenCompra, OCFiltro } from '../services/ordenesCompra'
import { Cargando, ErrorBox, Vacio } from '../components/States'
import type { RootStackParamList } from '../navigation/types'

const TABS: { label: string; filtro: OCFiltro }[] = [
  { label: 'Ordenado', filtro: { estado_display: 'ORDENADO' } },
  { label: 'En tránsito', filtro: { estado_display: 'EN_TRANSITO' } },
  { label: 'En taller', filtro: { estado_display: 'EN_EL_TALLER' } },
  { label: 'Todas', filtro: {} },
]

const BADGE: Record<string, { bg: string; fg: string; label: string }> = {
  ORDENADO:    { bg: '#FAF3E3', fg: '#7d5c00', label: 'ORDENADO' },
  EN_TRANSITO: { bg: '#E8F4FA', fg: '#25627c', label: 'EN TRÁNSITO' },
  EN_EL_TALLER:{ bg: '#F0F7E8', fg: '#2f6a12', label: 'EN TALLER' },
  CANCELADA:   { bg: '#FBEBEA', fg: '#B4463C', label: 'CANCELADA' },
}

function money(s: string) { const n = parseFloat(s); return isNaN(n) ? s : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function OrdenesCompraScreen() {
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [tab, setTab] = useState(0)
  const [search, setSearch] = useState('')

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['ordenes-compra', tab],
    queryFn: () => ordenesCompraService.getOrdenes(TABS[tab].filtro),
  })

  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((o) =>
    !q || [o.numero, o.proveedor?.nombre, o.proyecto?.codigo, o.proyecto?.nombre].some((x) => x?.toLowerCase().includes(q))
  )

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <View style={styles.accRow}>
          <TouchableOpacity style={[styles.generarBtn, { flex: 1 }]} onPress={() => nav.navigate('NuevaCompra')}>
            <Text style={styles.generarText}>＋ Compra sin MTO</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.generarBtn, styles.generarBtnAlt, { flex: 1 }]} onPress={() => nav.navigate('GenerarOC')}>
            <Text style={styles.generarTextAlt}>Emitir OC cotizada</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Buscar OC, vendor o proyecto…" placeholderTextColor="#999" style={styles.search}
        />
        <View style={styles.tabs}>
          {TABS.map((t, i) => (
            <TouchableOpacity key={t.label} onPress={() => setTab(i)} style={[styles.tab, tab === i && styles.tabOn]}>
              <Text style={[styles.tabText, tab === i && styles.tabTextOn]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {isLoading ? <Cargando />
        : isError ? <ErrorBox mensaje="No se pudieron cargar las OCs" onRetry={refetch} />
        : filtered.length === 0 ? <Vacio mensaje={q ? 'Sin coincidencias' : 'No hay OCs en este estado'} />
        : (
          <FlatList
            data={filtered} keyExtractor={(o) => String(o.id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#C18A2D" />}
            renderItem={({ item }) => <OCCard oc={item} />}
          />
        )}
      {/* Nota Fase 0: solo consulta. Procesar (cotizar / generar OC) llega en Fase 2. */}
    </View>
  )
}

function OCCard({ oc }: { oc: OrdenCompra }) {
  const b = BADGE[oc.estado_display] ?? { bg: '#EEE', fg: '#555', label: oc.estado_display }
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.numero}>{oc.numero}</Text>
        <View style={[styles.badge, { backgroundColor: b.bg }]}><Text style={[styles.badgeText, { color: b.fg }]}>{b.label}</Text></View>
      </View>
      <Text style={styles.prov}>{oc.proveedor?.nombre || 'Sin vendor'}</Text>
      <Text style={styles.proy} numberOfLines={1}>{oc.proyecto?.codigo} · {oc.proyecto?.nombre}</Text>
      <View style={styles.foot}>
        <Text style={styles.fecha}>{oc.fecha_entrega_estimada ? `ETA ${oc.fecha_entrega_estimada}` : 'Sin ETA'}</Text>
        <Text style={styles.total}>${money(oc.total)}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  accRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  generarBtn: { backgroundColor: '#2c3126', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  generarText: { color: '#E8C684', fontWeight: '800', fontSize: 13 },
  generarBtnAlt: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#C18A2D' },
  generarTextAlt: { color: '#C18A2D', fontWeight: '800', fontSize: 13 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#E0DFD9', color: '#1F2419' },
  tabs: { flexDirection: 'row', gap: 7, marginTop: 10, flexWrap: 'wrap' },
  tab: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0DFD9', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  tabOn: { backgroundColor: '#2c3126', borderColor: '#2c3126' },
  tabText: { fontSize: 12, fontWeight: '700', color: '#5A5F52' },
  tabTextOn: { color: '#E8C684' },
  list: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 9, borderLeftWidth: 4, borderLeftColor: '#C18A2D' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  numero: { fontFamily: 'Courier', fontSize: 14, fontWeight: '700', color: '#2c3126' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  prov: { fontSize: 14, fontWeight: '600', color: '#1F2419', marginTop: 2 },
  proy: { fontSize: 12, color: '#5A5F52', marginTop: 2 },
  foot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 9 },
  fecha: { fontSize: 12, color: '#5A5F52' },
  total: { fontSize: 15, fontWeight: '800', color: '#C18A2D' },
})
