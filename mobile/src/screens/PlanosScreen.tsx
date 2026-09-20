import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, Linking, Alert } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useRoute, RouteProp } from '@react-navigation/native'
import { scheduleService, InstallItem, PlanoItem } from '../services/schedule'
import { Cargando, ErrorBox, Vacio } from '../components/States'
import type { RootStackParamList } from '../navigation/types'

export default function PlanosScreen() {
  const { params } = useRoute<RouteProp<RootStackParamList, 'PlanosObra'>>()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['install-items', params.proyectoId],
    queryFn: () => scheduleService.getItems(params.proyectoId),
  })

  // Ítems únicos por numero_item (varias OPs pueden compartir ítem).
  const items = Array.from(new Map((data ?? []).map((i) => [i.numero_item, i])).values())

  return (
    <View style={styles.container}>
      {isLoading ? <Cargando />
        : isError ? <ErrorBox mensaje="No se pudieron cargar los ítems" onRetry={refetch} />
        : items.length === 0 ? <Vacio mensaje="Este proyecto no tiene ítems de producción" />
        : (
          <FlatList
            data={items} keyExtractor={(i) => i.numero_item}
            contentContainerStyle={styles.list}
            ListHeaderComponent={<Text style={styles.header}>{params.codigo} · Planos por ítem</Text>}
            renderItem={({ item }) => <ItemPlanos proyectoId={params.proyectoId} item={item} />}
          />
        )}
    </View>
  )
}

function ItemPlanos({ proyectoId, item }: { proyectoId: number; item: InstallItem }) {
  const [abierto, setAbierto] = useState(false)
  const { data, isLoading, isError } = useQuery({
    queryKey: ['planos', proyectoId, item.numero_item],
    queryFn: () => scheduleService.getPlanos(proyectoId, item.numero_item),
    enabled: abierto,
  })

  const abrir = async (p: PlanoItem) => {
    if (!p.url) { Alert.alert('Sin enlace', 'El plano no tiene enlace disponible.'); return }
    const ok = await Linking.canOpenURL(p.url)
    if (ok) Linking.openURL(p.url)
    else Alert.alert('No se pudo abrir', 'El dispositivo no puede abrir este archivo.')
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity style={styles.itemHead} onPress={() => setAbierto((v) => !v)} activeOpacity={0.7}>
        <Text style={styles.itemNom}>Ítem {item.numero_item}</Text>
        <Text style={styles.chev}>{abierto ? '▾' : '▸'}</Text>
      </TouchableOpacity>
      {abierto && (
        <View style={styles.planos}>
          {isLoading ? <ActivityIndicator color="#C18A2D" style={{ marginVertical: 10 }} />
            : isError ? <Text style={styles.err}>No se pudieron cargar los planos</Text>
            : !data || data.length === 0 ? <Text style={styles.vacio}>Sin planos para este ítem</Text>
            : data.map((p) => (
              <TouchableOpacity key={p.id} style={styles.plano} onPress={() => abrir(p)}>
                <Text style={styles.planoIcon}>📄</Text>
                <Text style={styles.planoName} numberOfLines={1}>{p.original_name || 'Plano.pdf'}</Text>
                <Text style={styles.abrir}>Abrir</Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  list: { padding: 16 },
  header: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, marginBottom: 9, borderWidth: 1, borderColor: '#E0DFD9', overflow: 'hidden' },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14 },
  itemNom: { fontSize: 14, fontWeight: '700', color: '#1F2419' },
  chev: { fontSize: 16, color: '#5A5F52' },
  planos: { paddingHorizontal: 14, paddingBottom: 12 },
  plano: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: '#F0EFEA' },
  planoIcon: { fontSize: 18 },
  planoName: { flex: 1, fontSize: 13, color: '#1F2419' },
  abrir: { color: '#C18A2D', fontWeight: '700', fontSize: 13 },
  err: { color: '#B4463C', fontSize: 13, paddingVertical: 8 },
  vacio: { color: '#5A5F52', fontSize: 13, fontStyle: 'italic', paddingVertical: 8 },
})
