import React, { useEffect, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image, Modal } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { OrdenCompra } from '../services/ordenesCompra'
import { recepcionesService, MaterialLote, MaterialRecepcion, RecepcionHistorial } from '../services/recepciones'
import { imagenesService } from '../services/imagenes'
import { useAuth } from '../context/AuthContext'
import { EtaBadge } from '../components/EtaBadge'
import {
  Screen, Toolbar, SectionHeader, StatusDot, Segmented, PrimaryButton, GhostButton, Field, Icon, Spinner,
  color, font, size, space,
} from '../ui'

interface Props { oc: OrdenCompra; onBack: () => void; onSaved: () => void }
interface MaterialState extends MaterialLote { recibido: boolean; nota: string; alreadyReceived: boolean }

export default function OCDetailScreen({ oc, onBack, onSaved }: Props) {
  const insets = useSafeAreaInsets()
  const { user } = useAuth()
  const isReadOnly = user?.rol === 'VIEWER'
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
        const receivedIds = new Set<number>()
        for (const rec of histData) for (const rm of rec.materiales) if (rm.recibido && rm.id_material != null) receivedIds.add(rm.id_material)
        setMateriales(matsData.map((m) => { const ya = receivedIds.has(m.id); return { ...m, recibido: ya, nota: '', alreadyReceived: ya } }))
      } catch (err: any) {
        Alert.alert('Error', err?.response?.data?.message || 'No se pudieron cargar los datos')
      } finally { setLoading(false) }
    })()
  }, [oc.id])

  const toggleRecibido = (idx: number) => setMateriales((prev) => prev.map((m, i) => (i !== idx || m.alreadyReceived ? m : { ...m, recibido: !m.recibido })))
  const activeMats = materiales.filter((m) => !m.alreadyReceived)
  const allActiveChecked = activeMats.length > 0 && activeMats.every((m) => m.recibido)
  const toggleAll = () => { const v = !allActiveChecked; setMateriales((prev) => prev.map((m) => (m.alreadyReceived ? m : { ...m, recibido: v }))) }
  const updateNota = (idx: number, nota: string) => setMateriales((prev) => prev.map((m, i) => (i === idx ? { ...m, nota } : m)))

  const isVencida = (() => {
    if (!oc.fecha_entrega_estimada || oc.estado === 'recibida' || oc.estado === 'cancelada') return false
    const eta = new Date(oc.fecha_entrega_estimada.slice(0, 10) + 'T00:00:00')
    if (isNaN(eta.getTime())) return false
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return eta.getTime() < t.getTime()
  })()
  const etaPasada = (() => {
    if (!oc.fecha_entrega_estimada) return false
    const eta = new Date(oc.fecha_entrega_estimada.slice(0, 10) + 'T00:00:00')
    if (isNaN(eta.getTime())) return false
    const t = new Date(); t.setHours(0, 0, 0, 0)
    return eta.getTime() <= t.getTime()
  })()
  const ultimaRecepcion = historial.find((r) => r.estado !== 'pendiente')
  const recepcionHecha = !!ultimaRecepcion

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Necesitás permitir el acceso a la cámara.'); return }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
    if (!result.canceled && result.assets?.[0]?.uri) setPhotos((prev) => [...prev, result.assets[0].uri])
  }
  const eliminarFoto = (uri: string) => setPhotos((prev) => prev.filter((p) => p !== uri))

  const handleGuardar = () => {
    Alert.alert('Confirmar recepción',
      `Vas a registrar una recepción ${tipo === 'total' ? 'TOTAL' : 'PARCIAL'} con ${photos.length} foto(s).\n\n¿Continuar?`,
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Confirmar', onPress: () => guardarRecepcion(tipo) }])
  }

  const guardarRecepcion = async (t: 'total' | 'parcial') => {
    setSaving(true)
    try {
      const materialesPayload: MaterialRecepcion[] = materiales.filter((m) => !m.alreadyReceived)
        .map((m) => ({ id_material: m.id, cm_code: m.codigo, descripcion: m.descripcion, recibido: m.recibido, nota: m.nota || undefined }))
      await recepcionesService.crear({
        orden_compra_id: oc.id, tipo: t, fecha_recepcion: new Date().toISOString().split('T')[0],
        recibio: user?.nombre, notas: notas || undefined, materiales: materialesPayload,
      })
      if (photos.length > 0) for (const uri of photos) { try { await imagenesService.upload(oc.id, uri, 'recepcion') } catch (e) { console.warn('foto', e) } }
      Alert.alert('¡Recepción registrada!', `Se creó la recepción para ${oc.numero}.`, [{ text: 'OK', onPress: onSaved }])
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar la recepción')
    } finally { setSaving(false) }
  }

  if (loading) return <Screen><Toolbar title={oc.numero} onBack={onBack} /><View style={{ flex: 1, paddingTop: insets.top + 62 }}><Spinner /></View></Screen>

  return (
    <Screen edges={['bottom']}>
      <Toolbar title={oc.numero} subtitle={oc.proveedor?.nombre ?? undefined} onBack={onBack} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 62 }]} showsVerticalScrollIndicator={false}>
        {/* Info */}
        <View style={styles.info}>
          <View style={styles.infoTop}>
            <StatusDot estado={oc.estado_display} />
            <EtaBadge eta={oc.fecha_entrega_estimada} />
          </View>
          <InfoRow label="Proyecto" value={`${oc.proyecto?.codigo ?? ''} · ${oc.proyecto?.nombre ?? ''}`} />
          <InfoRow label="Total" value={`$${parseFloat(oc.total).toLocaleString('en-US', { minimumFractionDigits: 2 })}`} strong />
        </View>

        {/* Timeline 3 nodos */}
        <View style={styles.timeline}>
          <TlNode label="Emisión" date={oc.fecha_emision?.slice(0, 10) || '—'} done />
          <TlConn done={etaPasada} />
          <TlNode label="ETA" date={oc.fecha_entrega_estimada?.slice(0, 10) || 'sin fecha'} done={etaPasada} />
          <TlConn done={recepcionHecha} />
          <TlNode label="Recepción" date={ultimaRecepcion?.fecha_recepcion?.slice(0, 10) || 'pendiente'} done={recepcionHecha} />
        </View>

        {isVencida ? (
          <View style={styles.alert}>
            <Icon name="alert" size={16} color={color.coral} strokeWidth={2} />
            <Text style={styles.alertText}>ETA vencida — recibir con urgencia</Text>
          </View>
        ) : null}

        {/* Historial */}
        {historial.length > 0 ? (
          <>
            <SectionHeader title="Historial de recepciones" style={styles.section} />
            {historial.map((rec) => {
              const esTotal = rec.estado === 'completa'
              const recibidos = rec.materiales.filter((m) => m.recibido).length
              return (
                <View key={rec.id} style={styles.histRow}>
                  <View style={styles.histHead}>
                    <Text style={styles.code}>{rec.folio}</Text>
                    <StatusDot estado={esTotal ? 'RECIBIDO' : 'PARCIAL'} label={esTotal ? 'Total' : 'Parcial'} />
                  </View>
                  <Text style={styles.histMeta}>{(rec.fecha_recepcion ? rec.fecha_recepcion.slice(0, 10) : '—')}{rec.recibio ? ` · ${rec.recibio}` : ''}{rec.materiales.length > 0 ? ` · ${recibidos}/${rec.materiales.length} recibidos` : ''}</Text>
                  {rec.notas ? <Text style={styles.histNotes}>"{rec.notas}"</Text> : null}
                </View>
              )
            })}
          </>
        ) : null}

        {/* Materiales */}
        <View style={styles.matsHead}>
          <SectionHeader title="Materiales del lote" count={materiales.length} style={{ flex: 1 }} />
          {activeMats.length > 0 ? <GhostButtonInline label={allActiveChecked ? 'Desmarcar todos' : 'Marcar todos'} onPress={toggleAll} /> : null}
        </View>
        {!isReadOnly ? <Text style={styles.help}>Tocá un material para marcarlo como recibido.</Text> : null}
        {materiales.map((m, idx) => {
          const isYa = m.alreadyReceived
          const isCheck = m.recibido || isYa
          return (
            <View key={`${m.id}-${idx}`} style={styles.matRow}>
              <Pressable onPress={() => toggleRecibido(idx)} disabled={isYa} style={({ pressed }) => [styles.matMain, pressed && !isYa && { opacity: 0.6 }]}>
                <View style={[styles.check, isCheck && styles.checkOn]}>{isCheck ? <Icon name="check" size={14} color={color.onGold} strokeWidth={2.6} /> : null}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.code}>{m.codigo || 'Sin código'}</Text>
                  <Text style={styles.matDesc} numberOfLines={2}>{m.descripcion || 'Sin descripción'}</Text>
                  <Text style={styles.matMeta}>{m.qty ?? '—'} {m.unidad || ''} · {m.vendor || '—'}</Text>
                  {isYa ? <View style={{ marginTop: 6 }}><StatusDot colorOverride={color.green} label="Ya recibido antes" /></View> : null}
                </View>
              </Pressable>
              {!isYa && !m.recibido ? (
                <Field value={m.nota} onChangeText={(t) => updateNota(idx, t)} placeholder="Nota: motivo de no recepción…" multiline style={{ marginTop: 10 }} />
              ) : null}
            </View>
          )
        })}

        {/* Fotos */}
        {!isReadOnly ? (
          <>
            <SectionHeader title="Fotos" count={photos.length || undefined} style={styles.section} />
            <View style={styles.photos}>
              {photos.map((uri) => (
                <Pressable key={uri} onPress={() => setPreviewPhoto(uri)} style={styles.photoBox}>
                  <Image source={{ uri }} style={styles.photoThumb} />
                  <Pressable onPress={() => eliminarFoto(uri)} style={styles.photoDel} hitSlop={6}><Icon name="x" size={13} color="#fff" strokeWidth={2.4} /></Pressable>
                </Pressable>
              ))}
              <Pressable onPress={tomarFoto} style={styles.photoAdd}>
                <Icon name="camera" size={22} color={color.gold} strokeWidth={1.8} />
                <Text style={styles.photoAddText}>Tomar foto</Text>
              </Pressable>
            </View>

            <SectionHeader title="Notas generales" style={styles.section} />
            <Field value={notas} onChangeText={setNotas} placeholder="Observaciones de la recepción…" multiline />

            <SectionHeader title="Tipo de recepción" style={styles.section} />
            <Segmented
              options={[{ value: 'total', label: 'Total' }, { value: 'parcial', label: 'Parcial' }]}
              value={tipo} onChange={setTipo}
            />
            <Text style={styles.help}>{tipo === 'total' ? 'La OC pasa a EN EL TALLER — recepción completa.' : 'La OC pasa a EN TRÁNSITO — quedan materiales pendientes.'}</Text>

            <PrimaryButton label={tipo === 'total' ? 'Registrar recepción total' : 'Registrar recepción parcial'} icon="check" onPress={handleGuardar} loading={saving} tall style={{ marginTop: 20 }} />
          </>
        ) : (
          <Text style={[styles.help, { marginTop: 20 }]}>Modo solo lectura — no podés registrar recepciones con tu rol.</Text>
        )}
      </ScrollView>

      {/* Preview fullscreen */}
      <Modal visible={!!previewPhoto} transparent animationType="fade" onRequestClose={() => setPreviewPhoto(null)} statusBarTranslucent>
        <View style={styles.previewBg}>
          <Pressable onPress={() => setPreviewPhoto(null)} style={[styles.previewClose, { top: insets.top + 12 }]} hitSlop={10}>
            <Icon name="x" size={26} color="#fff" strokeWidth={2} />
          </Pressable>
          {previewPhoto ? <Image source={{ uri: previewPhoto }} style={styles.previewImg} resizeMode="contain" /> : null}
        </View>
      </Modal>
    </Screen>
  )
}

function InfoRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, strong && { fontFamily: font.titleSemi, fontSize: 18, color: color.gold }]} numberOfLines={2}>{value}</Text>
    </View>
  )
}

function TlNode({ label, date, done }: { label: string; date: string; done?: boolean }) {
  return (
    <View style={styles.tlNode}>
      <View style={[styles.tlDot, { backgroundColor: done ? color.green : 'transparent', borderColor: done ? color.green : color.grey }]} />
      <Text style={styles.tlLabel}>{label}</Text>
      <Text style={styles.tlDate}>{date}</Text>
    </View>
  )
}
function TlConn({ done }: { done?: boolean }) {
  return <View style={[styles.tlConn, { backgroundColor: done ? 'rgba(111,191,139,0.5)' : 'rgba(245,240,232,0.14)' }]} />
}
function GhostButtonInline({ label, onPress }: { label: string; onPress: () => void }) {
  return <Pressable onPress={onPress} hitSlop={6}><Text style={styles.markAll}>{label}</Text></Pressable>
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingBottom: 40 },
  info: { marginTop: 16 },
  infoTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  infoRow: { marginTop: 10 },
  infoLabel: { fontFamily: font.kickerSemi, fontSize: 10, letterSpacing: 1, textTransform: 'uppercase', color: color.mutedStrong },
  infoValue: { fontFamily: font.bodyMed, fontSize: 15, color: color.ink, marginTop: 3 },

  timeline: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 22 },
  tlNode: { flex: 1, alignItems: 'center' },
  tlDot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2, marginBottom: 6 },
  tlLabel: { fontFamily: font.kickerSemi, fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', color: color.muted, textAlign: 'center' },
  tlDate: { fontFamily: font.body, fontSize: 11, color: color.mutedStrong, marginTop: 2, textAlign: 'center' },
  tlConn: { flex: 0.5, height: 2, marginTop: 6 },

  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(240,128,106,0.5)', backgroundColor: 'rgba(240,128,106,0.08)' },
  alertText: { fontFamily: font.bodySemi, fontSize: 13, color: color.ink },

  section: { marginTop: space.gapXl, marginBottom: 8 },
  code: { fontFamily: font.kickerSemi, fontSize: 12, letterSpacing: 1, color: color.gold },
  histRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  histHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  histMeta: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong },
  histNotes: { fontFamily: font.body, fontSize: size.status, color: color.muted, fontStyle: 'italic', marginTop: 3 },

  matsHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between' },
  markAll: { fontFamily: font.bodySemi, fontSize: size.status, color: color.gold, paddingBottom: 8 },
  help: { fontFamily: font.body, fontSize: size.status, color: color.muted, marginBottom: 8, lineHeight: size.status * 1.5 },
  matRow: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  matMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  check: { width: 26, height: 26, borderRadius: 7, borderWidth: 2, borderColor: 'rgba(245,240,232,0.3)', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkOn: { backgroundColor: color.green, borderColor: color.green },
  matDesc: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink, marginTop: 3 },
  matMeta: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong, marginTop: 4 },

  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 4 },
  photoBox: { width: 100, height: 100, borderRadius: 12, overflow: 'hidden' },
  photoThumb: { width: '100%', height: '100%' },
  photoDel: { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.7)', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  photoAdd: { width: 100, height: 100, borderRadius: 12, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(217,164,65,0.5)', alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoAddText: { fontFamily: font.bodyMed, fontSize: 11, color: color.gold },

  previewBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' },
  previewClose: { position: 'absolute', right: 24, zIndex: 10 },
  previewImg: { width: '100%', height: '90%' },
})
