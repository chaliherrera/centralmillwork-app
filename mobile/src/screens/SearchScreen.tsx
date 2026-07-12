// SearchScreen — feature "Buscar" (2026-07-12)
// Flow guiado por el user real (Chali): proyecto primero, después vendor/
// código/descripción. Resuelve el caso "carpintero pregunta por material,
// tengo que volver a la oficina para consultar recepción y fotos".

import React, { useEffect, useState, useCallback, useMemo } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, TextInput,
  ActivityIndicator, Modal, Image, ScrollView, Alert,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { mobileService, ProyectoLite, SearchMaterial, SearchOC, SearchResult, VendorLite } from '../services/mobile'

interface Props {
  onBack: () => void
}

// Debounce simple sin librerías extra
function useDebounced<T>(value: T, delay = 400): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return v
}

export default function SearchScreen({ onBack }: Props) {
  const [proyectos, setProyectos] = useState<ProyectoLite[]>([])
  const [proyectoId, setProyectoId] = useState<number | null>(null)
  const [proyectoPickerOpen, setProyectoPickerOpen] = useState(false)
  const [q, setQ] = useState('')
  const debouncedQ = useDebounced(q)

  // Vendor dropdown (2026-07-12): reemplaza búsqueda por texto libre. El
  // user prefiere elegir de la lista de vendors del proyecto. Se carga al
  // seleccionar proyecto; se limpia al cambiar proyecto o al limpiarlo.
  const [vendors, setVendors] = useState<VendorLite[]>([])
  const [vendorPickerOpen, setVendorPickerOpen] = useState(false)
  const [vendor, setVendor] = useState<string | null>(null)
  const [vendorsLoading, setVendorsLoading] = useState(false)

  const [result, setResult] = useState<SearchResult | null>(null)
  const [searching, setSearching] = useState(false)
  const [proyectosLoading, setProyectosLoading] = useState(true)

  const [selectedMaterial, setSelectedMaterial] = useState<SearchMaterial | null>(null)

  // Cargar proyectos activos una vez
  useEffect(() => {
    let mounted = true
    mobileService.proyectos()
      .then((data) => { if (mounted) setProyectos(data) })
      .catch((err) => Alert.alert('Error', err?.response?.data?.message || 'No se pudo cargar proyectos'))
      .finally(() => { if (mounted) setProyectosLoading(false) })
    return () => { mounted = false }
  }, [])

  // Cargar vendors del proyecto seleccionado
  useEffect(() => {
    if (!proyectoId) {
      setVendors([])
      setVendor(null)
      return
    }
    let mounted = true
    setVendorsLoading(true)
    mobileService.proyectoVendors(proyectoId)
      .then((data) => { if (mounted) setVendors(data) })
      .catch(() => { if (mounted) setVendors([]) })
      .finally(() => { if (mounted) setVendorsLoading(false) })
    return () => { mounted = false }
  }, [proyectoId])

  // Buscar cuando cambia proyecto, vendor o query (debounced)
  const runSearch = useCallback(async () => {
    if (!proyectoId && !vendor && !debouncedQ.trim()) {
      setResult(null)
      return
    }
    setSearching(true)
    try {
      const r = await mobileService.search({ proyecto_id: proyectoId, vendor, q: debouncedQ })
      setResult(r)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'Error de búsqueda')
    } finally {
      setSearching(false)
    }
  }, [proyectoId, vendor, debouncedQ])

  useEffect(() => { runSearch() }, [runSearch])

  const proyectoSeleccionado = useMemo(
    () => proyectos.find((p) => p.id === proyectoId) ?? null,
    [proyectos, proyectoId]
  )

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backTxt}>‹ Recepciones</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Buscar</Text>
        <View style={styles.backBtn} />
      </View>

      {/* Filtros */}
      <View style={styles.filters}>
        {/* Proyecto */}
        <TouchableOpacity
          style={styles.proyectoBtn}
          onPress={() => setProyectoPickerOpen(true)}
          disabled={proyectosLoading}
        >
          <Text style={styles.filterLabel}>PROYECTO</Text>
          <Text style={styles.proyectoValue} numberOfLines={1}>
            {proyectosLoading
              ? 'Cargando...'
              : proyectoSeleccionado
                ? `${proyectoSeleccionado.codigo} · ${proyectoSeleccionado.nombre}`
                : 'Todos los proyectos'}
          </Text>
          <Text style={styles.chevron}>▾</Text>
        </TouchableOpacity>

        {/* Vendor — solo cuando hay proyecto seleccionado */}
        {proyectoId && (
          <TouchableOpacity
            style={styles.proyectoBtn}
            onPress={() => setVendorPickerOpen(true)}
            disabled={vendorsLoading || vendors.length === 0}
          >
            <Text style={styles.filterLabel}>VENDOR</Text>
            <Text style={styles.proyectoValue} numberOfLines={1}>
              {vendorsLoading
                ? 'Cargando...'
                : vendors.length === 0
                  ? 'Sin vendors en este proyecto'
                  : vendor
                    ? vendor
                    : 'Todos los vendors'}
            </Text>
            {vendor && (
              <TouchableOpacity onPress={() => setVendor(null)} style={styles.clearBtn}>
                <Text style={styles.clearTxt}>✕</Text>
              </TouchableOpacity>
            )}
            {!vendor && <Text style={styles.chevron}>▾</Text>}
          </TouchableOpacity>
        )}

        {/* Query — búsqueda por texto */}
        <View style={styles.searchWrap}>
          <TextInput
            style={styles.searchInput}
            placeholder={proyectoId ? 'Código, descripción, item...' : 'Vendor, código, descripción...'}
            placeholderTextColor="#8a8375"
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {q.length > 0 && (
            <TouchableOpacity onPress={() => setQ('')} style={styles.clearBtn}>
              <Text style={styles.clearTxt}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Resultados */}
      {searching && (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color="#C18A2D" />
        </View>
      )}

      {!searching && !result && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Empezá seleccionando un proyecto</Text>
          <Text style={styles.emptyHint}>
            o escribiendo lo que buscás (código, vendor, descripción)
          </Text>
        </View>
      )}

      {!searching && result && (result.materiales.length === 0 && result.ocs.length === 0) && (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Sin resultados</Text>
          <Text style={styles.emptyHint}>Probá con otro término o cambiá el proyecto</Text>
        </View>
      )}

      {result && (result.materiales.length > 0 || result.ocs.length > 0) && (
        <FlatList
          data={[
            ...(result.materiales.length > 0
              ? [{ type: 'header' as const, label: 'Materiales', count: result.counts.materiales }]
              : []),
            ...result.materiales.map((m) => ({ type: 'material' as const, item: m })),
            ...(result.ocs.length > 0
              ? [{ type: 'header' as const, label: 'Órdenes de compra', count: result.counts.ocs }]
              : []),
            ...result.ocs.map((o) => ({ type: 'oc' as const, item: o })),
          ]}
          keyExtractor={(row, idx) => `${row.type}-${idx}`}
          renderItem={({ item: row }) => {
            if (row.type === 'header') {
              return (
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionHeaderTxt}>{row.label}</Text>
                  <Text style={styles.sectionHeaderCount}>{row.count}</Text>
                </View>
              )
            }
            if (row.type === 'material') {
              return (
                <MaterialCard
                  material={row.item}
                  onPress={() => setSelectedMaterial(row.item)}
                />
              )
            }
            return <OCCard oc={row.item} />
          }}
          contentContainerStyle={{ paddingBottom: 40 }}
        />
      )}

      {/* Picker Proyecto — modal
          Fix (2026-07-12): SafeAreaView con backgroundColor forest para que el
          notch/Dynamic Island quede pintado con el color del header; body
          separado en color cream adentro. Sin esto, el header verde queda
          debajo del status bar y los botones son inaccesibles. */}
      <Modal
        visible={proyectoPickerOpen}
        animationType="slide"
        onRequestClose={() => setProyectoPickerOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#2c3126' }} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Elegí un proyecto</Text>
            <TouchableOpacity onPress={() => setProyectoPickerOpen(false)}>
              <Text style={styles.pickerCancel}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, backgroundColor: '#faf7f0' }}>
            <FlatList
              data={[{ id: null as null, codigo: '—', nombre: 'Todos los proyectos', cliente: null }, ...proyectos]}
              keyExtractor={(p) => String(p.id ?? 'all')}
              renderItem={({ item: p }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerRow,
                    proyectoId === p.id && styles.pickerRowActive,
                  ]}
                  onPress={() => {
                    setProyectoId(p.id)
                    setProyectoPickerOpen(false)
                  }}
                >
                  <Text style={styles.pickerRowCode}>{p.codigo}</Text>
                  <Text style={styles.pickerRowName} numberOfLines={2}>{p.nombre}</Text>
                  {p.cliente && <Text style={styles.pickerRowCliente}>{p.cliente}</Text>}
                </TouchableOpacity>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Picker Vendor — modal
          Vendors únicos del proyecto seleccionado, ordenados por cantidad de
          materiales (los más "voluminosos" arriba). */}
      <Modal
        visible={vendorPickerOpen}
        animationType="slide"
        onRequestClose={() => setVendorPickerOpen(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#2c3126' }} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Elegí un vendor</Text>
            <TouchableOpacity onPress={() => setVendorPickerOpen(false)}>
              <Text style={styles.pickerCancel}>Cancelar</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1, backgroundColor: '#faf7f0' }}>
            <FlatList
              data={[{ vendor: null as unknown as string, count: 0 }, ...vendors]}
              keyExtractor={(v, idx) => v.vendor ?? `all-${idx}`}
              renderItem={({ item: v }) => (
                <TouchableOpacity
                  style={[
                    styles.pickerRow,
                    vendor === v.vendor && styles.pickerRowActive,
                  ]}
                  onPress={() => {
                    setVendor(v.vendor ?? null)
                    setVendorPickerOpen(false)
                  }}
                >
                  <Text style={styles.pickerRowName}>
                    {v.vendor ?? 'Todos los vendors'}
                  </Text>
                  {v.vendor && (
                    <Text style={styles.pickerRowCliente}>
                      {v.count} {v.count === 1 ? 'material' : 'materiales'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </View>
        </SafeAreaView>
      </Modal>

      {/* Detalle Material — modal con fotos
          Fix (2026-07-12): mismo patrón que el picker — SafeAreaView forest
          para el notch, body cream adentro. */}
      <Modal
        visible={!!selectedMaterial}
        animationType="slide"
        onRequestClose={() => setSelectedMaterial(null)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#2c3126' }} edges={['top', 'bottom']}>
          <View style={styles.pickerHeader}>
            <Text style={styles.pickerTitle}>Material</Text>
            <TouchableOpacity onPress={() => setSelectedMaterial(null)}>
              <Text style={styles.pickerCancel}>Cerrar</Text>
            </TouchableOpacity>
          </View>
          {selectedMaterial && (
            <ScrollView contentContainerStyle={styles.detailWrap} style={{ backgroundColor: '#faf7f0' }}>
              {selectedMaterial.codigo && (
                <Text style={styles.detailCode}>{selectedMaterial.codigo}</Text>
              )}
              <Text style={styles.detailDesc}>{selectedMaterial.descripcion}</Text>
              <View style={styles.detailMeta}>
                {selectedMaterial.vendor && <MetaRow label="Vendor"   value={selectedMaterial.vendor} />}
                <MetaRow label="Cantidad"  value={`${selectedMaterial.qty} un.`} />
                {selectedMaterial.unit_price > 0 && (
                  <MetaRow label="Unit price" value={`$${selectedMaterial.unit_price.toFixed(2)}`} />
                )}
                {selectedMaterial.item && <MetaRow label="Item" value={selectedMaterial.item} />}
                <MetaRow label="Estado" value={selectedMaterial.estado_cotiz} />
                {selectedMaterial.oc_numero && (
                  <MetaRow label="OC" value={`${selectedMaterial.oc_numero} · ${selectedMaterial.oc_estado ?? ''}`} />
                )}
                {selectedMaterial.recepcion_folio && (
                  <MetaRow
                    label="Recepción"
                    value={`${selectedMaterial.recepcion_folio}${selectedMaterial.recepcion_fecha ? ` · ${selectedMaterial.recepcion_fecha}` : ''}`}
                  />
                )}
              </View>

              {selectedMaterial.fotos_urls.length > 0 && (
                <View style={styles.fotos}>
                  <Text style={styles.fotosTitle}>Fotos de recepción</Text>
                  {selectedMaterial.fotos_urls.map((url) => (
                    <Image key={url} source={{ uri: url }} style={styles.foto} />
                  ))}
                </View>
              )}

              {selectedMaterial.fotos_urls.length === 0 && (
                <Text style={styles.noFotos}>Sin fotos de recepción registradas</Text>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  )
}

// ─── Sub-componentes ────────────────────────────────────────────────

function MaterialCard({ material, onPress }: { material: SearchMaterial; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.card} onPress={onPress}>
      <View style={styles.cardRow}>
        {material.codigo && (
          <Text style={styles.cardCode}>{material.codigo}</Text>
        )}
        {material.vendor && (
          <Text style={styles.cardVendor}>{material.vendor}</Text>
        )}
      </View>
      <Text style={styles.cardDesc} numberOfLines={2}>{material.descripcion}</Text>
      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaTxt}>{material.qty} un.</Text>
        {material.item && <Text style={styles.cardMetaTxt}>· item {material.item}</Text>}
        <StatusChip estado={material.estado_cotiz} />
        {material.fotos_urls.length > 0 && (
          <Text style={styles.cardMetaTxt}>· 📷 {material.fotos_urls.length}</Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

function OCCard({ oc }: { oc: SearchOC }) {
  return (
    <View style={styles.card}>
      <View style={styles.cardRow}>
        <Text style={styles.cardCode}>{oc.numero}</Text>
        {oc.proveedor_nombre && <Text style={styles.cardVendor}>{oc.proveedor_nombre}</Text>}
      </View>
      <View style={styles.cardMeta}>
        <Text style={styles.cardMetaTxt}>${oc.total.toFixed(2)}</Text>
        <StatusChip estado={oc.estado} />
        {oc.items_cubiertos && (
          <Text style={styles.cardMetaTxt} numberOfLines={1}>· items {oc.items_cubiertos}</Text>
        )}
      </View>
      {oc.fecha_entrega_estimada && (
        <Text style={styles.cardMetaTxt}>ETA {oc.fecha_entrega_estimada}</Text>
      )}
    </View>
  )
}

function StatusChip({ estado }: { estado: string }) {
  const colors = STATE_COLORS[estado.toUpperCase()] || STATE_COLORS.DEFAULT
  return (
    <View style={[styles.chip, { backgroundColor: colors.bg }]}>
      <Text style={[styles.chipTxt, { color: colors.fg }]}>{estado}</Text>
    </View>
  )
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  )
}

// ─── Estilos ────────────────────────────────────────────────────────

const STATE_COLORS: Record<string, { bg: string; fg: string }> = {
  RECIBIDO:    { bg: '#DCEDCD', fg: '#3A5C1C' },
  ORDENADO:    { bg: '#FDEACF', fg: '#8A5A15' },
  COTIZADO:    { bg: '#DDEAF7', fg: '#2A4A6E' },
  PENDIENTE:   { bg: '#F5E1DA', fg: '#8B2F1E' },
  EN_STOCK:    { bg: '#E4EDDA', fg: '#4A6B3A' },
  ENVIADA:     { bg: '#FDEACF', fg: '#8A5A15' },
  RECIBIDA:    { bg: '#DCEDCD', fg: '#3A5C1C' },
  CANCELADA:   { bg: '#EAEAEA', fg: '#666'    },
  EN_TRANSITO: { bg: '#EEE0F2', fg: '#5D3872' },
  DEFAULT:     { bg: '#EAEAEA', fg: '#333'    },
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#faf7f0' },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#2c3126', borderBottomWidth: 1, borderBottomColor: '#1e2119',
  },
  backBtn:         { minWidth: 90 },
  backTxt:         { color: '#C18A2D', fontSize: 14, fontWeight: '500' },
  title:           { color: '#faf7f0', fontSize: 17, fontWeight: '600', letterSpacing: 0.3 },

  filters:         { padding: 12, backgroundColor: '#f0ebe0', borderBottomWidth: 1, borderBottomColor: '#dcd4c0' },
  proyectoBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#dcd4c0',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8,
  },
  filterLabel: {
    fontSize: 10, color: '#7a6e5f', letterSpacing: 1.2, fontWeight: '600',
    marginRight: 8, textTransform: 'uppercase',
  },
  proyectoValue:   { flex: 1, fontSize: 14, color: '#1f1b14', fontWeight: '500' },
  chevron:         { fontSize: 14, color: '#7a6e5f', marginLeft: 8 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#dcd4c0',
    paddingHorizontal: 12,
  },
  searchInput:     { flex: 1, paddingVertical: 12, fontSize: 15, color: '#1f1b14' },
  clearBtn:        { padding: 4 },
  clearTxt:        { color: '#7a6e5f', fontSize: 16 },

  loading:         { padding: 24, alignItems: 'center' },
  empty:           { padding: 40, alignItems: 'center' },
  emptyTitle:      { fontSize: 16, fontWeight: '600', color: '#4a413a', marginBottom: 6 },
  emptyHint:       { fontSize: 13, color: '#7a6e5f', textAlign: 'center' },

  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 10, marginTop: 12,
    backgroundColor: '#ece7dc',
  },
  sectionHeaderTxt:   { fontSize: 11, fontWeight: '700', color: '#7a6e5f', letterSpacing: 1.2, textTransform: 'uppercase' },
  sectionHeaderCount: { fontSize: 12, color: '#7a6e5f', fontVariant: ['tabular-nums'] },

  card: {
    backgroundColor: '#fff', marginHorizontal: 12, marginTop: 8,
    padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e8e0ce',
  },
  cardRow:         { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 },
  cardCode:        { fontFamily: 'Menlo', fontSize: 12, color: '#2c3126', fontWeight: '600', backgroundColor: '#f0ebe0', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 3 },
  cardVendor:      { fontSize: 12, color: '#7a6e5f', flex: 1, marginLeft: 8, textAlign: 'right' },
  cardDesc:        { fontSize: 14, color: '#1f1b14', marginBottom: 6, lineHeight: 19 },
  cardMeta:        { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  cardMetaTxt:     { fontSize: 12, color: '#7a6e5f' },

  chip:            { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  chipTxt:         { fontSize: 10, fontWeight: '700', letterSpacing: 0.6 },

  pickerHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#2c3126',
  },
  pickerTitle:     { color: '#faf7f0', fontSize: 16, fontWeight: '600' },
  pickerCancel:    { color: '#C18A2D', fontSize: 15, fontWeight: '500' },
  pickerRow: {
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e8e0ce',
  },
  pickerRowActive: { backgroundColor: '#f0ebe0' },
  pickerRowCode:   { fontFamily: 'Menlo', fontSize: 12, color: '#7a6e5f', marginBottom: 2 },
  pickerRowName:   { fontSize: 15, color: '#1f1b14', fontWeight: '500' },
  pickerRowCliente:{ fontSize: 12, color: '#7a6e5f', marginTop: 2 },

  detailWrap:      { padding: 16 },
  detailCode:      { fontFamily: 'Menlo', fontSize: 13, color: '#2c3126', backgroundColor: '#f0ebe0', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 4, alignSelf: 'flex-start', marginBottom: 8 },
  detailDesc:      { fontSize: 18, color: '#1f1b14', fontWeight: '600', marginBottom: 16 },
  detailMeta:      { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e8e0ce', padding: 12, marginBottom: 16 },
  metaRow:         { flexDirection: 'row', paddingVertical: 6 },
  metaLabel:       { fontSize: 12, color: '#7a6e5f', width: 100, textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: '600' },
  metaValue:       { flex: 1, fontSize: 14, color: '#1f1b14' },

  fotos:           { gap: 12 },
  fotosTitle:      { fontSize: 12, color: '#7a6e5f', fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
  foto:            { width: '100%', height: 260, borderRadius: 8, backgroundColor: '#ece7dc' },
  noFotos:         { fontSize: 13, color: '#7a6e5f', textAlign: 'center', fontStyle: 'italic', paddingVertical: 20 },
})
