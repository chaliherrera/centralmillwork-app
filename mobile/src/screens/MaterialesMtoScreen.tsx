import React, { useState } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { materialesService, Material } from '../services/materiales'
import {
  Screen, Toolbar, SearchField, Chips, ListRow, LoadingRows, ErrorState, EmptyState,
  color, space,
} from '../ui'

const ESTADOS = ['TODOS', 'PENDIENTE', 'COTIZADO', 'ORDENADO', 'RECIBIDO'] as const
type EstadoFiltro = typeof ESTADOS[number]

export default function MaterialesMtoScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<any>()
  const [search, setSearch] = useState('')
  const [estado, setEstado] = useState<EstadoFiltro>('TODOS')

  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['materiales', estado],
    queryFn: () => materialesService.getMateriales(estado === 'TODOS' ? {} : { estado_cotiz: estado }),
  })

  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((m) =>
    !q || [m.descripcion, m.codigo, m.vendor, m.proyecto?.codigo].some((x) => x?.toLowerCase().includes(q))
  )

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Materiales MTO" onBack={() => nav.goBack()} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Material, código, vendor…" />
          <View style={{ marginTop: 12 }}>
            <Chips options={ESTADOS.map((e) => ({ value: e, label: e === 'TODOS' ? 'Todos' : e.charAt(0) + e.slice(1).toLowerCase() }))} value={estado} onChange={setEstado} />
          </View>
        </View>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar los materiales" onRetry={refetch} />
          : filtered.length === 0 ? <EmptyState title={q ? 'Sin coincidencias' : 'No hay materiales'} line={q ? 'Probá con otro término.' : undefined} />
          : (
            <FlatList
              data={filtered} keyExtractor={(m) => String(m.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.gold} />}
              renderItem={({ item }) => (
                <ListRow
                  code={item.codigo || item.proyecto?.codigo || undefined}
                  title={item.descripcion || 'Sin descripción'}
                  meta={[item.proyecto?.codigo, item.qty != null ? `${item.qty} ${item.unidad || ''}`.trim() : null, item.vendor, item.oc_numero].filter(Boolean).join(' · ')}
                  estado={item.estado_cotiz}
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
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
})
