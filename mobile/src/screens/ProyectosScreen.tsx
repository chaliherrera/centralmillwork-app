import React, { useState } from 'react'
import { View, FlatList, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { proyectosService, Proyecto } from '../services/proyectos'
import type { RootStackParamList } from '../navigation/types'
import { Screen, Toolbar, SearchField, ListRow, LoadingRows, ErrorState, EmptyState, color, space } from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function ProyectosScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<Nav>()
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['proyectos'],
    queryFn: () => proyectosService.getProyectos(),
  })

  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) => !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q)))

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Proyectos" onBack={() => nav.goBack()} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}>
          <SearchField value={search} onChangeText={setSearch} placeholder="Proyecto o cliente…" />
        </View>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar los proyectos" onRetry={refetch} />
          : filtered.length === 0 ? <EmptyState title={q ? 'Sin coincidencias' : 'No hay proyectos'} />
          : (
            <FlatList
              data={filtered} keyExtractor={(p) => String(p.id)}
              contentContainerStyle={styles.list}
              refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.gold} />}
              renderItem={({ item }) => (
                <ListRow
                  code={item.codigo}
                  title={item.nombre}
                  meta={[item.cliente, item.fecha_objetivo ? `entrega ${item.fecha_objetivo}` : null].filter(Boolean).join(' · ')}
                  estado={item.estado}
                  onPress={() => nav.navigate('ControlMto', { proyecto: item })}
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
