import React, { useState } from 'react'
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { proyectosService, Proyecto } from '../services/proyectos'
import { comprasService, VendorCotizado } from '../services/compras'
import { Cargando, ErrorBox, Vacio } from '../components/States'

function money(v: string | number) {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function GenerarOCScreen() {
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  if (!proyecto) return <SelectorProyecto onSelect={setProyecto} />
  return <Vendors proyecto={proyecto} onBack={() => setProyecto(null)} />
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
        <Text style={styles.hint}>Elegí el proyecto para emitir OC de sus vendors cotizados</Text>
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

function Vendors({ proyecto, onBack }: { proyecto: Proyecto; onBack: () => void }) {
  const nav = useNavigation<any>()
  const { data, isLoading, isError, refetch, isRefetching } = useQuery({
    queryKey: ['vendors-cotizados', proyecto.id],
    queryFn: () => comprasService.getVendorsCotizados(proyecto.id),
  })
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  const vendors = data ?? []
  const toggle = (v: string) => setSel((s) => { const n = new Set(s); n.has(v) ? n.delete(v) : n.add(v); return n })
  const seleccionados = vendors.filter((v) => sel.has(v.vendor))
  const totalSel = seleccionados.reduce((acc, v) => acc + (typeof v.total === 'number' ? v.total : parseFloat(String(v.total)) || 0), 0)

  const confirmar = () => {
    if (seleccionados.length === 0) return
    Alert.alert(
      'Confirmar emisión',
      `Vas a emitir ${seleccionados.length} orden(es) de compra por un total de USD ${money(totalSel)}.\n\n` +
      seleccionados.map((v) => `• ${v.vendor}: ${v.materiales_count} ítem(s) · $${money(v.total)}`).join('\n') +
      `\n\nEsto crea OCs reales con numeración correlativa. ¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: `Emitir ${seleccionados.length} OC(s)`, style: 'default', onPress: emitir },
      ]
    )
  }

  const emitir = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await comprasService.generarOCs(
        proyecto.id,
        seleccionados.map((v) => ({ vendor: v.vendor, fecha_entrega_estimada: null }))
      )
      const nums = res.map((r) => r.numero).join(', ')
      Alert.alert('OC(s) emitidas', `Se crearon: ${nums}`, [
        { text: 'OK', onPress: () => { setSel(new Set()); refetch() } },
      ])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudieron emitir las OCs')
    } finally {
      setSaving(false)
    }
  }

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
        : isError ? <ErrorBox mensaje="No se pudieron cargar los vendors" onRetry={refetch} />
        : vendors.length === 0 ? <Vacio mensaje="No hay vendors con material cotizado para emitir OC" />
        : (
          <>
            <FlatList
              data={vendors} keyExtractor={(v) => v.vendor}
              contentContainerStyle={styles.list} refreshing={isRefetching} onRefresh={refetch}
              renderItem={({ item }) => {
                const on = sel.has(item.vendor)
                return (
                  <TouchableOpacity style={[styles.card, on && styles.cardOn]} onPress={() => toggle(item.vendor)} activeOpacity={0.7}>
                    <View style={[styles.check, on && styles.checkOn]}>{on ? <Text style={styles.checkMark}>✓</Text> : null}</View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vName}>{item.vendor}</Text>
                      <Text style={styles.vMeta}>{item.materiales_count} ítem(s) cotizado(s)</Text>
                    </View>
                    <Text style={styles.vTotal}>${money(item.total)}</Text>
                  </TouchableOpacity>
                )
              }}
            />
            <View style={styles.footer}>
              <View style={{ flex: 1 }}>
                <Text style={styles.footLabel}>{seleccionados.length} seleccionado(s)</Text>
                <Text style={styles.footTotal}>USD ${money(totalSel)}</Text>
              </View>
              <TouchableOpacity
                style={[styles.emitir, (seleccionados.length === 0 || saving) && styles.emitirOff]}
                onPress={confirmar} disabled={seleccionados.length === 0 || saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.emitirText}>Emitir OC</Text>}
              </TouchableOpacity>
            </View>
          </>
        )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  filters: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  hint: { fontSize: 13, color: '#5A5F52', marginBottom: 10 },
  search: { backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11, fontSize: 14, borderWidth: 1, borderColor: '#E0DFD9', color: '#1F2419' },
  list: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  pick: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E0DFD9' },
  pickCod: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126' },
  pickNom: { fontSize: 13, color: '#1F2419', marginTop: 2 },
  projBar: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E0DFD9' },
  projCod: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126' },
  projNom: { fontSize: 13, color: '#5A5F52', marginTop: 1 },
  cambiar: { color: '#C18A2D', fontWeight: '700', fontSize: 13 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 9, borderWidth: 1, borderColor: '#E0DFD9' },
  cardOn: { borderColor: '#C18A2D', backgroundColor: '#FCF6E9' },
  check: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#C8C5BC', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: '#C18A2D', borderColor: '#C18A2D' },
  checkMark: { color: '#fff', fontWeight: '800', fontSize: 13 },
  vName: { fontSize: 14, fontWeight: '700', color: '#1F2419' },
  vMeta: { fontSize: 12, color: '#5A5F52', marginTop: 2 },
  vTotal: { fontSize: 14, fontWeight: '800', color: '#C18A2D' },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0DFD9', paddingHorizontal: 16, paddingVertical: 12 },
  footLabel: { fontSize: 11, color: '#5A5F52' },
  footTotal: { fontSize: 18, fontWeight: '800', color: '#2c3126' },
  emitir: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 14 },
  emitirOff: { opacity: 0.4 },
  emitirText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
