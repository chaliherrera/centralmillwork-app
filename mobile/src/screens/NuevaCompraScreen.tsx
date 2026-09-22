import React, { useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, KeyboardAvoidingView, Platform, FlatList } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { proyectosService, Proyecto } from '../services/proyectos'
import { comprasService, OrigenNoMTO } from '../services/compras'
import type { RootStackParamList } from '../navigation/types'
import {
  Screen, Toolbar, Field, Segmented, PrimaryButton, GhostButton, SearchField, BottomSheet, Icon,
  color, font, size, space,
} from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

interface Linea { descripcion: string; unidad: string; qty: string; unit_price: string }
const lineaVacia = (): Linea => ({ descripcion: '', unidad: 'u', qty: '', unit_price: '' })

const ORIGENES: { key: OrigenNoMTO; label: string; desc: string }[] = [
  { key: 'DIRECTA', label: 'Directa', desc: 'Compra puntual para un proyecto' },
  { key: 'URGENTE', label: 'Urgente', desc: 'Necesidad inmediata de obra' },
  { key: 'OPERATIVA', label: 'Operativa', desc: 'Gasto del taller (sin proyecto)' },
]

function money(n: number) { return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) }

export default function NuevaCompraScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
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
  const setLinea = (i: number, patch: Partial<Linea>) => setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  const addLinea = () => setLineas((ls) => [...ls, lineaVacia()])
  const delLinea = (i: number) => setLineas((ls) => (ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls))

  const subtotal = lineas.reduce((acc, l) => acc + (parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0), 0)
  const total = subtotal + (parseFloat(freight) || 0)

  const cambiarOrigen = (o: OrigenNoMTO) => { setOrigen(o); if (o === 'OPERATIVA') setProyecto(null) }

  const validar = (): string | null => {
    if (!vendor.trim()) return 'Falta el proveedor (vendor).'
    if (requiereProyecto && !proyecto) return 'Elegí el proyecto.'
    if (lineas.filter((l) => l.descripcion.trim()).length === 0) return 'Agregá al menos un ítem con descripción.'
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
    Alert.alert('Confirmar compra',
      `Vas a crear una compra ${origen.toLowerCase()} a ${vendor.trim()} por USD ${money(total)}` +
      (origen === 'OPERATIVA' ? '.\n\nSe registra como YA recibida (gasto de taller).' : '.') + '\n\n¿Continuar?',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Crear compra', onPress: crear }])
  }

  const crear = async () => {
    if (saving) return
    setSaving(true)
    try {
      const items = lineas.filter((l) => l.descripcion.trim())
        .map((l) => ({ descripcion: l.descripcion.trim(), unidad: l.unidad.trim() || 'u', qty: parseFloat(l.qty), unit_price: parseFloat(l.unit_price) }))
      const r = await comprasService.crearOCNoMTO({
        proyecto_id: requiereProyecto ? proyecto!.id : null,
        vendor: vendor.trim(), origen, categoria: categoria.trim() || null, notas: notas.trim() || null, items,
        freight: parseFloat(freight) || 0,
      })
      Alert.alert('Compra creada', `${r.numero} · USD ${money(r.total)} · ${r.materiales_count} ítem(s)`, [{ text: 'OK', onPress: () => nav.goBack() }])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo crear la compra')
    } finally { setSaving(false) }
  }

  const origenesVisibles = ORIGENES.filter((o) => o.key !== 'OPERATIVA' || esAdmin)

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Compra sin MTO" onBack={() => nav.goBack()} />
      <KeyboardAvoidingView style={{ flex: 1, paddingTop: insets.top + 62 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 62}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Text style={styles.label}>Tipo de compra</Text>
          <Segmented options={origenesVisibles.map((o) => ({ value: o.key, label: o.label }))} value={origen} onChange={cambiarOrigen} />
          <Text style={styles.hint}>{ORIGENES.find((o) => o.key === origen)?.desc}</Text>

          {requiereProyecto ? (
            <>
              <Text style={styles.label}>Proyecto</Text>
              <Pressable onPress={() => setPickerOpen(true)} style={({ pressed }) => [styles.select, pressed && { opacity: 0.7 }]}>
                <Text style={proyecto ? styles.selVal : styles.selPh} numberOfLines={1}>{proyecto ? `${proyecto.codigo} · ${proyecto.nombre}` : 'Elegir proyecto…'}</Text>
                <Icon name="chevronDown" size={16} color={color.mutedStrong} strokeWidth={1.8} />
              </Pressable>
            </>
          ) : null}

          <Field label="Proveedor" value={vendor} onChangeText={setVendor} placeholder="Nombre del proveedor" style={{ marginTop: 16 }} />
          <Field label="Categoría (opcional)" value={categoria} onChangeText={setCategoria} placeholder="Ej. Herrajes, Insumos…" style={{ marginTop: 16 }} />

          <Text style={[styles.label, { marginTop: 20 }]}>Ítems</Text>
          {lineas.map((l, i) => (
            <View key={i} style={styles.linea}>
              <View style={styles.lineaTop}>
                <Text style={styles.lineaNum}>Ítem {i + 1}</Text>
                {lineas.length > 1 ? <Pressable onPress={() => delLinea(i)} hitSlop={8}><Text style={styles.quitar}>Quitar</Text></Pressable> : null}
              </View>
              <Field value={l.descripcion} onChangeText={(t) => setLinea(i, { descripcion: t })} placeholder="Descripción" />
              <View style={styles.lineaRow}>
                <Field value={l.unidad} onChangeText={(t) => setLinea(i, { unidad: t })} placeholder="Unidad" style={{ flex: 1 }} />
                <Field value={l.qty} onChangeText={(t) => setLinea(i, { qty: t })} placeholder="Cant." keyboardType="decimal-pad" style={{ flex: 1 }} />
                <Field value={l.unit_price} onChangeText={(t) => setLinea(i, { unit_price: t })} placeholder="Precio u." keyboardType="decimal-pad" style={{ flex: 1 }} />
              </View>
              <Text style={styles.lineaSub}>Subtotal: ${money((parseFloat(l.qty) || 0) * (parseFloat(l.unit_price) || 0))}</Text>
            </View>
          ))}
          <Pressable onPress={addLinea} style={({ pressed }) => [styles.addLinea, pressed && { opacity: 0.6 }]}>
            <Icon name="plus" size={16} color={color.gold} strokeWidth={2.4} />
            <Text style={styles.addLineaText}>Agregar ítem</Text>
          </Pressable>

          <Field label="Flete (opcional)" value={freight} onChangeText={setFreight} placeholder="0.00" keyboardType="decimal-pad" style={{ marginTop: 8 }} />
          <Field label="Notas (opcional)" value={notas} onChangeText={setNotas} placeholder="Notas de la compra…" multiline style={{ marginTop: 16 }} />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.footLabel}>Total (con flete)</Text>
            <Text style={styles.footTotal}>USD ${money(total)}</Text>
          </View>
          <PrimaryButton label="Crear compra" icon="check" onPress={confirmar} loading={saving} style={{ paddingHorizontal: 22 }} />
        </View>
      </KeyboardAvoidingView>

      <ProyectoPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} onSelect={(p) => { setProyecto(p); setPickerOpen(false) }} />
    </Screen>
  )
}

function ProyectoPicker({ visible, onClose, onSelect }: { visible: boolean; onClose: () => void; onSelect: (p: Proyecto) => void }) {
  const [search, setSearch] = useState('')
  const { data } = useQuery({ queryKey: ['proyectos'], queryFn: () => proyectosService.getProyectos(), enabled: visible })
  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) => !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q)))
  return (
    <BottomSheet visible={visible} onClose={onClose}>
      <Text style={styles.sheetTitle}>Elegir proyecto</Text>
      <View style={{ marginTop: 12 }}><SearchField value={search} onChangeText={setSearch} placeholder="Buscar proyecto…" /></View>
      <FlatList data={filtered} keyExtractor={(p) => String(p.id)} style={styles.sheetList} keyboardShouldPersistTaps="handled"
        renderItem={({ item }) => (
          <Pressable onPress={() => onSelect(item)} style={({ pressed }) => [styles.pick, pressed && { opacity: 0.6 }]}>
            <Text style={styles.pickCod}>{item.codigo}</Text>
            <Text style={styles.pickNom} numberOfLines={1}>{item.nombre}</Text>
          </Pressable>
        )} />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingBottom: 30 },
  label: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: color.mutedStrong, marginBottom: 10, marginTop: 18 },
  hint: { fontFamily: font.body, fontSize: size.secondary, color: color.muted, marginTop: 8 },
  select: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 56, paddingHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.14)' },
  selVal: { flex: 1, fontFamily: font.bodyMed, fontSize: 16, color: color.ink },
  selPh: { flex: 1, fontFamily: font.body, fontSize: 16, color: color.mutedStrong },
  linea: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line, gap: 12 },
  lineaTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  lineaNum: { fontFamily: font.bodySemi, fontSize: size.row, color: color.ink },
  quitar: { fontFamily: font.bodySemi, fontSize: size.status, color: color.coral },
  lineaRow: { flexDirection: 'row', gap: 8 },
  lineaSub: { fontFamily: font.body, fontSize: size.status, color: color.muted, textAlign: 'right' },
  addLinea: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, marginTop: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, borderStyle: 'dashed', borderColor: 'rgba(217,164,65,0.5)' },
  addLineaText: { fontFamily: font.bodySemi, fontSize: size.secondary, color: color.gold },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.margin, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  footLabel: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong },
  footTotal: { fontFamily: font.titleSemi, fontSize: 20, color: color.ink },
  sheetTitle: { fontFamily: font.titleSemi, fontSize: size.sheetTitle, color: color.ink },
  sheetList: { maxHeight: 380, marginTop: 12 },
  pick: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  pickCod: { fontFamily: font.mono, fontSize: 12, color: color.gold },
  pickNom: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink, marginTop: 2 },
})
