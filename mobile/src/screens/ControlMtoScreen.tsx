import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, RefreshControl, ScrollView } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { proyectosService, Proyecto, ReadinessItem } from '../services/proyectos'
import { Cargando, ErrorBox, Vacio } from '../components/States'

const EST_COLOR: Record<string, string> = {
  LISTO: '#5A8A2E', PARCIAL: '#C18A2D', ORDENADO: '#25627c', PENDIENTE: '#B4463C',
}

export default function ControlMtoScreen() {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  if (!proyecto) return <SelectorProyecto onSelect={setProyecto} />
  return <Readiness proyecto={proyecto} onBack={() => setProyecto(null)} />
}

function SelectorProyecto({ onSelect }: { onSelect: (p: Proyecto) => void }) {
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['proyectos'], queryFn: () => proyectosService.getProyectos(),
  })
  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) => !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q)))

  return (
    <View style={styles.container}>
      <View style={styles.filters}>
        <Text style={styles.hint}>Elegí un proyecto para ver el estado de sus materiales</Text>
        <TextInput value={search} onChangeText={setSearch} placeholder="Buscar proyecto…" placeholderTextColor="#999" style={styles.search} />
      </View>
      {isLoading ? <Cargando />
        : isError ? <ErrorBox mensaje="No se pudieron cargar los proyectos" onRetry={refetch} />
        : (
          <FlatList data={filtered} keyExtractor={(p) => String(p.id)} contentContainerStyle={styles.list}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pick} onPress={() => onSelect(item)} activeOpacity={0.7}>
                <Text style={styles.pickCod}>{item.codigo}</Text>
                <Text style={styles.pickNom} numberOfLines={1}>{item.nombre}</Text>
              </TouchableOpacity>
            )} />
        )}
    </View>
  )
}

function Readiness({ proyecto, onBack }: { proyecto: Proyecto; onBack: () => void }) {
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['readiness', proyecto.id],
    queryFn: () => proyectosService.getItemsReadiness(proyecto.id),
  })

  return (
    <View style={styles.container}>
      <View style={styles.projBar}>
        <View style={{ flex: 1 }}>
          <Text style={styles.projCod}>{proyecto.codigo}</Text>
          <Text style={styles.projNom} numberOfLines={1}>{proyecto.nombre}</Text>
        </View>
        <TouchableOpacity onPress={onBack}><Text style={styles.cambiar}>Cambiar</Text></TouchableOpacity>
      </View>

      {isLoading ? <Cargando />
        : isError ? <ErrorBox mensaje="No se pudo cargar el readiness" onRetry={refetch} />
        : !data || data.items.length === 0 ? <Vacio mensaje="Este proyecto no tiene materiales con ítem cargado" />
        : (
          <ScrollView contentContainerStyle={styles.list}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor="#C18A2D" />}>
            <View style={styles.resumen}>
              <ResumenChip n={data.resumen.listos} label="Listos" color="#5A8A2E" />
              <ResumenChip n={data.resumen.parciales} label="Parciales" color="#C18A2D" />
              <ResumenChip n={data.resumen.ordenados} label="Ordenados" color="#25627c" />
              <ResumenChip n={data.resumen.pendientes} label="Pendientes" color="#B4463C" />
            </View>
            {data.items.map((it) => <ItemCard key={it.item} it={it} />)}
          </ScrollView>
        )}
    </View>
  )
}

function ResumenChip({ n, label, color }: { n: number; label: string; color: string }) {
  return (
    <View style={styles.rChip}>
      <Text style={[styles.rN, { color }]}>{n}</Text>
      <Text style={styles.rL}>{label}</Text>
    </View>
  )
}

function ItemCard({ it }: { it: ReadinessItem }) {
  const pct = it.total > 0 ? Math.round((it.disponibles / it.total) * 100) : 0
  const color = EST_COLOR[it.estado] ?? '#5A5F52'
  return (
    <View style={[styles.card, { borderLeftColor: color }]}>
      <View style={styles.top}>
        <Text style={styles.itemNom}>Ítem {it.item}</Text>
        <Text style={[styles.estado, { color }]}>{it.estado}</Text>
      </View>
      <View style={styles.progBg}><View style={[styles.progFill, { width: `${pct}%`, backgroundColor: color }]} /></View>
      <Text style={styles.progText}>
        {it.disponibles} de {it.total} disponibles · {pct}%
        {it.pendientes > 0 ? ` · ${it.pendientes} por cotizar` : ''}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  hint: { fontSize: 13, color: '#5A5F52', marginBottom: 10 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#E0DFD9', color: '#1F2419' },
  list: { paddingHorizontal: 16, paddingBottom: 28, paddingTop: 8 },
  pick: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E0DFD9' },
  pickCod: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126' },
  pickNom: { fontSize: 13, color: '#1F2419', marginTop: 2 },
  projBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0DFD9' },
  projCod: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126' },
  projNom: { fontSize: 13, color: '#5A5F52', marginTop: 1 },
  cambiar: { color: '#C18A2D', fontWeight: '700', fontSize: 13 },
  resumen: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  rChip: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0DFD9', borderRadius: 9, paddingVertical: 9, alignItems: 'center' },
  rN: { fontSize: 18, fontWeight: '800' },
  rL: { fontSize: 9.5, color: '#5A5F52', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 1 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 9, borderLeftWidth: 4 },
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  itemNom: { fontSize: 14, fontWeight: '700', color: '#1F2419' },
  estado: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  progBg: { height: 8, borderRadius: 4, backgroundColor: '#E0DFD9', overflow: 'hidden' },
  progFill: { height: 8, borderRadius: 4 },
  progText: { fontSize: 11.5, color: '#5A5F52', marginTop: 6 },
})
