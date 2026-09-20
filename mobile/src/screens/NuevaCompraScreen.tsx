import React, { useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity,
  Alert, ActivityIndicator, Modal, FlatList, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { proyectosService, Proyecto } from '../services/proyectos'
import { comprasService, OrigenNoMTO } from '../services/compras'
import type { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList>

interface Linea { descripcion: string; unidad: string; qty: string; unit_price: string }
const lineaVacia = (): Linea => ({ descripcion: '', unidad: 'u', qty: '', unit_price: '' })

const ORIGENES: { key: OrigenNoMTO; label: string; desc: string }[] = [
  { key: 'DIRECTA', label: 'Directa', desc: 'Compra puntual para un proyecto' },
  { key: 'URGENTE', label: 'Urgente', desc: 'Necesidad inmediata de obra' },
  { key: 'OPERATIVA', label: 'Operativa', desc: 'Gasto del taller (sin proyecto)' },
]

function money(n: number) {
  return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function NuevaCompraScreen() {
  const nav = useNavigation<Nav>()
  const { user } = useAuth()
  const esAdmin = user?.rol === 'ADMIN'

  const [origen, setOrigen] = useState<OrigenNoMTO>('DIRECTA')
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [vendor, setVendor] = useState('')
  const [categoria, setCategoria] = useState('')
  const [notas, setNotas] = useState('')
  const [freight, setFreight] = useState('')
  const [lineas, setLineas] = useState<Linea[]>([lineaVacia()])
  const [saving, setSaving] = useState(false)

  const requiereProyecto = origen !== 'OPERATIVA'

  const setLinea = (i: number, patch: Partial<Linea>) =>
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLinea = () => setLineas((ls) => [...ls, lineaVacia()])
  const delLinea = (i: number) => setLineas((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))

  const subtotal = lineas.reduce((acc, l) => acc + (parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0), 0)
  const total = subtotal + (parseFloat(freight) || 0)

  const cambiarOrigen = (o: OrigenNoMTO) => {
    setOrigen(o)
    if (o === 'OPERATIVA') setProyecto(null) // operativa no lleva proyecto
  }

  const validar = (): string | null => {
    if (!vendor.trim()) return 'Falta el proveedor (vendor).'
    if (requiereProyecto && !proyecto) return 'Elegí el proyecto.'
    const items = lineas.filter((l) => l.descripcion.trim())
    if (items.length === 0) return 'Agregá al menos un ítem con descripción.'
    for (const [i, l] of lineas.entries()) {
      if (!l.descripcion.trim()) continue
      if (!l.unidad.trim()) return `Ítem ${i + 1}: falta la unidad.`
      if (!(parseFloat(l.qty) > 0)) return `Ítem ${i + 1}: la cantidad debe ser mayor a 0.`
      if (!(parseFloat(l.unit_price) > 0)) return `Ítem ${i + 1}: el precio debe ser mayor a 0.`
    }
    return null
  }

  const confirmar = () => {
    const err = validar()
    if (err) { Alert.alert('Revisá los datos', err); return }
    Alert.alert(
      'Confirmar compra',
      `Vas a crear una compra ${origen.toLowerCase()} a ${vendor.trim()} por USD ${money(total)}` +
      (origen === 'OPERATIVA' ? '.\n\nSe registra como YA recibida (gasto de taller).' : '.') +
      '\n\n¿Continuar?',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Crear compra', onPress: crear }]
    )
  }

  const crear = async () => {
    if (saving) return
    setSaving(true)
    try {
      const items = lineas
        .filter((l) => l.descripcion.trim())
        .map((l) => ({ descripcion: l.descripcion.trim(), unidad: l.unidad.trim() || 'u', qty: parseFloat(l.qty), unit_price: parseFloat(l.unit_price) }))
      const r = await comprasService.crearOCNoMTO({
        proyecto_id: requiereProyecto ? proyecto!.id : null,
        vendor: vendor.trim(),
        origen,
        categoria: categoria.trim() || null,
        notas: notas.trim() || null,
        items,
        freight: parseFloat(freight) || 0,
      })
      Alert.alert('Compra creada', `${r.numero} · USD ${money(r.total)} · ${r.materiales_count} ítem(s)`, [
        { text: 'OK', onPress: () => nav.goBack() },
      ])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo crear la compra')
    } finally {
      setSaving(false)
    }
  }

  const origenesVisibles = ORIGENES.filter((o) => o.key !== 'OPERATIVA' || esAdmin)

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
        <Text style={styles.hTitle}>Nueva compra sin MTO</Text>
        <View style={{ width: 60 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Origen */}
          <Text style={styles.label}>Tipo de compra</Text>
          <View style={styles.origenRow}>
            {origenesVisibles.map((o) => (
              <TouchableOpacity key={o.key} style={[styles.origen, origen === o.key && styles.origenOn]} onPress={() => cambiarOrigen(o.key)}>
                <Text style={[styles.origenLabel, origen === o.key && styles.origenLabelOn]}>{o.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.origenDesc}>{ORIGENES.find((o) => o.key === origen)?.desc}</Text>

          {/* Proyecto */}
          {requiereProyecto && (
            <>
              <Text style={styles.label}>Proyecto</Text>
              <TouchableOpacity style={styles.select} onPress={() => setPickerOpen(true)}>
                <Text style={proyecto ? styles.selectVal : styles.selectPh}>
                  {proyecto ? `${proyecto.codigo} · ${proyecto.nombre}` : 'Elegir proyecto…'}
                </Text>
              </TouchableOpacity>
            </>
          )}

          {/* Vendor */}
          <Text style={styles.label}>Proveedor</Text>
          <TextInput value={vendor} onChangeText={setVendor} placeholder="Nombre del proveedor" placeholderTextColor="#999" style={styles.input} />

          {/* Categoría / Notas */}
          <Text style={styles.label}>Categoría (opcional)</Text>
          <TextInput value={categoria} onChangeText={setCategoria} placeholder="Ej: Herrajes, Insumos…" placeholderTextColor="#999" style={styles.input} />

          {/* Ítems */}
          <Text style={[styles.label, { marginTop: 18 }]}>Ítems</Text>
          {lineas.map((l, i) => (
            <View key={i} style={styles.lineaCard}>
              <View style={styles.lineaTop}>
                <Text style={styles.lineaNum}>Ítem {i + 1}</Text>
                {lineas.length > 1 && (
                  <TouchableOpacity onPress={() => delLinea(i)}><Text style={styles.quitar}>Quitar</Text></TouchableOpacity>
                )}
              </View>
              <TextInput value={l.descripcion} onChangeText={(t) => setLinea(i, { descripcion: t })}
                placeholder="Descripción" placeholderTextColor="#999" style={styles.input} />
              <View style={styles.lineaRow}>
                <TextInput value={l.unidad} onChangeText={(t) => setLinea(i, { unidad: t })}
                  placeholder="Unidad" placeholderTextColor="#999" style={[styles.input, styles.inSm]} />
                <TextInput value={l.qty} onChangeText={(t) => setLinea(i, { qty: t })}
                  placeholder="Cant." placeholderTextColor="#999" keyboardType="decimal-pad" style={[styles.input, styles.inSm]} />
                <TextInput value={l.unit_price} onChangeText={(t) => setLinea(i, { unit_price: t })}
                  placeholder="Precio u." placeholderTextColor="#999" keyboardType="decimal-pad" style={[styles.input, styles.inSm]} />
              </View>
              <Text style={styles.lineaSub}>Subtotal: ${money((parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0))}</Text>
            </View>
          ))}
          <TouchableOpacity style={styles.addLinea} onPress={addLinea}><Text style={styles.addLineaText}>＋ Agregar ítem</Text></TouchableOpacity>

          {/* Flete */}
          <Text style={styles.label}>Flete (opcional)</Text>
          <TextInput value={freight} onChangeText={setFreight} placeholder="0.00" placeholderTextColor="#999" keyboardType="decimal-pad" style={styles.input} />

          {/* Notas */}
          <Text style={styles.label}>Notas (opcional)</Text>
          <TextInput value={notas} onChangeText={setNotas} placeholder="Notas de la compra…" placeholderTextColor="#999" multiline style={[styles.input, { minHeight: 64, textAlignVertical: 'top' }]} />
        </ScrollView>

        {/* Footer total + crear */}
        <View style={styles.footer}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footLabel}>Total (con flete)</Text>
            <Text style={styles.footTotal}>USD ${money(total)}</Text>
          </View>
          <TouchableOpacity style={[styles.crear, saving && { opacity: 0.5 }]} onPress={confirmar} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.crearText}>Crear compra</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <ProyectoPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(p) => { setProyecto(p); setPickerOpen(false) }} />
    </SafeAreaView>
  )
}

function ProyectoPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (p: Proyecto) => void }) {
  const [search, setSearch] = useState('')
  const { data } = useQuery({ queryKey: ['proyectos'], queryFn: () => proyectosService.getProyectos(), enabled: visible })
  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) => !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q)))
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}><Text style={styles.back}>Cerrar</Text></TouchableOpacity>
          <Text style={styles.hTitle}>Elegir proyecto</Text>
          <View style={{ width: 60 }} />
        </View>
        <View style={{ padding: 16, backgroundColor: '#F4F5F2', flex: 1 }}>
          <TextInput value={search} onChangeText={setSearch} placeholder="Buscar proyecto…" placeholderTextColor="#999" style={styles.input} />
          <FlatList data={filtered} keyExtractor={(p) => String(p.id)} style={{ marginTop: 10 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.pick} onPress={() => onSelect(item)}>
                <Text style={styles.pickCod}>{item.codigo}</Text>
                <Text style={styles.pickNom} numberOfLines={1}>{item.nombre}</Text>
              </TouchableOpacity>
            )} />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#2c3126' },
  header: { backgroundColor: '#2c3126', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
  back: { color: '#fff', fontSize: 14 },
  hTitle: { color: '#C18A2D', fontSize: 15, fontWeight: '700' },
  content: { backgroundColor: '#F4F5F2', padding: 18, paddingBottom: 30, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#2c3126', marginBottom: 6, marginTop: 12 },
  origenRow: { flexDirection: 'row', gap: 8 },
  origen: { flex: 1, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E0DFD9', borderRadius: 9, paddingVertical: 11, alignItems: 'center' },
  origenOn: { backgroundColor: '#2c3126', borderColor: '#2c3126' },
  origenLabel: { fontSize: 13, fontWeight: '700', color: '#5A5F52' },
  origenLabelOn: { color: '#E8C684' },
  origenDesc: { fontSize: 12, color: '#5A5F52', marginTop: 6, fontStyle: 'italic' },
  select: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0DFD9', padding: 12 },
  selectVal: { fontSize: 14, color: '#1F2419', fontWeight: '600' },
  selectPh: { fontSize: 14, color: '#999' },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0DFD9', padding: 12, fontSize: 14, color: '#1F2419' },
  lineaCard: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0DFD9', padding: 12, marginBottom: 10 },
  lineaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  lineaNum: { fontSize: 13, fontWeight: '700', color: '#2c3126' },
  quitar: { color: '#B4463C', fontWeight: '700', fontSize: 12 },
  lineaRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  inSm: { flex: 1 },
  lineaSub: { fontSize: 12, color: '#5A5F52', marginTop: 8, textAlign: 'right' },
  addLinea: { borderWidth: 1, borderColor: '#C18A2D', borderStyle: 'dashed', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginBottom: 6 },
  addLineaText: { color: '#C18A2D', fontWeight: '800', fontSize: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#E0DFD9', paddingHorizontal: 16, paddingVertical: 12 },
  footLabel: { fontSize: 11, color: '#5A5F52' },
  footTotal: { fontSize: 18, fontWeight: '800', color: '#2c3126' },
  crear: { backgroundColor: '#16A34A', borderRadius: 10, paddingHorizontal: 22, paddingVertical: 14 },
  crearText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  pick: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: '#E0DFD9' },
  pickCod: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126' },
  pickNom: { fontSize: 13, color: '#1F2419', marginTop: 2 },
})
