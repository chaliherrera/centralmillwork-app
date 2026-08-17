import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  RefreshControl, ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { scheduleService, InstallProyecto } from '../services/schedule'

interface Props {
  onSelect: (p: InstallProyecto) => void
  onBack: () => void
}

// Etapas de instalación en orden, para el mini-progreso de cada tarjeta.
const PASOS: { codigo: string; label: string }[] = [
  { codigo: 'I-04', label: 'Check-in' },
  { codigo: 'I-05', label: 'Avance' },
  { codigo: 'I-06', label: 'Punch list' },
  { codigo: 'I-07', label: 'Entrega' },
]

export default function InstallListScreen({ onSelect, onBack }: Props) {
  const [items, setItems] = useState<InstallProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setError(null)
      const data = await scheduleService.getInstallQueue()
      setItems(data)
    } catch (err: any) {
      setError(err?.response?.data?.message || 'No se pudo cargar la cola de instalación')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  const onRefresh = () => { setRefreshing(true); fetchData() }

  return (
    <SafeAreaView style={styles.safeAreaTop} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>🔧 Instalación</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.titleSection}>
          <Text style={styles.title}>Obras por instalar</Text>
          <Text style={styles.subtitle}>{items.length} proyecto(s) con entrega pendiente</Text>
        </View>

        {loading ? (
          <View style={styles.loadingBox}><ActivityIndicator size="large" color="#C18A2D" /></View>
        ) : error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={fetchData} style={styles.retryBtn}>
              <Text style={styles.retryText}>Reintentar</Text>
            </TouchableOpacity>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No hay obras en ventana de instalación.</Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => String(item.proyecto_id)}
            contentContainerStyle={styles.listContent}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#C18A2D" />}
            renderItem={({ item }) => <InstallCard p={item} onPress={() => onSelect(item)} />}
          />
        )}
      </View>
    </SafeAreaView>
  )
}

function InstallCard({ p, onPress }: { p: InstallProyecto; onPress: () => void }) {
  const done = new Set(p.hitos.filter((h) => h.fecha_real).map((h) => h.codigo))
  return (
    <TouchableOpacity onPress={onPress} style={styles.card} activeOpacity={0.7}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardCodigo}>{p.codigo}</Text>
        {p.punch_abiertos > 0 && (
          <View style={styles.punchBadge}>
            <Text style={styles.punchBadgeText}>{p.punch_abiertos} pendiente(s)</Text>
          </View>
        )}
      </View>
      <Text style={styles.cardNombre} numberOfLines={1}>{p.nombre}</Text>
      {p.cliente ? <Text style={styles.cardCliente} numberOfLines={1}>{p.cliente}</Text> : null}

      {/* Mini-progreso de instalación */}
      <View style={styles.pasosRow}>
        {PASOS.map((paso, i) => {
          const ok = done.has(paso.codigo)
          return (
            <React.Fragment key={paso.codigo}>
              {i > 0 && <View style={[styles.pasoConn, ok && styles.pasoConnDone]} />}
              <View style={styles.pasoNode}>
                <View style={[styles.pasoDot, ok ? styles.pasoDotDone : styles.pasoDotPending]}>
                  {ok && <Text style={styles.pasoCheck}>✓</Text>}
                </View>
                <Text style={styles.pasoLabel}>{paso.label}</Text>
              </View>
            </React.Fragment>
          )
        })}
      </View>

      <View style={styles.cardFooter}>
        <Text style={styles.cardObjetivo}>
          {p.fecha_objetivo ? `🎯 Entrega objetivo: ${p.fecha_objetivo}` : 'Sin fecha objetivo'}
        </Text>
      </View>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safeAreaTop: { flex: 1, backgroundColor: '#2c3126' },
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  header: {
    backgroundColor: '#2c3126', paddingVertical: 14, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backText: { color: '#fff', fontSize: 14 },
  headerTitle: { color: '#C18A2D', fontSize: 16, fontWeight: '700' },
  titleSection: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  title: { fontSize: 22, fontWeight: '700', color: '#2c3126' },
  subtitle: { fontSize: 13, color: '#5A5F52', marginTop: 2 },
  listContent: { paddingHorizontal: 20, paddingVertical: 12, paddingBottom: 30 },
  card: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 10,
    borderLeftWidth: 4, borderLeftColor: '#C18A2D',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  cardCodigo: { fontSize: 14, fontWeight: '700', color: '#2c3126', fontFamily: 'Courier' },
  punchBadge: { backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  punchBadgeText: { fontSize: 10, fontWeight: '700', color: '#991B1B' },
  cardNombre: { fontSize: 15, fontWeight: '600', color: '#1F2419' },
  cardCliente: { fontSize: 12, color: '#5A5F52', marginTop: 2 },
  pasosRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 14, marginBottom: 4 },
  pasoNode: { alignItems: 'center', width: 62 },
  pasoDot: {
    width: 22, height: 22, borderRadius: 11, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  pasoDotDone: { backgroundColor: '#5A8A2E', borderColor: '#5A8A2E' },
  pasoDotPending: { backgroundColor: '#fff', borderColor: '#C8C5BC' },
  pasoCheck: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pasoConn: { flex: 1, height: 2, backgroundColor: '#E0DFD9', marginTop: 10 },
  pasoConnDone: { backgroundColor: '#5A8A2E' },
  pasoLabel: { fontSize: 9, color: '#5A5F52', textAlign: 'center', fontWeight: '600' },
  cardFooter: { marginTop: 10 },
  cardObjetivo: { fontSize: 12, color: '#5A5F52' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 30 },
  errorText: { color: '#B33', fontSize: 14, textAlign: 'center', marginBottom: 16 },
  retryBtn: { backgroundColor: '#C18A2D', paddingHorizontal: 24, paddingVertical: 10, borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  emptyBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  emptyText: { color: '#5A5F52', fontSize: 14, textAlign: 'center' },
})
