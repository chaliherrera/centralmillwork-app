import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator, TextInput,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ordenesCompraService, OrdenCompra } from '../services/ordenesCompra'
import { useAuth } from '../context/AuthContext'
import { EtaBadge } from '../components/EtaBadge'

interface Props {
  onSelect: (oc: OrdenCompra) => void
  onLogout: () => void
}

export default function OCsListScreen({ onSelect, onLogout }: Props) {
  const { user } = useAuth()
  const [ocs, setOcs] = useState<OrdenCompra[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const data = await ordenesCompraService.getPendientesRecepcion()
      // Ordenar por fecha de emisión descendente
      data.sort((a, b) => (b.fecha_emision || '').localeCompare(a.fecha_emision || ''))
      setOcs(data)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Error al cargar OCs')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const onRefresh = () => {
    setRefreshing(true)
    fetchData()
  }

  // Filtro de búsqueda en cliente
  const filtered = ocs.filter((oc) => {
    const q = search.toLowerCase().trim()
    if (!q) return true
    return (
      oc.numero?.toLowerCase().includes(q) ||
      oc.proveedor?.nombre?.toLowerCase().includes(q) ||
      oc.proyecto?.nombre?.toLowerCase().includes(q) ||
      oc.proyecto?.codigo?.toLowerCase().includes(q)
    )
  })

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>CENTRAL MILLWORK</Text>
          <Text style={styles.userInfo}>{user?.nombre} · {user?.rol}</Text>
        </View>
        <TouchableOpacity onPress={onLogout}>
          <Text style={styles.logoutLink}>Salir</Text>
        </TouchableOpacity>
      </View>

      {/* Title */}
      <View style={styles.titleSection}>
        <Text style={styles.title}>Órdenes Pendientes</Text>
        <Text style={styles.subtitle}>{filtered.length} OCs por recibir</Text>
      </View>

      {/* Search */}
      <View style={styles.searchSection}>
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Buscar por número, vendor o proyecto..."
          placeholderTextColor="#999"
          style={styles.searchInput}
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#C18A2D" />
        </View>
      ) : error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
            <Text style={styles.retryText}>Reintentar</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.emptyBox}>
          <Text style={styles.emptyText}>
            {search ? 'No hay OCs que coincidan' : 'No hay OCs pendientes de recepción'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C18A2D" />
          }
          renderItem={({ item }) => <OCCard oc={item} onPress={() => onSelect(item)} />}
        />
      )}
    </SafeAreaView>
  )
}

function OCCard({ oc, onPress }: { oc: OrdenCompra; onPress: () => void }) {
  const isTransito = oc.estado_display === 'EN_TRANSITO'
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardNumero}>{oc.numero}</Text>
        <View style={[styles.badge, isTransito ? styles.badgeTransito : styles.badgeOrdenado]}>
          <Text style={styles.badgeText}>{isTransito ? 'EN TRÁNSITO' : 'ORDENADO'}</Text>
        </View>
      </View>
      <Text style={styles.cardProveedor}>{oc.proveedor?.nombre || 'Sin vendor'}</Text>
      <Text style={styles.cardProyecto} numberOfLines={1}>
        {oc.proyecto?.codigo} · {oc.proyecto?.nombre}
      </Text>
      <View style={styles.cardFooter}>
        <EtaBadge eta={oc.fecha_entrega_estimada} /><Text style={[styles.cardFecha, { marginLeft: 8 }]}>
          {oc.fecha_entrega_estimada ? `ETA: ${formatDate(oc.fecha_entrega_estimada)}` : 'Sin ETA'}
        </Text>
        <Text style={styles.cardTotal}>${formatMoney(oc.total)}</Text>
      </View>
    </TouchableOpacity>
  )
}

function formatDate(s: string): string {
  const d = new Date(s)
  if (isNaN(d.getTime())) return s
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`
}
function formatMoney(s: string): string {
  const n = parseFloat(s)
  if (isNaN(n)) return s
  return n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  header: {
    backgroundColor: '#2c3126', paddingVertical: 14, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  brand: { color: '#C18A2D', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  userInfo: { color: '#E8C684', fontSize: 11, marginTop: 2, opacity: 0.85 },
  logoutLink: { color: '#fff', fontSize: 13, opacity: 0.8 },
  titleSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#2c3126' },
  subtitle: { fontSize: 13, color: '#5A5F52', marginTop: 2 },
  searchSection: { paddingHorizontal: 20, paddingVertical: 12 },
  searchInput: {
    backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
    fontSize: 14, borderWidth: 1, borderColor: '#E0DFD9', color: '#1F2419',
  },
  listContent: { paddingHorizontal: 20, paddingBottom: 30 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: '#C18A2D',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardNumero: { fontSize: 15, fontWeight: '700', color: '#2c3126', fontFamily: 'Courier' },
  badge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 },
  badgeOrdenado: { backgroundColor: '#FAF3E3' },
  badgeTransito: { backgroundColor: '#E8F4FA' },
  badgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, color: '#2c3126' },
  cardProveedor: { fontSize: 14, fontWeight: '600', color: '#1F2419', marginTop: 2 },
  cardProyecto: { fontSize: 12, color: '#5A5F52', marginTop: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, alignItems: 'center' },
  cardFecha: { fontSize: 12, color: '#5A5F52' },
  cardTotal: { fontSize: 15, fontWeight: '700', color: '#C18A2D' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { color: '#B33', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#C18A2D', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#5A5F52', fontSize: 14, textAlign: 'center' },
})
