import React, { useEffect, useState } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Image, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { OrdenCompra } from '../services/ordenesCompra'
import { recepcionesService, MaterialLote, MaterialRecepcion, RecepcionHistorial } from '../services/recepciones'
import { imagenesService } from '../services/imagenes'
import { useAuth } from '../context/AuthContext'
import { EtaBadge } from '../components/EtaBadge'

interface Props {
  oc: OrdenCompra
  onBack: () => void
  onSaved: () => void
}

interface MaterialState extends MaterialLote {
  recibido: boolean
  nota: string
  alreadyReceived: boolean
}

export default function OCDetailScreen({ oc, onBack, onSaved }: Props) {
  const { user } = useAuth()
  const [materiales, setMateriales] = useState<MaterialState[]>([])
  const [historial, setHistorial] = useState<RecepcionHistorial[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [previewPhoto, setPreviewPhoto] = useState<string | null>(null)
  const [notas, setNotas] = useState('')
  const [tipo, setTipo] = useState<'total' | 'parcial'>('total')

  useEffect(() => {
    (async () => {
      try {
        const [matsData, histData] = await Promise.all([
          recepcionesService.getMaterialesLote(oc.id),
          recepcionesService.getHistorial(oc.id),
        ])
        setHistorial(histData)
        // Set de id_material que ya se marcaron como recibidos en alguna recepción previa.
        const receivedIds = new Set<number>()
        for (const rec of histData) {
          for (const rm of rec.materiales) {
            if (rm.recibido && rm.id_material != null) receivedIds.add(rm.id_material)
          }
        }
        setMateriales(matsData.map((m) => {
          const ya = receivedIds.has(m.id)
          return { ...m, recibido: ya, nota: '', alreadyReceived: ya }
        }))
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.message || 'No se pudieron cargar los datos')
      } finally {
        setLoading(false)
      }
    })()
  }, [oc.id])

  const toggleRecibido = (idx: number) => {
    setMateriales((prev) =>
      prev.map((m, i) => {
        if (i !== idx || m.alreadyReceived) return m
        return { ...m, recibido: !m.recibido }
      })
    )
  }

  const activeMats = materiales.filter((m) => !m.alreadyReceived)
  const allActiveChecked = activeMats.length > 0 && activeMats.every((m) => m.recibido)
  const toggleAll = () => {
    const newVal = !allActiveChecked
    setMateriales((prev) =>
      prev.map((m) => (m.alreadyReceived ? m : { ...m, recibido: newVal }))
    )
  }

  // ETA vencida: la OC pasó la fecha de entrega y no está recibida ni cancelada.
  const isVencida = (() => {
    if (!oc.fecha_entrega_estimada) return false
    if (oc.estado === 'recibida' || oc.estado === 'cancelada') return false
    const eta = new Date(oc.fecha_entrega_estimada.slice(0, 10) + 'T00:00:00')
    if (isNaN(eta.getTime())) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return eta.getTime() < today.getTime()
  })()

  // Para el timeline: ETA "pasada" si hoy >= ETA. Recepción "hecha" si hay
  // alguna recepción completa o con_diferencias en el historial.
  const etaPasada = (() => {
    if (!oc.fecha_entrega_estimada) return false
    const eta = new Date(oc.fecha_entrega_estimada.slice(0, 10) + 'T00:00:00')
    if (isNaN(eta.getTime())) return false
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return eta.getTime() <= today.getTime()
  })()
  const ultimaRecepcion = historial.find((r) => r.estado !== 'pendiente')
  const recepcionHecha = !!ultimaRecepcion

  const updateNota = (idx: number, nota: string) => {
    setMateriales((prev) =>
      prev.map((m, i) => (i === idx ? { ...m, nota } : m))
    )
  }

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) {
      Alert.alert('Permiso denegado', 'Necesitás permitir el acceso a la cámara para tomar fotos.')
      return
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.7,
      allowsEditing: false,
    })
    if (!result.canceled && result.assets?.[0]?.uri) {
      setPhotos((prev) => [...prev, result.assets[0].uri])
    }
  }

  const eliminarFoto = (uri: string) => {
    setPhotos((prev) => prev.filter((p) => p !== uri))
  }

  const handleGuardar = () => {
    Alert.alert(
      'Confirmar recepción',
      `Vas a registrar una recepción ${tipo === 'total' ? 'TOTAL' : 'PARCIAL'} con ${photos.length} foto(s).\n\n¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          style: 'default',
          onPress: () => guardarRecepcion(tipo),
        },
      ]
    )
  }

  const guardarRecepcion = async (tipo: 'total' | 'parcial') => {
    setSaving(true)
    try {
      // Solo enviamos los materiales que NO se recibieron en una recepción anterior.
      // Los ya recibidos no se duplican; el backend confía en el historial.
      const materialesPayload: MaterialRecepcion[] = materiales
        .filter((m) => !m.alreadyReceived)
        .map((m) => ({
          id_material: m.id,
          cm_code: m.codigo,
          descripcion: m.descripcion,
          recibido: m.recibido,
          nota: m.nota || undefined,
        }))

      // 1. Crear la recepción
      await recepcionesService.crear({
        orden_compra_id: oc.id,
        tipo,
        fecha_recepcion: new Date().toISOString().split('T')[0],
        recibio: user?.nombre,
        notas: notas || undefined,
        materiales: materialesPayload,
      })

      // 2. Subir cada foto
      if (photos.length > 0) {
        for (const uri of photos) {
          try {
            await imagenesService.upload(oc.id, uri, 'recepcion')
          } catch (err) {
            console.warn('Error subiendo foto:', err)
          }
        }
      }

      Alert.alert(
        '¡Recepción registrada!',
        `Se creó la recepción para ${oc.numero}.`,
        [{ text: 'OK', onPress: onSaved }]
      )
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar la recepción')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#C18A2D" />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>← Volver</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>{oc.numero}</Text>
          <View style={[
            styles.headerBadge,
            oc.estado_display === 'EN_TRANSITO' ? styles.headerBadgeTransito : styles.headerBadgeOrdenado,
          ]}>
            <Text style={[
              styles.headerBadgeText,
              { color: oc.estado_display === 'EN_TRANSITO' ? '#BFDBFE' : '#FCD34D' },
            ]}>
              {oc.estado_display === 'EN_TRANSITO' ? '🚚 EN TRÁNSITO' : '🛒 ORDENADO'}
            </Text>
          </View>
        </View>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* OC Info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoLabel}>Vendor</Text>
          <Text style={styles.infoValue}>{oc.proveedor?.nombre || '—'}</Text>

          <Text style={styles.infoLabel}>Proyecto</Text>
          <Text style={styles.infoValue}>{oc.proyecto?.codigo} · {oc.proyecto?.nombre}</Text>

          <View style={styles.infoRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>Total</Text>
              <Text style={styles.infoTotal}>${parseFloat(oc.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.infoLabel}>ETA</Text>
              <EtaBadge eta={oc.fecha_entrega_estimada} />
            </View>
          </View>
        </View>

        {/* Timeline */}
        <View style={styles.timeline}>
          <View style={styles.tlNode}>
            <View style={[styles.tlDot, styles.tlDotDone]} />
            <Text style={styles.tlLabel}>EMISIÓN</Text>
            <Text style={styles.tlDate}>{oc.fecha_emision?.slice(0, 10) || '—'}</Text>
          </View>
          <View style={[styles.tlConnector, etaPasada && styles.tlConnectorDone]} />
          <View style={styles.tlNode}>
            <View style={[styles.tlDot, etaPasada ? styles.tlDotDone : styles.tlDotPending]} />
            <Text style={styles.tlLabel}>ETA</Text>
            <Text style={styles.tlDate}>{oc.fecha_entrega_estimada?.slice(0, 10) || 'sin fecha'}</Text>
          </View>
          <View style={[styles.tlConnector, recepcionHecha && styles.tlConnectorDone]} />
          <View style={styles.tlNode}>
            <View style={[styles.tlDot, recepcionHecha ? styles.tlDotDone : styles.tlDotPending]} />
            <Text style={styles.tlLabel}>RECEPCIÓN</Text>
            <Text style={styles.tlDate}>
              {ultimaRecepcion?.fecha_recepcion?.slice(0, 10) || 'pendiente'}
            </Text>
          </View>
        </View>

        {/* ETA alert */}
        {isVencida && (
          <View style={styles.etaAlert}>
            <Text style={styles.etaAlertText}>⚠ ETA vencida — recibir con urgencia</Text>
          </View>
        )}

        {/* Historial de recepciones previas */}
        {historial.length > 0 && (
          <>
            <Text style={styles.sectionTitle}>Historial de recepciones</Text>
            {historial.map((rec) => {
              const esTotal = rec.estado === 'completa'
              const recibidos = rec.materiales.filter((m) => m.recibido).length
              const totalMats = rec.materiales.length
              const fecha = rec.fecha_recepcion ? rec.fecha_recepcion.slice(0, 10) : '—'
              return (
                <View key={rec.id} style={[
                  styles.histCard,
                  esTotal ? styles.histCardTotal : styles.histCardParcial,
                ]}>
                  <View style={styles.histHeaderRow}>
                    <Text style={styles.histFolio}>{rec.folio}</Text>
                    <View style={[
                      styles.histBadge,
                      esTotal ? styles.histBadgeTotal : styles.histBadgeParcial,
                    ]}>
                      <Text style={[
                        styles.histBadgeText,
                        { color: esTotal ? '#1B5E20' : '#1E40AF' },
                      ]}>
                        {esTotal ? 'TOTAL' : 'PARCIAL'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.histMeta}>
                    {fecha}{rec.recibio ? ` · ${rec.recibio}` : ''}
                  </Text>
                  {rec.notas && (
                    <Text style={styles.histNotes}>"{rec.notas}"</Text>
                  )}
                  {totalMats > 0 && (
                    <Text style={styles.histStats}>
                      {recibidos}/{totalMats} materiales recibidos
                    </Text>
                  )}
                </View>
              )
            })}
          </>
        )}

        {/* Materiales */}
        <View style={styles.matsHeaderRow}>
          <Text style={styles.sectionTitle}>Materiales del lote ({materiales.length})</Text>
          {activeMats.length > 0 && (
            <TouchableOpacity onPress={toggleAll}>
              <Text style={styles.markAllBtn}>{allActiveChecked ? 'Desmarcar todos' : 'Marcar todos'}</Text>
            </TouchableOpacity>
          )}
        </View>
        <Text style={styles.sectionHelp}>Tocá un material para marcar/desmarcar como recibido</Text>

        {materiales.map((m, idx) => {
          const isYa = m.alreadyReceived
          const isCheck = m.recibido || isYa
          return (
            <TouchableOpacity
              key={`${m.id}-${idx}`}
              onPress={() => toggleRecibido(idx)}
              style={[
                styles.matCard,
                isYa ? styles.matCardYaRecibido : (m.recibido && styles.matCardRecibido),
              ]}
              activeOpacity={isYa ? 1 : 0.7}
              disabled={isYa}
            >
              <View style={styles.matRow}>
                <View style={[
                  styles.checkbox,
                  isCheck && styles.checkboxOn,
                  isYa && styles.checkboxYa,
                ]}>
                  {isCheck && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.matCode}>{m.codigo || 'Sin código'}</Text>
                  <Text style={styles.matDesc} numberOfLines={2}>{m.descripcion || 'Sin descripción'}</Text>
                  <Text style={styles.matMeta}>
                    Qty: {m.qty ?? '—'} {m.unidad || ''} · {m.vendor || '—'}
                  </Text>
                  {isYa && (
                    <Text style={styles.yaRecibidoBadge}>✓ Ya recibido en recepción anterior</Text>
                  )}
                </View>
              </View>
              {!isYa && !m.recibido && (
                <TextInput
                  value={m.nota}
                  onChangeText={(t) => updateNota(idx, t)}
                  placeholder="Nota: motivo de no recepción..."
                  placeholderTextColor="#999"
                  style={styles.matNotaInput}
                  multiline
                />
              )}
            </TouchableOpacity>
          )
        })}

        {/* Fotos */}
        <Text style={styles.sectionTitle}>Fotos ({photos.length})</Text>
        <View style={styles.photosGrid}>
          {photos.map((uri) => (
            <TouchableOpacity key={uri} onPress={() => setPreviewPhoto(uri)} style={styles.photoBox}>
              <Image source={{ uri }} style={styles.photoThumb} />
              <TouchableOpacity onPress={() => eliminarFoto(uri)} style={styles.photoDelBtn}>
                <Text style={styles.photoDelText}>×</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={tomarFoto} style={styles.photoAdd}>
            <Text style={styles.photoAddIcon}>📷</Text>
            <Text style={styles.photoAddText}>Tomar foto</Text>
          </TouchableOpacity>
        </View>

        {/* Notas generales */}
        <Text style={styles.sectionTitle}>Notas generales</Text>
        <TextInput
          value={notas}
          onChangeText={setNotas}
          placeholder="Observaciones de la recepción..."
          placeholderTextColor="#999"
          style={styles.notasInput}
          multiline
          numberOfLines={3}
        />

        {/* Tipo de recepción */}
        <Text style={styles.sectionTitle}>Tipo de recepción</Text>
        <View style={styles.tipoRow}>
          <TouchableOpacity
            onPress={() => setTipo('total')}
            style={[
              styles.tipoBtn,
              tipo === 'total' ? styles.tipoBtnActiveTotal : styles.tipoBtnInactive,
            ]}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tipoBtnText,
              { color: tipo === 'total' ? '#1B5E20' : '#9A9A9A' },
            ]}>
              ✓ TOTAL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTipo('parcial')}
            style={[
              styles.tipoBtn,
              tipo === 'parcial' ? styles.tipoBtnActiveParcial : styles.tipoBtnInactive,
            ]}
            activeOpacity={0.7}
          >
            <Text style={[
              styles.tipoBtnText,
              { color: tipo === 'parcial' ? '#1E40AF' : '#9A9A9A' },
            ]}>
              ⟳ PARCIAL
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.tipoHelp}>
          {tipo === 'total'
            ? 'OC pasa a EN EL TALLER — recepción completa.'
            : 'OC pasa a EN TRÁNSITO — quedan materiales pendientes.'}
        </Text>

        {/* Botón guardar */}
        <TouchableOpacity
          onPress={handleGuardar}
          disabled={saving}
          style={[
            styles.saveBtn,
            tipo === 'total' ? styles.saveBtnTotal : styles.saveBtnParcial,
            saving && styles.saveBtnDisabled,
          ]}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>
              {tipo === 'total' ? '✓ Registrar Recepción TOTAL' : '⟳ Registrar Recepción PARCIAL'}
            </Text>
          )}
        </TouchableOpacity>
      </ScrollView>

      {/* Preview de foto fullscreen */}
      <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)}>
        <View style={styles.previewBackdrop}>
          <TouchableOpacity onPress={() => setPreviewPhoto(null)} style={styles.previewClose}>
            <Text style={styles.previewCloseText}>×</Text>
          </TouchableOpacity>
          {previewPhoto && <Image source={{ uri: previewPhoto }} style={styles.previewImage} resizeMode="contain" />}
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  header: {
    backgroundColor: '#2c3126', paddingVertical: 14, paddingHorizontal: 14,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
  },
  backBtn: { paddingVertical: 4, paddingHorizontal: 8 },
  backText: { color: '#fff', fontSize: 14 },
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#C18A2D', fontSize: 16, fontWeight: '700', fontFamily: 'Courier' },
  headerBadge: {
    marginTop: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
    borderWidth: 1,
  },
  headerBadgeOrdenado: { backgroundColor: 'rgba(252,211,77,0.12)', borderColor: 'rgba(252,211,77,0.35)' },
  headerBadgeTransito: { backgroundColor: 'rgba(96,165,250,0.12)', borderColor: 'rgba(96,165,250,0.35)' },
  headerBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  content: { padding: 16, paddingBottom: 40 },

  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  infoCard: {
    backgroundColor: '#fff', borderRadius: 10, padding: 16, marginBottom: 16,
    borderLeftWidth: 4, borderLeftColor: '#C18A2D',
  },
  infoLabel: { fontSize: 11, color: '#5A5F52', textTransform: 'uppercase', letterSpacing: 1, marginTop: 8 },
  infoValue: { fontSize: 14, color: '#1F2419', marginTop: 2, fontWeight: '500' },
  infoTotal: { fontSize: 18, color: '#C18A2D', fontWeight: '700', marginTop: 2 },
  infoRow: { flexDirection: 'row', gap: 12, marginTop: 4 },

  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#2c3126', marginTop: 18, marginBottom: 4 },
  sectionHelp: { fontSize: 12, color: '#5A5F52', marginBottom: 8, fontStyle: 'italic' },

  matsHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
  },
  markAllBtn: {
    fontSize: 12, color: '#2c3126', fontWeight: '600',
    textDecorationLine: 'underline', paddingVertical: 4,
  },

  timeline: {
    flexDirection: 'row', alignItems: 'flex-start',
    backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 12,
    borderWidth: 1, borderColor: '#E0DFD9',
  },
  tlNode: { flex: 1, alignItems: 'center' },
  tlDot: {
    width: 14, height: 14, borderRadius: 7, borderWidth: 2,
    borderColor: '#C8C5BC', backgroundColor: '#fff', marginBottom: 6,
  },
  tlDotDone:    { backgroundColor: '#5A8A2E', borderColor: '#5A8A2E' },
  tlDotPending: { backgroundColor: '#fff', borderColor: '#C8C5BC' },
  tlConnector: {
    flex: 0.6, height: 2, backgroundColor: '#E0DFD9', marginTop: 7, marginHorizontal: 2,
  },
  tlConnectorDone: { backgroundColor: '#5A8A2E' },
  tlLabel: {
    fontSize: 10, fontWeight: '700', color: '#5A5F52',
    letterSpacing: 0.4, textAlign: 'center',
  },
  tlDate: { fontSize: 11, color: '#1F2419', marginTop: 2, textAlign: 'center' },

  etaAlert: {
    backgroundColor: '#FEE2E2', borderColor: '#FCA5A5', borderWidth: 1,
    borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12,
  },
  etaAlertText: { fontSize: 13, color: '#991B1B', fontWeight: '700' },

  matCard: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12, marginBottom: 8,
    borderWidth: 1, borderColor: '#E0DFD9',
  },
  matCardRecibido: {
    backgroundColor: '#F0F7E8', borderColor: '#A8C97A',
  },
  matCardYaRecibido: {
    backgroundColor: '#E8F5E9', borderColor: '#66BB6A', opacity: 0.85,
  },
  matRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  checkbox: {
    width: 24, height: 24, borderRadius: 5, borderWidth: 2, borderColor: '#C8C5BC',
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', marginTop: 2,
  },
  checkboxOn: { backgroundColor: '#5A8A2E', borderColor: '#5A8A2E' },
  checkboxYa: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkmark: { color: '#fff', fontWeight: '700', fontSize: 14 },
  matCode: { fontSize: 13, fontWeight: '700', color: '#2c3126', fontFamily: 'Courier' },
  matDesc: { fontSize: 13, color: '#1F2419', marginTop: 2 },
  matMeta: { fontSize: 11, color: '#5A5F52', marginTop: 4 },
  yaRecibidoBadge: {
    fontSize: 11, color: '#1B5E20', fontWeight: '700', marginTop: 4,
    letterSpacing: 0.3,
  },
  matNotaInput: {
    backgroundColor: '#fff', borderRadius: 6, padding: 8, marginTop: 8,
    borderWidth: 1, borderColor: '#E0DFD9', fontSize: 13, color: '#1F2419', minHeight: 40,
  },

  histCard: {
    borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1,
  },
  histCardTotal:   { backgroundColor: '#F0F7E8', borderColor: '#A8C97A' },
  histCardParcial: { backgroundColor: '#EFF6FF', borderColor: '#93C5FD' },
  histHeaderRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  histFolio: { fontSize: 12, fontFamily: 'Courier', color: '#5A5F52', fontWeight: '600' },
  histBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999 },
  histBadgeTotal:   { backgroundColor: '#D7EAC0' },
  histBadgeParcial: { backgroundColor: '#DBEAFE' },
  histBadgeText: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
  histMeta: { fontSize: 12, color: '#5A5F52' },
  histNotes: { fontSize: 12, color: '#5A5F52', fontStyle: 'italic', marginTop: 2 },
  histStats: { fontSize: 11, color: '#7A7E70', marginTop: 4 },

  photosGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  photoBox: { width: 100, height: 100, borderRadius: 8, overflow: 'hidden', position: 'relative' },
  photoThumb: { width: '100%', height: '100%' },
  photoDelBtn: {
    position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)',
    width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
  },
  photoDelText: { color: '#fff', fontSize: 14, fontWeight: '700', lineHeight: 16 },
  photoAdd: {
    width: 100, height: 100, borderRadius: 8, borderWidth: 2, borderColor: '#C18A2D',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FAF3E3',
  },
  photoAddIcon: { fontSize: 28 },
  photoAddText: { fontSize: 11, color: '#C18A2D', fontWeight: '600', marginTop: 4 },

  notasInput: {
    backgroundColor: '#fff', borderRadius: 8, padding: 12, fontSize: 14,
    borderWidth: 1, borderColor: '#E0DFD9', minHeight: 60, color: '#1F2419',
    textAlignVertical: 'top',
  },

  tipoRow: { flexDirection: 'row', gap: 10, marginBottom: 6 },
  tipoBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
  },
  tipoBtnInactive: { borderColor: '#E0DFD9', backgroundColor: '#fff' },
  tipoBtnActiveTotal: { borderColor: '#5A8A2E', backgroundColor: '#F0F7E8' },
  tipoBtnActiveParcial: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  tipoBtnText: { fontSize: 14, fontWeight: '700', letterSpacing: 0.4 },
  tipoHelp: { fontSize: 12, color: '#5A5F52', fontStyle: 'italic', marginBottom: 4 },

  saveBtn: {
    borderRadius: 10, paddingVertical: 16,
    alignItems: 'center', marginTop: 24,
  },
  saveBtnTotal: { backgroundColor: '#16A34A' },
  saveBtnParcial: { backgroundColor: '#2563EB' },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },

  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  previewClose: { position: 'absolute', top: 60, right: 24, zIndex: 10 },
  previewCloseText: { color: '#fff', fontSize: 36, fontWeight: '300' },
  previewImage: { width: '100%', height: '90%' },
})
