import React, { useState } from 'react'
import { View, Text, FlatList, ScrollView, RefreshControl, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { proyectosService, Proyecto, ReadinessItem } from '../services/proyectos'
import type { RootStackParamList } from '../navigation/types'
import {
  Screen, Toolbar, SearchField, ListRow, Progress, StatusDot, LoadingRows, ErrorState, EmptyState,
  color, font, size, space,
} from '../ui'

export default function ControlMtoScreen() {
  const nav = useNavigation<any>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'ControlMto'>>()
  const preselected = params?.proyecto
  const [proyecto, setProyecto] = useState<Proyecto | null>(preselected ?? null)

  const onBack = () => {
    if (proyecto && !preselected) setProyecto(null) // volver al selector
    else nav.goBack()
  }

  if (!proyecto) return <SelectorProyecto onSelect={setProyecto} onBack={() => nav.goBack()} />
  return <Readiness proyecto={proyecto} onBack={onBack} />
}

function SelectorProyecto({ onSelect, onBack }: { onSelect: (p: Proyecto) => void; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['proyectos'], queryFn: () => proyectosService.getProyectos() })
  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) => !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q)))

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Control MTO" subtitle="Elegí un proyecto" onBack={onBack} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}><SearchField value={search} onChangeText={setSearch} placeholder="Buscar proyecto…" /></View>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar los proyectos" onRetry={refetch} />
          : (
            <FlatList data={filtered} keyExtractor={(p) => String(p.id)} contentContainerStyle={styles.list}
              renderItem={({ item }) => <ListRow code={item.codigo} title={item.nombre} meta={item.cliente ?? undefined} onPress={() => onSelect(item)} />} />
          )}
      </View>
    </Screen>
  )
}

function Readiness({ proyecto, onBack }: { proyecto: Proyecto; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['readiness', proyecto.id],
    queryFn: () => proyectosService.getItemsReadiness(proyecto.id),
  })

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Control MTO" subtitle={`${proyecto.codigo} · ${proyecto.nombre}`} onBack={onBack} />
      {isLoading ? <View style={[styles.pad, { paddingTop: insets.top + 62 }]}><LoadingRows /></View>
        : isError ? <View style={{ paddingTop: insets.top + 62, flex: 1 }}><ErrorState message="No se pudo cargar el readiness" onRetry={refetch} /></View>
        : !data || data.items.length === 0 ? <View style={{ paddingTop: insets.top + 62, flex: 1 }}><EmptyState title="Sin materiales" line="Este proyecto no tiene materiales con ítem cargado." /></View>
        : (
          <ScrollView contentContainerStyle={[styles.list, { paddingTop: insets.top + 62 }]}
            refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={color.gold} />}>
            <View style={styles.resumen}>
              <Stat n={data.resumen.listos} label="Listos" c={color.green} />
              <Stat n={data.resumen.parciales} label="Parciales" c={color.gold} />
              <Stat n={data.resumen.ordenados} label="Ordenados" c={color.gold} />
              <Stat n={data.resumen.pendientes} label="Pendientes" c={color.coral} />
            </View>
            {data.items.map((it) => <ItemRow key={it.item} it={it} />)}
          </ScrollView>
        )}
    </Screen>
  )
}

function Stat({ n, label, c }: { n: number; label: string; c: string }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statN, { color: c }]}>{n}</Text>
      <Text style={styles.statL}>{label}</Text>
    </View>
  )
}

function ItemRow({ it }: { it: ReadinessItem }) {
  const pct = it.total > 0 ? Math.round((it.disponibles / it.total) * 100) : 0
  return (
    <View style={styles.item}>
      <View style={styles.itemHead}>
        <Text style={styles.itemName}>Ítem {it.item}</Text>
        <StatusDot estado={it.estado} />
      </View>
      <Progress label={`${it.disponibles} de ${it.total} disponibles${it.pendientes > 0 ? ` · ${it.pendientes} por cotizar` : ''}`} pct={pct} />
    </View>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.margin, paddingTop: 8, paddingBottom: 8 },
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
  resumen: { flexDirection: 'row', gap: 10, marginTop: 16, marginBottom: 8 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: color.line },
  statN: { fontFamily: font.titleSemi, fontSize: 22 },
  statL: { fontFamily: font.kickerMed, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: color.mutedStrong, marginTop: 2 },
  item: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  itemHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  itemName: { fontFamily: font.bodySemi, fontSize: size.row, color: color.ink },
})
