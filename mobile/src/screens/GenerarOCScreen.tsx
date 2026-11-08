import React, { useState } from 'react'
import { View, Text, FlatList, Pressable, StyleSheet, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useQuery } from '@tanstack/react-query'
import { useNavigation } from '@react-navigation/native'
import { proyectosService, Proyecto } from '../services/proyectos'
import { comprasService } from '../services/compras'
import {
  Screen, Toolbar, SearchField, ListRow, PrimaryButton, Icon, LoadingRows, ErrorState, EmptyState,
  color, font, size, space,
} from '../ui'

function money(v: string | number) {
  const n = typeof v === 'number' ? v : parseFloat(v)
  return isNaN(n) ? '0.00' : n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default function GenerarOCScreen() {
  const nav = useNavigation<any>()
  const [proyecto, setProyecto] = useState<Proyecto | null>(null)
  if (!proyecto) return <SelectorProyecto onSelect={setProyecto} onBack={() => nav.goBack()} />
  return <Vendors proyecto={proyecto} onBack={() => setProyecto(null)} />
}

function SelectorProyecto({ onSelect, onBack }: { onSelect: (p: Proyecto) => void; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const [search, setSearch] = useState('')
  const { data, isLoading, isError, refetch } = useQuery({ queryKey: ['proyectos'], queryFn: () => proyectosService.getProyectos() })
  const q = search.toLowerCase().trim()
  const filtered = (data ?? []).filter((p) => !q || [p.codigo, p.nombre, p.cliente].some((x) => x?.toLowerCase().includes(q)))
  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Emitir OC" subtitle="Elegí el proyecto" onBack={onBack} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}><SearchField value={search} onChangeText={setSearch} placeholder="Buscar proyecto…" /></View>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar los proyectos" onRetry={refetch} />
          : <FlatList data={filtered} keyExtractor={(p) => String(p.id)} contentContainerStyle={styles.list}
              renderItem={({ item }) => <ListRow code={item.codigo} title={item.nombre} meta={item.cliente ?? undefined} onPress={() => onSelect(item)} />} />}
      </View>
    </Screen>
  )
}

function Vendors({ proyecto, onBack }: { proyecto: Proyecto; onBack: () => void }) {
  const insets = useSafeAreaInsets()
  const { data, isLoading, isError, refetch } = useQuery({
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
    Alert.alert('Confirmar emisión',
      `Vas a emitir ${seleccionados.length} orden(es) de compra por un total de USD ${money(totalSel)}.\n\n` +
      seleccionados.map((v) => `• ${v.vendor}: ${v.materiales_count} ítem(s) · $${money(v.total)}`).join('\n') +
      `\n\nEsto crea OCs reales con numeración correlativa. ¿Continuar?`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: `Emitir ${seleccionados.length} OC(s)`, onPress: emitir }])
  }

  const emitir = async () => {
    if (saving) return
    setSaving(true)
    try {
      const res = await comprasService.generarOCs(proyecto.id, seleccionados.map((v) => ({ vendor: v.vendor, fecha_entrega_estimada: null })))
      Alert.alert('OC(s) emitidas', `Se crearon: ${res.map((r) => r.numero).join(', ')}`, [{ text: 'OK', onPress: () => { setSel(new Set()); refetch() } }])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudieron emitir las OCs')
    } finally { setSaving(false) }
  }

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Emitir OC" subtitle={`${proyecto.codigo} · ${proyecto.nombre}`} onBack={onBack} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        {isLoading ? <View style={styles.pad}><LoadingRows /></View>
          : isError ? <ErrorState message="No se pudieron cargar los vendors" onRetry={refetch} />
          : vendors.length === 0 ? <EmptyState title="Sin vendors cotizados" line="No hay material cotizado para emitir OC." />
          : (
            <>
              <FlatList
                data={vendors} keyExtractor={(v) => v.vendor} contentContainerStyle={styles.list}
                renderItem={({ item }) => {
                  const on = sel.has(item.vendor)
                  return (
                    <Pressable onPress={() => toggle(item.vendor)} style={({ pressed }) => [styles.vendor, pressed && { opacity: 0.6 }]}>
                      <View style={[styles.check, on && styles.checkOn]}>{on ? <Icon name="check" size={14} color={color.onGold} strokeWidth={2.6} /> : null}</View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.vName}>{item.vendor}</Text>
                        <Text style={styles.vMeta}>{item.materiales_count} ítem(s) cotizado(s)</Text>
                      </View>
                      <Text style={styles.vTotal}>${money(item.total)}</Text>
                    </Pressable>
                  )
                }}
              />
              <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.footLabel}>{seleccionados.length} seleccionado(s)</Text>
                  <Text style={styles.footTotal}>USD ${money(totalSel)}</Text>
                </View>
                <PrimaryButton label="Emitir OC" icon="doc" onPress={confirmar} loading={saving} disabled={seleccionados.length === 0} style={{ paddingHorizontal: 24 }} />
              </View>
            </>
          )}
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.margin, paddingTop: 8, paddingBottom: 8 },
  pad: { paddingHorizontal: space.margin },
  list: { paddingHorizontal: space.margin, paddingBottom: 20 },
  vendor: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  check: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(245,240,232,0.3)', alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: color.gold, borderColor: color.gold },
  vName: { fontFamily: font.bodySemi, fontSize: size.row, color: color.ink },
  vMeta: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong, marginTop: 3 },
  vTotal: { fontFamily: font.bodyBold, fontSize: size.row, color: color.gold },
  footer: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: space.margin, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  footLabel: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong },
  footTotal: { fontFamily: font.titleSemi, fontSize: 20, color: color.ink },
})
