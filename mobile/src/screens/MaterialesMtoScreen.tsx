import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { materialesService, Material } from '../services/materiales'
import { Cargando, ErrorBox, Vacio } from '../components/States'

const ESTADOS = ['TODOS', 'PENDIENTE', 'COTIZADO', 'ORDENADO', 'RECIBIDO'] as const
type EstadoFiltro = typeof ESTADOS[number]

const COLOR: Record<string, { bg: string; fg: string }> = {
  PENDIENTE: { bg: '#FBEBEA', fg: '#B4463C' },
  COTIZADO:  { bg: '#FAF3E3', fg: '#7d5c00' },
  ORDENADO:  { bg: '#E8F4FA', fg: '#25627c' },
  RECIBIDO:  { bg: '#F0F7E8', fg: '#2f6a12' },
  EN_STOCK:  { bg: '#F0F7E8', fg: '#2f6a12' },
}

export default function MaterialesMtoScreen() {
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
    <View style={styles.container}>
      <View style={styles.filters}>
        <TextInput
          value={search} onChangeText={setSearch}
          placeholder="Buscar material, código, vendor…" placeholderTextColor="#999"
          style={styles.search}
        />
        <FlatList
          horizontal showsHorizontalScrollIndicator={false} data={ESTADOS as unknown as string[]}
          keyExtractor={(e) => e} contentContainerStyle={{ gap: 7, paddingVertical: 4 }}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => setEstado(item as EstadoFiltro)}
              style={[styles.chip, estado === item && styles.chipOn]}>
              <Text style={[styles.chipText, estado === item && styles.chipTextOn]}>{item}</Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {isLoading ? <Cargando />
        : isError ? <ErrorBox mensaje="No se pudieron cargar los materiales" onRetry={refetch} />
        : filtered.length === 0 ? <Vacio mensaje={q ? 'Sin coincidencias' : 'No hay materiales'} />
        : (
          <FlatList
            data={filtered} keyExtractor={(m) => String(m.id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#C18A2D" />}
            renderItem={({ item }) => <MaterialCard m={item} />}
          />
        )}
    </View>
  )
}

function MaterialCard({ m }: { m: Material }) {
  const c = COLOR[m.estado_cotiz] ?? { bg: '#EEE', fg: '#555' }
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.codigo}>{m.codigo || m.proyecto?.codigo || '—'}</Text>
        <View style={[styles.badge, { backgroundColor: c.bg }]}>
          <Text style={[styles.badgeText, { color: c.fg }]}>{m.estado_cotiz}</Text>
        </View>
      </View>
      <Text style={styles.desc} numberOfLines={2}>{m.descripcion || 'Sin descripción'}</Text>
      <Text style={styles.meta}>
        {m.proyecto?.codigo ? `${m.proyecto.codigo} · ` : ''}{m.qty ?? '—'} {m.unidad || ''}
        {m.vendor ? ` · ${m.vendor}` : ''}{m.oc_numero ? ` · ${m.oc_numero}` : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  search: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, borderWidth: 1, borderColor: '#E0DFD9', color: '#1F2419',
  },
  chip: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0DFD9', borderRadius: 999, paddingHorizontal: 13, paddingVertical: 6 },
  chipOn: { backgroundColor: '#2c3126', borderColor: '#2c3126' },
  chipText: { fontSize: 12, fontWeight: '700', color: '#5A5F52' },
  chipTextOn: { color: '#E8C684' },
  list: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 6 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 9, borderLeftWidth: 4, borderLeftColor: '#C18A2D' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  codigo: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  desc: { fontSize: 14, fontWeight: '600', color: '#1F2419' },
  meta: { fontSize: 12, color: '#5A5F52', marginTop: 3 },
})
