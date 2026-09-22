import React, { useState } from 'react'
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { ordenesCompraService, OrdenCompra, OCFiltro } from '../services/ordenesCompra'
import type { RootStackParamList } from '../navigation/types'
import {
  Screen, Toolbar, SearchField, Chips, ListRow, Icon, LoadingRows, ErrorState, EmptyState,
  color, font, size, space,
} from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

const TABS: { value: string; label: string; filtro: OCFiltro }[] = [
  { value: 'ORDENADO', label: 'Ordenado', filtro: { estado_display: 'ORDENADO' } },
  { value: 'EN_TRANSITO', label: 'En tránsito', filtro: { estado_display: 'EN_TRANSITO' } },
  { value: 'EN_EL_TALLER', label: 'En taller', filtro: { estado_display: 'EN_EL_TALLER' } },
  { value: 'TODAS', label: 'Todas', filtro: {} },
]

function money(s: string) { const n = parseFloat(s); return isNaN(n) ? s : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function OrdenesCompraScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<Nav>()
  const [tab, setTab] = useState('ORDENADO')
  const [search, setSearch] = useState('')

  const tabDef = TABS.find((t) => t.value === tab) ?? TABS[0]
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['ordenes-compra', tab],
    queryFn: () => ordenesCompraService.getOrdenes(tabDef.filtro),
  })

  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((o) =>
    !q || [o.numero, o.proveedor?.nombre, o.proyecto?.codigo, o.proyecto?.nombre].some((x) => x?.toLowerCase().includes(q))
  )

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Órdenes de Compra" onBack={() => nav.goBack()} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}>
          <View style={styles.actions}>
            <Pressable onPress={() => nav.navigate('NuevaCompra')} style={({ pressed }) => [styles.actBtn, styles.actGold, pressed && { opacity: 0.7 }]}>
              <Icon name="plus" size={16} color={color.onGold} strokeWidth={2.4} />
              <Text style={[styles.actText, { color: color.onGold }]}>Compra sin MTO</Text>
            </Pressable>
            <Pressable onPress={() => nav.navigate('GenerarOC')} style={({ pressed }) => [styles.actBtn, styles.actGhost, pressed && { opacity: 0.6 }]}>
              <Icon name="doc" size={16} color={color.gold} strokeWidth={1.8} />
              <Text style={[styles.actText, { color: color.gold }]}>Emitir OC cotizada</Text>
            </Pressable>
          </View>
          <SearchField value={search} onChangeText={setSearch} placeholder="OC, vendor o proyecto…" />
          <View style={{ marginTop: 12 }}>
            <Chips options={TABS.map((t) => ({ value: t.value, label: t.label }))} value={tab} onChange={setTab} />
          </View>
        </View>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar las OCs" onRetry={refetch} />
          : filtered.length === 0 ? <EmptyState title={q ? 'Sin coincidencias' : 'No hay OCs en este estado'} />
          : (
            <FlatList
              data={filtered} keyExtractor={(o) => String(o.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.gold} />}
              renderItem={({ item }) => (
                <ListRow
                  code={item.numero}
                  title={item.proveedor?.nombre || 'Sin vendor'}
                  meta={[`${item.proyecto?.codigo ?? ''} ${item.proyecto?.nombre ?? ''}`.trim(), item.fecha_entrega_estimada ? `ETA ${item.fecha_entrega_estimada}` : null].filter(Boolean).join(' · ')}
                  estado={item.estado_display}
                  right={<Text style={styles.total}>${money(item.total)}</Text>}
                  chevron={false}
                />
              )}
            />
          )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.margin, paddingTop: 8, paddingBottom: 8 },
  actions: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, height: 48, borderRadius: 16 },
  actGold: { backgroundColor: color.gold },
  actGhost: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(217,164,65,0.5)' },
  actText: { fontFamily: font.bodySemi, fontSize: size.secondary },
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
  total: { fontFamily: font.bodyBold, fontSize: size.row, color: color.gold },
})
