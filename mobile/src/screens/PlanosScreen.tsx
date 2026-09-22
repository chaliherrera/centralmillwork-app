import React, { useState } from 'react'
import { View, Text, FlatList, Pressable, ActivityIndicator, Linking, Alert, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { scheduleService, InstallItem, PlanoItem } from '../services/schedule'
import type { RootStackParamList } from '../navigation/types'
import { Screen, Toolbar, Icon, LoadingRows, ErrorState, EmptyState, color, font, size, space } from '../ui'

export default function PlanosScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<any>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'PlanosObra'>>()
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['install-items', params.proyectoId],
    queryFn: () => scheduleService.getItems(params.proyectoId),
  })
  const items = Array.from(new Map((data ?? []).map((i) => [i.numero_item, i])).values())

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Planos" subtitle={`${params.codigo} · por ítem`} onBack={() => nav.goBack()} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar los ítems" onRetry={refetch} />
          : items.length === 0 ? <EmptyState title="Sin ítems" line="Este proyecto no tiene ítems de producción." />
          : <FlatList data={items} keyExtractor={(i) => i.numero_item} contentContainerStyle={styles.list}
              renderItem={({ item }) => <ItemPlanos proyectoId={params.proyectoId} item={item} />} />}
      </View>
    </Screen>
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
    <View style={styles.item}>
      <Pressable style={styles.itemHead} onPress={() => setAbierto((v) => !v)}>
        <Text style={styles.itemName}>Ítem {item.numero_item}</Text>
        <Icon name="chevronDown" size={18} color={color.muted} strokeWidth={1.8} />
      </Pressable>
      {abierto ? (
        <View style={styles.planos}>
          {isLoading ? <ActivityIndicator color={color.gold} style={{ marginVertical: 10 }} />
            : isError ? <Text style={styles.err}>No se pudieron cargar los planos</Text>
            : !data || data.length === 0 ? <Text style={styles.vacio}>Sin planos para este ítem</Text>
            : data.map((p) => (
              <Pressable key={p.id} style={({ pressed }) => [styles.plano, pressed && { opacity: 0.6 }]} onPress={() => abrir(p)}>
                <Icon name="doc" size={18} color={color.muted} strokeWidth={1.8} />
                <Text style={styles.planoName} numberOfLines={1}>{p.original_name || 'Plano.pdf'}</Text>
                <Text style={styles.abrir}>Abrir</Text>
              </Pressable>
            ))}
        </View>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
  item: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  itemHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
  itemName: { fontFamily: font.bodySemi, fontSize: size.row, color: color.ink },
  planos: { paddingBottom: 12 },
  plano: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingLeft: 4, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  planoName: { flex: 1, fontFamily: font.body, fontSize: size.secondary, color: color.ink2 },
  abrir: { fontFamily: font.bodySemi, fontSize: size.secondary, color: color.gold },
  err: { fontFamily: font.body, fontSize: size.secondary, color: color.coral, paddingVertical: 8 },
  vacio: { fontFamily: font.body, fontSize: size.secondary, color: color.muted, paddingVertical: 8 },
})
