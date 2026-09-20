import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Image, Modal,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { scheduleService, InstallProyecto, PunchItem, InstallItem } from '../services/schedule'
import SignaturePad from '../components/SignaturePad'
import OutboxBanner from '../components/OutboxBanner'
import type { RootStackParamList } from '../navigation/types'

interface Props {
  proyecto: InstallProyecto
  onBack: () => void
  onChanged: () => void
}

interface HitoEstado { codigo: string; fecha_real: string | null }

// Abre la cámara y devuelve el uri de la foto, o null si se canceló.
async function tomarFoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) {
    Alert.alert('Permiso denegado', 'Necesitás permitir el acceso a la cámara.')
    return null
  }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
  if (!result.canceled && result.assets?.[0]?.uri) return result.assets[0].uri
  return null
}

// Obtiene la ubicación (para el check-in en obra). Si no hay permiso o falla, null
// (no bloquea el check-in — la foto sigue siendo la evidencia principal).
async function obtenerGps(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync()
    if (!perm.granted) return null
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch { return null }
}

export default function InstallDetailScreen({ proyecto, onBack, onChanged }: Props) {
  const [hitos, setHitos] = useState<HitoEstado[]>(proyecto.hitos)
  const [items, setItems] = useState<InstallItem[]>([])
  const [punch, setPunch] = useState<PunchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [nuevoPunch, setNuevoPunch] = useState('')
  const [nuevoArea, setNuevoArea] = useState('')
  const [firmaCliente, setFirmaCliente] = useState(proyecto.cliente || '')
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [firmando, setFirmando] = useState(false)          // pad de firma abierto
  const [resolviendo, setResolviendo] = useState<PunchItem | null>(null) // modal resolver punch
  const [notaResolver, setNotaResolver] = useState('')

  const done = (codigo: string) => hitos.find((h) => h.codigo === codigo)?.fecha_real ?? null

  const recargar = useCallback(async () => {
    try {
      const [plan, itemList, punchList] = await Promise.all([
        scheduleService.getPlan(proyecto.proyecto_id),
        scheduleService.getItems(proyecto.proyecto_id),
        scheduleService.getPunch(proyecto.proyecto_id),
      ])
      if (plan?.hitos) {
        setHitos(plan.hitos.map((h: any) => ({ codigo: h.codigo, fecha_real: h.fecha_real })))
      }
      setItems(itemList)
      setPunch(punchList)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudieron cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [proyecto.proyecto_id])

  useEffect(() => { recargar() }, [recargar])

  // ── Check-in (I-04) ────────────────────────────────────────────────────────
  const hacerCheckIn = async () => {
    const uri = await tomarFoto()
    if (!uri) return
    setBusy('I-04')
    try {
      const gps = await obtenerGps()
      const r = await scheduleService.registrarConFoto(proyecto.proyecto_id, 'I-04', uri, gps ? { gps } : undefined)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'El check-in se enviará solo al reconectar.')
      else { await recargar(); Alert.alert('Listo', gps ? 'Check-in registrado con foto y ubicación.' : 'Check-in registrado con foto.') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar el check-in')
    } finally {
      setBusy(null)
    }
  }

  // ── Items a instalar (I-05 se completa solo al instalar todos) ──────────────
  const totalItems = items.length
  const instaladosItems = items.filter((i) => i.instalado).length

  const doInstalar = async (item: InstallItem, uri?: string) => {
    setBusy(`item-${item.op_id}`)
    try {
      const r = await scheduleService.marcarItem(proyecto.proyecto_id, item.op_id, uri)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'El ítem se marcará al reconectar.')
      else await recargar()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo marcar el item')
    } finally {
      setBusy(null)
    }
  }

  const instalarItem = async (item: InstallItem) => {
    const uri = await tomarFoto()
    if (uri) { await doInstalar(item, uri); return }
    // Sin foto (canceló la cámara): confirmar que igual quiere marcarlo.
    Alert.alert('Sin foto', `¿Marcar "${item.numero_item}" como instalado sin foto?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, marcar', onPress: () => doInstalar(item) },
    ])
  }

  const desmarcarItem = (item: InstallItem) => {
    Alert.alert('Deshacer', `¿Marcar "${item.numero_item}" como NO instalado?`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Sí',
        onPress: async () => {
          setBusy(`item-${item.op_id}`)
          try {
            await scheduleService.desmarcarItem(proyecto.proyecto_id, item.op_id)
            await recargar()
            onChanged()
          } catch (err: any) {
            Alert.alert('Error', err?.response?.data?.message || 'No se pudo deshacer')
          } finally {
            setBusy(null)
          }
        },
      },
    ])
  }

  // ── Punch list ─────────────────────────────────────────────────────────────
  const agregarPunch = async (conFoto: boolean) => {
    const desc = nuevoPunch.trim()
    if (!desc) { Alert.alert('Falta descripción', 'Describí el pendiente.'); return }
    let uri: string | null = null
    if (conFoto) { uri = await tomarFoto(); if (!uri) return }
    setBusy('punch-add')
    try {
      const r = await scheduleService.crearPunch(proyecto.proyecto_id, desc, nuevoArea.trim() || undefined, uri || undefined)
      setNuevoPunch(''); setNuevoArea('')
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'El pendiente se enviará al reconectar.')
      else await recargar()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo agregar el pendiente')
    } finally {
      setBusy(null)
    }
  }

  // Abre el modal de resolución (nota + foto opcional).
  const abrirResolver = (item: PunchItem) => { setNotaResolver(''); setResolviendo(item) }
  const doResolver = async (conFoto: boolean) => {
    const item = resolviendo
    if (!item) return
    let uri: string | undefined
    if (conFoto) { const u = await tomarFoto(); if (!u) return; uri = u }
    setResolviendo(null)
    setBusy(`punch-${item.id}`)
    try {
      const r = await scheduleService.resolverPunch(proyecto.proyecto_id, item.id, uri, notaResolver.trim() || undefined)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'Se enviará al reconectar.')
      else await recargar()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo resolver')
    } finally {
      setBusy(null)
    }
  }

  // ── Sign-off (I-07) ────────────────────────────────────────────────────────
  const abiertos = punch.filter((p) => p.estado === 'abierto').length
  const puedeEntregar = !!done('I-04') && abiertos === 0

  // Abre el pad de firma (requiere nombre de quien recibe).
  const hacerSignoff = () => {
    if (!firmaCliente.trim()) { Alert.alert('Falta el nombre', 'Ingresá quién recibe la entrega.'); return }
    setFirmando(true)
  }
  // Se llama cuando el cliente firmó en el pad (firmaUri = PNG de la firma).
  const doSignoff = async (firmaUri: string) => {
    setFirmando(false)
    setBusy('signoff')
    try {
      const r = await scheduleService.signoff(proyecto.proyecto_id, firmaCliente.trim() || undefined, firmaUri)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'La firma se enviará al reconectar; ahí se confirma la entrega.')
      else { await recargar(); Alert.alert('¡Entregado!', 'Sign-off del cliente registrado. Proyecto ENTREGADO.') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar el sign-off')
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeAreaTop} edges={['top', 'bottom']}>
        <View style={styles.container}><View style={styles.loadingBox}><ActivityIndicator size="large" color="#C18A2D" /></View></View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeAreaTop} edges={['top', 'bottom']}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} style={styles.backBtn}>
            <Text style={styles.backText}>← Volver</Text>
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Text style={styles.headerTitle}>{proyecto.codigo}</Text>
            <Text style={styles.headerSub} numberOfLines={1}>{proyecto.nombre}</Text>
          </View>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.acciones}>
          <TouchableOpacity style={styles.accBtn}
            onPress={() => nav.navigate('PlanosObra', { proyectoId: proyecto.proyecto_id, codigo: proyecto.codigo })}>
            <Text style={styles.accText}>📐 Planos</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.accBtn}
            onPress={() => nav.navigate('ReporteObra', { proyectoId: proyecto.proyecto_id, codigo: proyecto.codigo, nombre: proyecto.nombre })}>
            <Text style={styles.accText}>⚠️ Reportar daño</Text>
          </TouchableOpacity>
        </View>

        <OutboxBanner />

        <ScrollView contentContainerStyle={styles.content}>
          {/* 1. Check-in */}
          <StepCard n="1" titulo="Check-in en obra" hito="I-04"
            hecho={done('I-04')} sub="Foto de llegada a la obra">
            {done('I-04') ? (
              <DoneRow fecha={done('I-04')!} />
            ) : (
              <ActionBtn label="📷 Tomar foto y hacer check-in" loading={busy === 'I-04'}
                onPress={hacerCheckIn} />
            )}
          </StepCard>

          {/* 2. Avance por item */}
          <StepCard n="2" titulo="Instalación por item" hito="I-05"
            hecho={done('I-05')} sub="Tildá cada item a medida que lo instalás. Se completa solo al instalar todos">
            {!done('I-04') && <Text style={styles.gateHint}>Primero hacé el check-in.</Text>}

            {totalItems === 0 ? (
              <Text style={styles.emptyPunch}>Este proyecto no tiene items de producción cargados.</Text>
            ) : (
              <>
                {/* Progreso */}
                <View style={styles.progHeader}>
                  <Text style={styles.progText}>{instaladosItems} de {totalItems} instalados</Text>
                  <Text style={styles.progPct}>{Math.round((instaladosItems / totalItems) * 100)}%</Text>
                </View>
                <View style={styles.progBarBg}>
                  <View style={[styles.progBarFill, { width: `${(instaladosItems / totalItems) * 100}%` }]} />
                </View>

                {items.map((item) => {
                  const cargando = busy === `item-${item.op_id}`
                  return (
                    <View key={item.op_id} style={[styles.itemRow, item.instalado && styles.itemRowDone]}>
                      {item.foto_url ? <Image source={{ uri: item.foto_url }} style={styles.itemThumb} /> : null}
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemNombre}>{item.numero_item}</Text>
                        <Text style={styles.itemMeta}>
                          {item.cantidad} {item.unidad || 'u.'} · {item.numero_orden}
                        </Text>
                        {item.instalado && item.instalado_at ? (
                          <Text style={styles.itemInstaladoAt}>✓ Instalado {item.instalado_at}</Text>
                        ) : null}
                      </View>
                      {item.instalado ? (
                        <TouchableOpacity onPress={() => desmarcarItem(item)} disabled={cargando} style={styles.undoBtn}>
                          {cargando ? <ActivityIndicator color="#5A5F52" size="small" /> : <Text style={styles.undoText}>Deshacer</Text>}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => instalarItem(item)} disabled={cargando || !done('I-04')}
                          style={[styles.instalarBtn, !done('I-04') && styles.instalarBtnDisabled]}>
                          {cargando ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.instalarText}>Instalar</Text>}
                        </TouchableOpacity>
                      )}
                    </View>
                  )
                })}
              </>
            )}
          </StepCard>

          {/* 3. Punch list */}
          <StepCard n="3" titulo="Punch list" hito="I-06"
            hecho={done('I-06')} sub="Pendientes de obra. Se cierra solo cuando todos están resueltos">
            {punch.length === 0 && <Text style={styles.emptyPunch}>Sin pendientes cargados.</Text>}
            {punch.map((item) => (
              <View key={item.id} style={[styles.punchItem, item.estado === 'resuelto' && styles.punchItemDone]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.punchDesc}>{item.descripcion}</Text>
                  {item.area ? <Text style={styles.punchArea}>{item.area}</Text> : null}
                  {item.nota_resuelto ? <Text style={styles.punchNota}>Resuelto: {item.nota_resuelto}</Text> : null}
                  <View style={styles.punchThumbs}>
                    {item.foto_problema_url ? <Image source={{ uri: item.foto_problema_url }} style={styles.punchThumb} /> : null}
                    {item.foto_resuelto_url ? <Image source={{ uri: item.foto_resuelto_url }} style={styles.punchThumb} /> : null}
                  </View>
                </View>
                {item.estado === 'resuelto' ? (
                  <Text style={styles.punchResuelto}>✓ Resuelto</Text>
                ) : (
                  <TouchableOpacity onPress={() => abrirResolver(item)} disabled={busy === `punch-${item.id}`} style={styles.resolverBtn}>
                    {busy === `punch-${item.id}` ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.resolverText}>Resolver</Text>}
                  </TouchableOpacity>
                )}
              </View>
            ))}

            {!done('I-06') && (
              <View style={styles.nuevoPunchBox}>
                <TextInput value={nuevoPunch} onChangeText={setNuevoPunch}
                  placeholder="Nuevo pendiente…" placeholderTextColor="#999" style={styles.input} multiline />
                <TextInput value={nuevoArea} onChangeText={setNuevoArea}
                  placeholder="Área (opcional)" placeholderTextColor="#999" style={styles.input} />
                <View style={styles.nuevoPunchBtns}>
                  <TouchableOpacity onPress={() => agregarPunch(true)} disabled={busy === 'punch-add'} style={[styles.smallBtn, styles.smallBtnGold]}>
                    <Text style={styles.smallBtnText}>📷 Con foto</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => agregarPunch(false)} disabled={busy === 'punch-add'} style={[styles.smallBtn, styles.smallBtnGhost]}>
                    <Text style={[styles.smallBtnText, { color: '#2c3126' }]}>Sin foto</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </StepCard>

          {/* 4. Sign-off / entrega */}
          <StepCard n="4" titulo="Sign-off del cliente" hito="I-07"
            hecho={done('I-07')} sub="El cliente firma la entrega en obra">
            {done('I-07') ? (
              <DoneRow fecha={done('I-07')!} extra="ENTREGADO" />
            ) : (
              <>
                <TextInput value={firmaCliente} onChangeText={setFirmaCliente}
                  placeholder="Nombre de quien recibe" placeholderTextColor="#999" style={styles.input} />
                <ActionBtn label="✍️ Firmar y registrar entrega" loading={busy === 'signoff'}
                  disabled={!puedeEntregar} green onPress={hacerSignoff} />
                {!puedeEntregar && (
                  <Text style={styles.gateHint}>
                    {!done('I-04') ? 'Falta el check-in.' : `Resolvé los ${abiertos} pendiente(s) del punch list primero.`}
                  </Text>
                )}
              </>
            )}
          </StepCard>
        </ScrollView>

        {/* Pad de firma del cliente (sign-off I-07) */}
        <SignaturePad
          visible={firmando}
          titulo={`Firma — ${proyecto.codigo}`}
          onCancel={() => setFirmando(false)}
          onSave={doSignoff}
        />

        {/* Modal para resolver un punch item con nota + foto opcional */}
        <Modal visible={!!resolviendo} transparent animationType="fade" onRequestClose={() => setResolviendo(null)}>
          <View style={styles.modalBg}>
            <View style={styles.modalCard}>
              <Text style={styles.modalTitle}>Resolver pendiente</Text>
              {resolviendo ? <Text style={styles.modalDesc} numberOfLines={2}>{resolviendo.descripcion}</Text> : null}
              <TextInput
                value={notaResolver} onChangeText={setNotaResolver} multiline
                placeholder="Nota de cómo se resolvió (opcional)…" placeholderTextColor="#999"
                style={styles.modalInput}
              />
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGold]} onPress={() => doResolver(true)}>
                <Text style={styles.modalBtnText}>📷 Con foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, styles.modalBtnGreen]} onPress={() => doResolver(false)}>
                <Text style={styles.modalBtnText}>Resolver sin foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalCancel} onPress={() => setResolviendo(null)}>
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────
function StepCard({ n, titulo, hito, sub, hecho, children }: {
  n: string; titulo: string; hito: string; sub: string; hecho: string | null; children: React.ReactNode
}) {
  return (
    <View style={[styles.stepCard, hecho && styles.stepCardDone]}>
      <View style={styles.stepHeader}>
        <View style={[styles.stepNum, hecho ? styles.stepNumDone : styles.stepNumPending]}>
          <Text style={styles.stepNumText}>{hecho ? '✓' : n}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.stepTitulo}>{titulo} <Text style={styles.stepHito}>{hito}</Text></Text>
          <Text style={styles.stepSub}>{sub}</Text>
        </View>
      </View>
      <View style={styles.stepBody}>{children}</View>
    </View>
  )
}

function DoneRow({ fecha, extra }: { fecha: string; extra?: string }) {
  return (
    <View style={styles.doneRow}>
      <Text style={styles.doneText}>✓ {extra ? `${extra} · ` : ''}{fecha}</Text>
    </View>
  )
}

function ActionBtn({ label, onPress, loading, disabled, green }: {
  label: string; onPress: () => void; loading?: boolean; disabled?: boolean; green?: boolean
}) {
  return (
    <TouchableOpacity onPress={onPress} disabled={loading || disabled}
      style={[styles.actionBtn, green ? styles.actionBtnGreen : styles.actionBtnGold, (loading || disabled) && styles.actionBtnDisabled]}>
      {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.actionBtnText}>{label}</Text>}
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
  headerCenter: { alignItems: 'center', flex: 1 },
  headerTitle: { color: '#C18A2D', fontSize: 16, fontWeight: '700', fontFamily: 'Courier' },
  headerSub: { color: '#E8C684', fontSize: 11, marginTop: 2, opacity: 0.85 },
  content: { padding: 16, paddingBottom: 40 },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  stepCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: '#E0DFD9',
  },
  stepCardDone: { backgroundColor: '#F5FAEF', borderColor: '#A8C97A' },
  stepHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  stepNum: {
    width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center',
  },
  stepNumPending: { backgroundColor: '#2c3126' },
  stepNumDone: { backgroundColor: '#5A8A2E' },
  stepNumText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  stepTitulo: { fontSize: 16, fontWeight: '700', color: '#2c3126' },
  stepHito: { fontSize: 11, color: '#8A8F7E', fontFamily: 'Courier' },
  stepSub: { fontSize: 12, color: '#5A5F52', marginTop: 2 },
  stepBody: { marginTop: 12 },

  doneRow: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 12 },
  doneText: { color: '#1B5E20', fontWeight: '700', fontSize: 13 },

  actionBtn: { borderRadius: 10, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  actionBtnGold: { backgroundColor: '#C18A2D' },
  actionBtnGreen: { backgroundColor: '#16A34A' },
  actionBtnDisabled: { opacity: 0.5 },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  gateHint: { fontSize: 12, color: '#B45309', marginTop: 8, fontStyle: 'italic' },

  emptyPunch: { fontSize: 13, color: '#5A5F52', fontStyle: 'italic', marginBottom: 8 },

  progHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  progText: { fontSize: 13, fontWeight: '700', color: '#2c3126' },
  progPct: { fontSize: 13, fontWeight: '700', color: '#5A8A2E' },
  progBarBg: { height: 8, borderRadius: 4, backgroundColor: '#E0DFD9', overflow: 'hidden', marginBottom: 12 },
  progBarFill: { height: 8, borderRadius: 4, backgroundColor: '#5A8A2E' },
  itemRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff',
    borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#E0DFD9',
  },
  itemRowDone: { backgroundColor: '#F0F7E8', borderColor: '#A8C97A' },
  itemThumb: { width: 40, height: 40, borderRadius: 6 },
  itemNombre: { fontSize: 14, fontWeight: '600', color: '#1F2419' },
  itemMeta: { fontSize: 11, color: '#5A5F52', marginTop: 2, fontFamily: 'Courier' },
  itemInstaladoAt: { fontSize: 11, color: '#1B5E20', fontWeight: '700', marginTop: 2 },
  instalarBtn: { backgroundColor: '#C18A2D', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  instalarBtnDisabled: { opacity: 0.4 },
  instalarText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  undoBtn: { borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderColor: '#C8C5BC' },
  undoText: { color: '#5A5F52', fontWeight: '600', fontSize: 12 },
  punchItem: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#FFF7F7',
    borderRadius: 8, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#FCA5A5',
  },
  punchItemDone: { backgroundColor: '#F0F7E8', borderColor: '#A8C97A' },
  punchDesc: { fontSize: 14, color: '#1F2419', fontWeight: '500' },
  punchArea: { fontSize: 11, color: '#5A5F52', marginTop: 2 },
  punchThumbs: { flexDirection: 'row', gap: 6, marginTop: 6 },
  punchThumb: { width: 44, height: 44, borderRadius: 6 },
  punchResuelto: { color: '#1B5E20', fontWeight: '700', fontSize: 12 },
  resolverBtn: { backgroundColor: '#16A34A', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  resolverText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  nuevoPunchBox: { marginTop: 6 },
  input: {
    backgroundColor: '#fff', borderRadius: 8, padding: 10, marginBottom: 8,
    borderWidth: 1, borderColor: '#E0DFD9', fontSize: 14, color: '#1F2419',
  },
  nuevoPunchBtns: { flexDirection: 'row', gap: 10 },
  smallBtn: { flex: 1, borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  smallBtnGold: { backgroundColor: '#C18A2D' },
  smallBtnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#C8C5BC' },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  // Barra de acciones (planos / reportar daño)
  acciones: { flexDirection: 'row', gap: 10, backgroundColor: '#2c3126', paddingHorizontal: 16, paddingBottom: 12 },
  accBtn: { flex: 1, backgroundColor: '#3a4133', borderRadius: 9, paddingVertical: 10, alignItems: 'center' },
  accText: { color: '#E8C684', fontWeight: '700', fontSize: 13 },
  punchNota: { fontSize: 11.5, color: '#2f6a12', marginTop: 3, fontStyle: 'italic' },

  // Modal resolver punch
  modalBg: { flex: 1, backgroundColor: 'rgba(20,25,16,0.55)', justifyContent: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 14, padding: 18 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: '#2c3126' },
  modalDesc: { fontSize: 13, color: '#5A5F52', marginTop: 4, marginBottom: 10 },
  modalInput: { backgroundColor: '#F4F5F2', borderRadius: 9, borderWidth: 1, borderColor: '#E0DFD9', padding: 11, fontSize: 14, color: '#1F2419', minHeight: 70, textAlignVertical: 'top', marginBottom: 12 },
  modalBtn: { borderRadius: 9, paddingVertical: 13, alignItems: 'center', marginBottom: 9 },
  modalBtnGold: { backgroundColor: '#C18A2D' },
  modalBtnGreen: { backgroundColor: '#16A34A' },
  modalBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
  modalCancel: { alignItems: 'center', paddingVertical: 6 },
  modalCancelText: { color: '#5A5F52', fontWeight: '600', fontSize: 13 },
})
