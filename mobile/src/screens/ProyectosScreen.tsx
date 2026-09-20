import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TextInput, RefreshControl } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { proyectosService, Proyecto } from '../services/proyectos'
import { Cargando, ErrorBox, Vacio } from '../components/States'

const ESTADO_BADGE: Record<string, { bg: string; fg: string }> = {
  activo:     { bg: '#F0F7E8', fg: '#2f6a12' },
  ingenieria: { bg: '#FAF3E3', fg: '#7d5c00' },
  produccion: { bg: '#E8F4FA', fg: '#25627c' },
  entregado:  { bg: '#EDEDE8', fg: '#5A5F52' },
}

export default function ProyectosScreen() {
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['proyectos'],
    queryFn: () => proyectosService.getProyectos(),
  })

  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) =>
    !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q))
  )

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <TextInput value={search} onChangeText={setSearch}
          placeholder="Buscar proyecto o cliente…" placeholderTextColor="#999" style={styles.search} />
      </View>
      {isLoading ? <Cargando />
        : isError ? <ErrorBox mensaje="No se pudieron cargar los proyectos" onRetry={refetch} />
        : filtered.length === 0 ? <Vacio mensaje={q ? 'Sin coincidencias' : 'No hay proyectos'} />
        : (
          <FlatList
            data={filtered} keyExtractor={(p) => String(p.id)}
            contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#C18A2D" />}
            renderItem={({ item }) => <ProyectoCard p={item} />}
          />
        )}
    </View>
  )
}

function ProyectoCard({ p }: { p: Proyecto }) {
  const est = (p.estado ?? '').toLowerCase()
  const b = ESTADO_BADGE[est] ?? { bg: '#EDEDE8', fg: '#5A5F52' }
  return (
    <View style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.codigo}>{p.codigo}</Text>
        {p.estado ? <View style={[styles.badge, { backgroundColor: b.bg }]}><Text style={[styles.badgeText, { color: b.fg }]}>{p.estado.toUpperCase()}</Text></View> : null}
      </View>
      <Text style={styles.nombre} numberOfLines={1}>{p.nombre}</Text>
      {p.cliente ? <Text style={styles.cliente} numberOfLines={1}>{p.cliente}</Text> : null}
      <Text style={styles.meta}>{p.fecha_objetivo ? `🎯 Entrega ${p.fecha_objetivo}` : 'Sin fecha objetivo'}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#E0DFD9', color: '#1F2419' },
  list: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 9, borderLeftWidth: 4, borderLeftColor: '#C18A2D' },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  codigo: { fontFamily: 'Courier', fontSize: 14, fontWeight: '700', color: '#2c3126' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeText: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.4 },
  nombre: { fontSize: 14.5, fontWeight: '700', color: '#1F2419' },
  cliente: { fontSize: 12, color: '#5A5F52', marginTop: 2 },
  meta: { fontSize: 12, color: '#5A5F52', marginTop: 6 },
})
