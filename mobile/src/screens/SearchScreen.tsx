// SearchScreen — feature "Buscar". Flujo guiado: proyecto → vendor → texto.
// Resuelve "el carpintero pregunta por un material y hay que volver a la oficina".
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import { View, Text, StyleSheet, FlatList, Pressable, Image, ScrollView, Alert } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { mobileService, ProyectoLite, SearchMaterial, SearchOC, SearchResult, VendorLite } from '../services/mobile'
import {
  Screen, Toolbar, SearchField, BottomSheet, SectionHeader, StatusDot, Icon,
  Spinner, EmptyState, color, font, size, space,
} from '../ui'

interface Props { onBack: () => void }

function useDebounced<T>(value: T, delay = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = setTimeout(() => setV(value), delay); return () => clearTimeout(t) }, [value, delay])
  return v
}

export default function SearchScreen({ onBack }: Props) {
  const insets = useSafeAreaInsets()
  const [proyectos, setProyectos] = useState<ProyectoLite[]>([])
  const [proyectoId, setProyectoId] = useState<number | null>(null)
  const [proyectoPickerOpen, setProyectoPickerOpen] = useState(false)
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q)

  const [vendors, setVendors] = useState<VendorLite[]>([])
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false)
  const [vendor, setVendor] = useState<string | null>(null)
  const [vendorsLoading, setVendorsLoading] = useState(false)

  const [result, setResult] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [proyectosLoading, setProyectosLoading] = useState(true)
  const [selectedMaterial, setSelectedMaterial] = useState<SearchMaterial | null>(null)

  useEffect(() => {
    let mounted = true
    mobileService.proyectos()
      .then((data) => { if (mounted) setProyectos(data) })
      .catch((err) => Alert.alert('Error', err?.response?.data?.message || 'No se pudo cargar proyectos'))
      .finally(() => { if (mounted) setProyectosLoading(false) })
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!proyectoId) { setVendors([]); setVendor(null); return }
    let mounted = true
    setVendorsLoading(true)
    mobileService.proyectoVendors(proyectoId)
      .then((data) => { if (mounted) setVendors(data) })
      .catch(() => { if (mounted) setVendors([]) })
      .finally(() => { if (mounted) setVendorsLoading(false) })
    return () => { mounted = false }
  }, [proyectoId])

  const runSearch = useCallback(async () => {
    if (!proyectoId && !vendor && !debouncedQ.trim()) { setResult(null); return }
    setSearching(true)
    try {
      setResult(await mobileService.search({ proyecto_id: proyectoId, vendor, q: debouncedQ }))
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Error de búsqueda')
    } finally { setSearching(false) }
  }, [proyectoId, vendor, debouncedQ])

  useEffect(() => { runSearch() }, [runSearch])

  const proyectoSeleccionado = useMemo(() => proyectos.find((p) => p.id === proyectoId) ?? null, [proyectos, proyectoId])
  const rows = useMemo(() => {
    if (!result) return []
    return [
      ...(result.materiales.length > 0 ? [{ type: 'header' as const, label: 'Materiales', count: result.counts.materiales }] : []),
      ...result.materiales.map((m) => ({ type: 'material' as const, item: m })),
      ...(result.ocs.length > 0 ? [{ type: 'header' as const, label: 'Órdenes de compra', count: result.counts.ocs }] : []),
      ...result.ocs.map((o) => ({ type: 'oc' as const, item: o })),
    ]
  }, [result])

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Buscar" subtitle="Material u OC por proyecto" onBack={onBack} />
      <View style={{ flex: 1, paddingTop: insets.top + 62 }}>
        <View style={styles.filters}>
          <Selector label="Proyecto" value={proyectosLoading ? 'Cargando…' : proyectoSeleccionado ? `${proyectoSeleccionado.codigo} · ${proyectoSeleccionado.nombre}` : 'Todos los proyectos'} onPress={() => setProyectoPickerOpen(true)} />
          {proyectoId ? (
            <Selector label="Vendor" value={vendorsLoading ? 'Cargando…' : vendors.length === 0 ? 'Sin vendors' : vendor ?? 'Todos los vendors'} onPress={() => vendors.length > 0 && setVendorPickerOpen(true)} onClear={vendor ? () => setVendor(null) : undefined} />
          ) : null}
          <SearchField value={q} onChangeText={setQ} placeholder={proyectoId ? 'Código, descripción, ítem…' : 'Vendor, código, descripción…'} />
        </View>

        {searching ? <Spinner />
          : !result ? <EmptyState title="Empezá por un proyecto" line="O escribí lo que buscás: código, vendor, descripción." />
          : rows.length === 0 ? <EmptyState title="Sin resultados" line="Probá con otro término o cambiá el proyecto." />
          : (
            <FlatList
              data={rows} keyExtractor={(row, idx) => `${row.type}-${idx}`} contentContainerStyle={styles.list}
              renderItem={({ item: row }) => {
                if (row.type === 'header') return <SectionHeader title={row.label} count={row.count} style={{ marginTop: 24, marginBottom: 4 }} />
                if (row.type === 'material') return <MaterialRow material={row.item} onPress={() => setSelectedMaterial(row.item)} />
                return <OCRow oc={row.item} />
              }}
            />
          )}
      </View>

      {/* Picker proyecto */}
      <BottomSheet visible={proyectoPickerOpen} onClose={() => setProyectoPickerOpen(false)}>
        <Text style={styles.sheetTitle}>Elegí un proyecto</Text>
        <FlatList
          style={styles.sheetList}
          data={[{ id: null as number | null, codigo: '—', nombre: 'Todos los proyectos', cliente: null }, ...proyectos]}
          keyExtractor={(p) => String(p.id ?? 'all')}
          renderItem={({ item: p }) => (
            <PickerRow active={proyectoId === p.id} code={p.id ? p.codigo : undefined} title={p.nombre} sub={p.cliente ?? undefined}
              onPress={() => { setProyectoId(p.id); setProyectoPickerOpen(false) }} />
          )}
        />
      </BottomSheet>

      {/* Picker vendor */}
      <BottomSheet visible={vendorPickerOpen} onClose={() => setVendorPickerOpen(false)}>
        <Text style={styles.sheetTitle}>Elegí un vendor</Text>
        <FlatList
          style={styles.sheetList}
          data={[{ vendor: null as unknown as string, count: 0 }, ...vendors]}
          keyExtractor={(v, idx) => v.vendor ?? `all-${idx}`}
          renderItem={({ item: v }) => (
            <PickerRow active={vendor === v.vendor} title={v.vendor ?? 'Todos los vendors'} sub={v.vendor ? `${v.count} ${v.count === 1 ? 'material' : 'materiales'}` : undefined}
              onPress={() => { setVendor(v.vendor ?? null); setVendorPickerOpen(false) }} />
          )}
        />
      </BottomSheet>

      {/* Detalle material */}
      <BottomSheet visible={!!selectedMaterial} onClose={() => setSelectedMaterial(null)}>
        {selectedMaterial ? (
          <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
            {selectedMaterial.codigo ? <Text style={styles.detailCode}>{selectedMaterial.codigo}</Text> : null}
            <Text style={styles.sheetTitle}>{selectedMaterial.descripcion}</Text>
            <View style={{ marginTop: 14 }}>
              {selectedMaterial.vendor ? <MetaRow label="Vendor" value={selectedMaterial.vendor} /> : null}
              <MetaRow label="Cantidad" value={`${selectedMaterial.qty} un.`} />
              {selectedMaterial.unit_price > 0 ? <MetaRow label="Unit price" value={`$${selectedMaterial.unit_price.toFixed(2)}`} /> : null}
              {selectedMaterial.item ? <MetaRow label="Ítem" value={selectedMaterial.item} /> : null}
              <MetaRow label="Estado" value={selectedMaterial.estado_cotiz} dot />
              {selectedMaterial.oc_numero ? <MetaRow label="OC" value={`${selectedMaterial.oc_numero} · ${selectedMaterial.oc_estado ?? ''}`} /> : null}
              {selectedMaterial.recepcion_folio ? <MetaRow label="Recepción" value={`${selectedMaterial.recepcion_folio}${selectedMaterial.recepcion_fecha ? ` · ${selectedMaterial.recepcion_fecha}` : ''}`} /> : null}
            </View>
            {selectedMaterial.fotos_urls.length > 0 ? (
              <View style={{ marginTop: 16, gap: 12 }}>
                <Text style={styles.fotosTitle}>Fotos de recepción</Text>
                {selectedMaterial.fotos_urls.map((url) => <Image key={url} source={{ uri: url }} style={styles.foto} />)}
              </View>
            ) : <Text style={styles.noFotos}>Sin fotos de recepción registradas</Text>}
          </ScrollView>
        ) : null}
      </BottomSheet>
    </Screen>
  )
}

function Selector({ label, value, onPress, onClear }: { label: string; value: string; onPress: () => void; onClear?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.selector, pressed && { opacity: 0.7 }]}>
      <Text style={styles.selLabel}>{label}</Text>
      <Text style={styles.selValue} numberOfLines={1}>{value}</Text>
      {onClear ? <Pressable onPress={onClear} hitSlop={8}><Icon name="x" size={16} color={color.mutedStrong} strokeWidth={2} /></Pressable>
        : <Icon name="chevronDown" size={16} color={color.mutedStrong} strokeWidth={1.8} />}
    </Pressable>
  )
}

function PickerRow({ active, code, title, sub, onPress }: { active: boolean; code?: string; title: string; sub?: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.pickerRow, pressed && { opacity: 0.6 }]}>
      {code ? <Text style={styles.pickerCode}>{code}</Text> : null}
      <Text style={[styles.pickerName, active && { color: color.gold }]}>{title}</Text>
      {sub ? <Text style={styles.pickerSub}>{sub}</Text> : null}
    </Pressable>
  )
}

function MaterialRow({ material, onPress }: { material: SearchMaterial; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
      <View style={styles.rowHead}>
        {material.codigo ? <Text style={styles.code}>{material.codigo}</Text> : <View />}
        {material.vendor ? <Text style={styles.vendorRight} numberOfLines={1}>{material.vendor}</Text> : null}
      </View>
      <Text style={styles.desc} numberOfLines={2}>{material.descripcion}</Text>
      <View style={styles.metaLine}>
        <StatusDot estado={material.estado_cotiz} />
        <Text style={styles.metaTxt}>{material.qty} un.{material.item ? ` · ítem ${material.item}` : ''}{material.fotos_urls.length > 0 ? ` · ${material.fotos_urls.length} foto(s)` : ''}</Text>
      </View>
    </Pressable>
  )
}

function OCRow({ oc }: { oc: SearchOC }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowHead}>
        <Text style={styles.code}>{oc.numero}</Text>
        {oc.proveedor_nombre ? <Text style={styles.vendorRight} numberOfLines={1}>{oc.proveedor_nombre}</Text> : null}
      </View>
      <View style={styles.metaLine}>
        <StatusDot estado={oc.estado} />
        <Text style={styles.metaTxt}>${oc.total.toFixed(2)}{oc.fecha_entrega_estimada ? ` · ETA ${oc.fecha_entrega_estimada}` : ''}</Text>
      </View>
    </View>
  )
}

function MetaRow({ label, value, dot }: { label: string; value: string; dot?: boolean }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaRowLabel}>{label}</Text>
      {dot ? <StatusDot estado={value} /> : <Text style={styles.metaRowValue}>{value}</Text>}
    </View>
  )
}

const styles = StyleSheet.create({
  filters: { paddingHorizontal: space.margin, paddingTop: 8, paddingBottom: 8, gap: 10 },
  selector: { flexDirection: 'row', alignItems: 'center', gap: 10, height: 52, paddingHorizontal: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.14)' },
  selLabel: { fontFamily: font.kickerSemi, fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', color: color.mutedStrong },
  selValue: { flex: 1, fontFamily: font.bodyMed, fontSize: 15, color: color.ink },
  list: { paddingHorizontal: space.margin, paddingBottom: 40 },
  row: { paddingVertical: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 5, gap: 8 },
  code: { fontFamily: font.kickerSemi, fontSize: 12, letterSpacing: 1, color: color.gold },
  vendorRight: { flex: 1, fontFamily: font.body, fontSize: size.status, color: color.mutedStrong, textAlign: 'right' },
  desc: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink, lineHeight: size.row * 1.3 },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  metaTxt: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong },

  sheetTitle: { fontFamily: font.titleSemi, fontSize: size.sheetTitle, color: color.ink },
  sheetList: { maxHeight: 440 },
  pickerRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  pickerCode: { fontFamily: font.mono, fontSize: 12, color: color.mutedStrong, marginBottom: 2 },
  pickerName: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },
  pickerSub: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong, marginTop: 2 },

  detailCode: { fontFamily: font.mono, fontSize: 13, color: color.gold, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7 },
  metaRowLabel: { fontFamily: font.kickerMed, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: color.mutedStrong, width: 100 },
  metaRowValue: { flex: 1, fontFamily: font.body, fontSize: 14, color: color.ink2 },
  fotosTitle: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: color.mutedStrong },
  foto: { width: '100%', height: 240, borderRadius: 14, backgroundColor: color.stripeA },
  noFotos: { fontFamily: font.body, fontSize: size.secondary, color: color.muted, textAlign: 'center', paddingVertical: 20 },
})
