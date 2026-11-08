import React, { useEffect, useState, useCallback } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Image } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import * as Location from 'expo-location'
import * as FileSystem from 'expo-file-system/legacy'
import * as Sharing from 'expo-sharing'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { scheduleService, InstallProyecto, PunchItem, InstallItem } from '../services/schedule'
import SignaturePad from '../components/SignaturePad'
import OutboxBanner, { useOutbox } from '../components/OutboxBanner'
import type { RootStackParamList } from '../navigation/types'
import {
  Screen, Toolbar, Stepper, Progress, SectionHeader, StatusDot, Divider,
  PrimaryButton, GhostButton, Field, Icon, BottomSheet, Toast, Spinner, ContextualAction,
  color, font, size, space, type Step,
} from '../ui'

interface Props {
  proyecto: InstallProyecto
  onBack: () => void
  onChanged: () => void
}

interface HitoEstado { codigo: string; fecha_real: string | null }

async function tomarFoto(): Promise<string | null> {
  const perm = await ImagePicker.requestCameraPermissionsAsync()
  if (!perm.granted) { Alert.alert('Permiso denegado', 'Necesitás permitir el acceso a la cámara.'); return null }
  const result = await ImagePicker.launchCameraAsync({ quality: 0.7, allowsEditing: false })
  if (!result.canceled && result.assets?.[0]?.uri) return result.assets[0].uri
  return null
}

async function obtenerGps(): Promise<{ lat: number; lng: number } | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync()
    if (!perm.granted) return null
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
    return { lat: pos.coords.latitude, lng: pos.coords.longitude }
  } catch { return null }
}

export default function InstallDetailScreen({ proyecto, onBack, onChanged }: Props) {
  const insets = useSafeAreaInsets()
  const { pendientes } = useOutbox()
  const [hitos, setHitos] = useState<HitoEstado[]>(proyecto.hitos)
  const [items, setItems] = useState<InstallItem[]>([])
  const [punch, setPunch] = useState<PunchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [nuevoPunch, setNuevoPunch] = useState('')
  const [nuevoArea, setNuevoArea] = useState('')
  const [firmaCliente, setFirmaCliente] = useState(proyecto.cliente || '')
  const nav = useNavigation<NativeStackNavigationProp<RootStackParamList>>()
  const [firmando, setFirmando] = useState(false)
  const [resolviendo, setResolviendo] = useState<PunchItem | null>(null)
  const [addPunchOpen, setAddPunchOpen] = useState(false)
  const [notaResolver, setNotaResolver] = useState('')
  const [toast, setToast] = useState('')

  const done = (codigo: string) => hitos.find((h) => h.codigo === codigo)?.fecha_real ?? null

  const recargar = useCallback(async () => {
    try {
      const [plan, itemList, punchList] = await Promise.all([
        scheduleService.getPlan(proyecto.proyecto_id),
        scheduleService.getItems(proyecto.proyecto_id),
        scheduleService.getPunch(proyecto.proyecto_id),
      ])
      if (plan?.hitos) setHitos(plan.hitos.map((h: any) => ({ codigo: h.codigo, fecha_real: h.fecha_real })))
      setItems(itemList); setPunch(punchList)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudieron cargar los datos')
    } finally { setLoading(false) }
  }, [proyecto.proyecto_id])

  useEffect(() => { recargar() }, [recargar])

  // ── Check-in (I-04) ─────────────────────────────────────────────────────────
  const hacerCheckIn = async () => {
    const uri = await tomarFoto()
    if (!uri) return
    setBusy('I-04')
    try {
      const gps = await obtenerGps()
      const r = await scheduleService.registrarConFoto(proyecto.proyecto_id, 'I-04', uri, gps ? { gps } : undefined)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'El check-in se enviará solo al reconectar.')
      else { await recargar(); setToast('Check-in registrado') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar el check-in')
    } finally { setBusy(null) }
  }

  // ── Ítems a instalar ──────────────────────────────────────────────────────
  const totalItems = items.length
  const instaladosItems = items.filter((i) => i.instalado).length

  const doInstalar = async (item: InstallItem, uri?: string) => {
    setBusy(`item-${item.op_id}`)
    try {
      const r = await scheduleService.marcarItem(proyecto.proyecto_id, item.op_id, uri)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'El ítem se marcará al reconectar.')
      else { await recargar(); setToast('Ítem instalado') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo marcar el ítem')
    } finally { setBusy(null) }
  }

  const instalarItem = async (item: InstallItem) => {
    const uri = await tomarFoto()
    if (uri) { await doInstalar(item, uri); return }
    Alert.alert('Sin foto', `¿Marcar "${item.numero_item}" como instalado sin foto?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí, marcar', onPress: () => doInstalar(item) },
    ])
  }

  const agregarFoto = async (item: InstallItem) => {
    const uri = await tomarFoto()
    if (!uri) return
    setBusy(`foto-${item.op_id}`)
    try {
      const r = await scheduleService.agregarFotoItem(proyecto.proyecto_id, item.op_id, uri)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'La foto se enviará al reconectar.')
      else await recargar()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo agregar la foto')
    } finally { setBusy(null) }
  }

  const desmarcarItem = (item: InstallItem) => {
    Alert.alert('Deshacer', `¿Marcar "${item.numero_item}" como NO instalado?`, [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Sí', onPress: async () => {
        setBusy(`item-${item.op_id}`)
        try { await scheduleService.desmarcarItem(proyecto.proyecto_id, item.op_id); await recargar(); onChanged() }
        catch (err: any) { Alert.alert('Error', err?.response?.data?.message || 'No se pudo deshacer') }
        finally { setBusy(null) }
      } },
    ])
  }

  // ── Punch list ──────────────────────────────────────────────────────────────
  const agregarPunch = async (conFoto: boolean) => {
    const desc = nuevoPunch.trim()
    if (!desc) { Alert.alert('Falta descripción', 'Describí el pendiente.'); return }
    let uri: string | null = null
    if (conFoto) { uri = await tomarFoto(); if (!uri) return }
    setBusy('punch-add')
    try {
      const r = await scheduleService.crearPunch(proyecto.proyecto_id, desc, nuevoArea.trim() || undefined, uri || undefined)
      setNuevoPunch(''); setNuevoArea(''); setAddPunchOpen(false)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'El pendiente se enviará al reconectar.')
      else { await recargar(); setToast('Pendiente agregado') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo agregar el pendiente')
    } finally { setBusy(null) }
  }

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
      else { await recargar(); setToast('Pendiente resuelto') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo resolver')
    } finally { setBusy(null) }
  }

  const exportarPunch = async () => {
    setBusy('export-punch')
    try {
      const csv = await scheduleService.getPunchCsv(proyecto.proyecto_id)
      const uri = `${FileSystem.documentDirectory}punch-${proyecto.codigo}.csv`
      await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 })
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'text/csv', UTI: 'public.comma-separated-values-text', dialogTitle: `Punch list ${proyecto.codigo}` })
      } else { Alert.alert('No disponible', 'Compartir no está disponible en este dispositivo.') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo exportar la punch list')
    } finally { setBusy(null) }
  }

  // ── Sign-off (I-07) ───────────────────────────────────────────────────────
  const abiertos = punch.filter((p) => p.estado === 'abierto').length
  const puedeEntregar = !!done('I-04') && abiertos === 0
  const hacerSignoff = () => {
    if (!firmaCliente.trim()) { Alert.alert('Falta el nombre', 'Ingresá quién recibe la entrega.'); return }
    setFirmando(true)
  }
  const doSignoff = async (firmaUri: string) => {
    setFirmando(false); setBusy('signoff')
    try {
      const r = await scheduleService.signoff(proyecto.proyecto_id, firmaCliente.trim() || undefined, firmaUri)
      onChanged()
      if (r.queued) Alert.alert('Guardado sin señal', 'La firma se enviará al reconectar; ahí se confirma la entrega.')
      else { await recargar(); Alert.alert('¡Entregado!', 'Sign-off del cliente registrado. Proyecto ENTREGADO.') }
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar el sign-off')
    } finally { setBusy(null) }
  }

  // ── Derivados para el stepper y la acción contextual ────────────────────────
  const i04 = !!done('I-04'), i07 = !!done('I-07')
  const itemsDone = totalItems > 0 ? instaladosItems === totalItems : true
  const doneFlags = [i04, i04 && itemsDone, i04 && abiertos === 0, i07]
  const currentIdx = doneFlags.indexOf(false)
  const NAMES = ['Check-in', 'Instalación', 'Punch', 'Sign-off']
  const steps: Step[] = NAMES.map((name, i) => ({ name, state: doneFlags[i] ? 'done' : i === currentIdx ? 'current' : 'todo' }))
  const pct = totalItems > 0 ? (instaladosItems / totalItems) * 100 : (i04 ? 100 : 0)

  if (loading) return <Screen><Toolbar title={proyecto.codigo} subtitle={proyecto.nombre} onBack={onBack} /><View style={{ flex: 1, paddingTop: insets.top + 62 }}><Spinner /></View></Screen>

  return (
    <Screen edges={['bottom']}>
      <Toolbar title={proyecto.codigo} subtitle={proyecto.nombre} onBack={onBack} offlineCount={pendientes} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 62 }]} showsVerticalScrollIndicator={false}>
        {/* Acciones de obra (planos / reportar daño) */}
        <View style={styles.acciones}>
          <Pressable onPress={() => nav.navigate('PlanosObra', { proyectoId: proyecto.proyecto_id, codigo: proyecto.codigo })} style={({ pressed }) => [styles.accBtn, pressed && { opacity: 0.6 }]}>
            <Icon name="doc" size={17} color={color.muted} strokeWidth={1.8} />
            <Text style={styles.accText}>Planos</Text>
          </Pressable>
          <Pressable onPress={() => nav.navigate('ReporteObra', { proyectoId: proyecto.proyecto_id, codigo: proyecto.codigo, nombre: proyecto.nombre })} style={({ pressed }) => [styles.accBtn, pressed && { opacity: 0.6 }]}>
            <Icon name="alert" size={17} color={color.coral} strokeWidth={1.8} />
            <Text style={styles.accText}>Reportar daño</Text>
          </Pressable>
        </View>

        <OutboxBanner />

        {/* Overview: progreso + stepper */}
        <View style={styles.block}>
          <Progress label="Avance de instalación" pct={pct} />
          <View style={{ marginTop: 26 }}><Stepper steps={steps} /></View>
        </View>

        {/* 1. Check-in */}
        <SectionHeader title="Check-in en obra" style={styles.section} />
        {i04 ? (
          <DoneLine text={`Registrado · ${done('I-04')}`} />
        ) : (
          <Text style={styles.hint}>Tomá una foto de llegada para arrancar (queda con tu ubicación).</Text>
        )}

        {/* 2. Instalación por ítem */}
        <SectionHeader title="Instalación por ítem" count={totalItems > 0 ? `${instaladosItems}/${totalItems}` : undefined} style={styles.section} />
        {!i04 ? <Text style={styles.hint}>Primero hacé el check-in.</Text> : totalItems === 0 ? (
          <Text style={styles.hint}>Este proyecto no tiene ítems de producción cargados.</Text>
        ) : (
          <View>
            {items.map((item) => {
              const cargando = busy === `item-${item.op_id}`
              const subiendo = busy === `foto-${item.op_id}`
              return (
                <View key={item.op_id} style={styles.itemRow}>
                  <View style={styles.itemMain}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.itemName}>{item.numero_item}</Text>
                      <Text style={styles.itemMeta}>{item.cantidad} {item.unidad || 'u.'} · {item.numero_orden}</Text>
                      {item.instalado ? <View style={{ marginTop: 6 }}><StatusDot colorOverride={color.green} label={item.instalado_at ? `Instalado ${item.instalado_at}` : 'Instalado'} /></View> : null}
                    </View>
                    {item.instalado ? (
                      <SmallBtn label="Deshacer" tone="ghost" loading={cargando} onPress={() => desmarcarItem(item)} />
                    ) : (
                      <SmallBtn label="Instalar" tone="gold" loading={cargando} disabled={!i04} onPress={() => instalarItem(item)} />
                    )}
                  </View>
                  {item.instalado ? (
                    <View style={styles.thumbs}>
                      {item.fotos.map((f, i) => <Image key={`${item.op_id}-${i}`} source={{ uri: f }} style={styles.thumb} />)}
                      <Pressable style={styles.addThumb} onPress={() => agregarFoto(item)} disabled={subiendo}>
                        <Icon name={subiendo ? 'refresh' : 'plus'} size={16} color={color.gold} strokeWidth={2} />
                      </Pressable>
                    </View>
                  ) : null}
                  <Divider style={{ marginTop: 14 }} />
                </View>
              )
            })}
          </View>
        )}

        {/* 3. Punch list */}
        <SectionHeader title="Punch list" count={punch.length || undefined} style={styles.section} />
        <View style={styles.punchTools}>
          {punch.length > 0 ? (
            <Pressable onPress={exportarPunch} disabled={busy === 'export-punch'} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.6 }]}>
              <Icon name="download" size={15} color={color.muted} strokeWidth={1.8} />
              <Text style={styles.toolText}>Exportar CSV</Text>
            </Pressable>
          ) : <View />}
          {!done('I-06') ? (
            <Pressable onPress={() => { setNuevoPunch(''); setNuevoArea(''); setAddPunchOpen(true) }} style={({ pressed }) => [styles.toolBtn, pressed && { opacity: 0.6 }]}>
              <Icon name="plus" size={15} color={color.gold} strokeWidth={2} />
              <Text style={[styles.toolText, { color: color.gold }]}>Agregar pendiente</Text>
            </Pressable>
          ) : null}
        </View>
        {punch.length === 0 ? <Text style={styles.hint}>Sin pendientes cargados.</Text> : punch.map((item) => (
          <Pressable key={item.id} onPress={() => abrirResolver(item)} style={({ pressed }) => [styles.punchRow, pressed && { opacity: 0.6 }]}>
            {item.foto_problema_url ? <Image source={{ uri: item.foto_problema_url }} style={styles.punchThumb} /> : <View style={[styles.punchThumb, { backgroundColor: color.stripeA }]} />}
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.punchDesc} numberOfLines={2}>{item.descripcion}</Text>
              {item.area ? <Text style={styles.itemMeta}>{item.area}</Text> : null}
              <View style={{ marginTop: 6 }}><StatusDot estado={item.estado} /></View>
            </View>
            <Icon name="chevron" size={16} color="#6E665C" strokeWidth={1.8} />
          </Pressable>
        ))}

        {/* 4. Sign-off */}
        <SectionHeader title="Sign-off del cliente" style={styles.section} />
        {i07 ? (
          <DoneLine text={`Entregado · ${done('I-07')}`} tone="green" />
        ) : (
          <View>
            <Field label="Quién recibe" value={firmaCliente} onChangeText={setFirmaCliente} placeholder="Nombre de quien recibe la entrega" />
            {!puedeEntregar ? (
              <Text style={styles.hint}>{!i04 ? 'Falta el check-in.' : `Resolvé los ${abiertos} pendiente(s) del punch list para poder firmar.`}</Text>
            ) : null}
          </View>
        )}
      </ScrollView>

      {/* Acción contextual = siguiente hito (una sola capa flotante) */}
      {!i04 ? (
        <ContextualAction label="Hacer check-in en obra" kicker="Siguiente paso" onPress={hacerCheckIn} disabled={busy === 'I-04'} />
      ) : !i07 && puedeEntregar ? (
        <ContextualAction label="Firmar entrega" kicker="Siguiente paso" onPress={hacerSignoff} disabled={busy === 'signoff'} />
      ) : null}

      {/* Firma del cliente */}
      <SignaturePad visible={firmando} titulo={`Firma — ${proyecto.codigo}`} onCancel={() => setFirmando(false)} onSave={doSignoff} />

      {/* Detalle / resolución de un pendiente (bottom sheet) */}
      <BottomSheet visible={!!resolviendo} onClose={() => setResolviendo(null)}>
        {resolviendo ? (
          <View style={{ paddingBottom: 8 }}>
            <StatusDot estado={resolviendo.estado} />
            <Text style={[styles.sheetTitle, { marginTop: 10 }]}>{resolviendo.descripcion}</Text>
            {resolviendo.area ? <Text style={styles.sheetMeta}>{resolviendo.area}</Text> : null}
            {resolviendo.foto_problema_url ? <Image source={{ uri: resolviendo.foto_problema_url }} style={styles.sheetPhoto} /> : null}
            {resolviendo.estado === 'resuelto' ? (
              <View>
                {resolviendo.nota_resuelto ? <Text style={styles.sheetNota}>Resuelto: {resolviendo.nota_resuelto}</Text> : null}
                {resolviendo.foto_resuelto_url ? <Image source={{ uri: resolviendo.foto_resuelto_url }} style={styles.sheetPhoto} /> : null}
                <GhostButton label="Cerrar" onPress={() => setResolviendo(null)} />
              </View>
            ) : (
              <View style={{ gap: 12, marginTop: 14 }}>
                <Field placeholder="Nota de cómo se resolvió (opcional)…" value={notaResolver} onChangeText={setNotaResolver} multiline />
                <PrimaryButton label="Marcar como resuelto" icon="check" onPress={() => doResolver(false)} />
                <GhostButton label="Adjuntar foto y resolver" onPress={() => doResolver(true)} />
              </View>
            )}
          </View>
        ) : null}
      </BottomSheet>

      {/* Agregar pendiente (bottom sheet) */}
      <BottomSheet visible={addPunchOpen} onClose={() => setAddPunchOpen(false)}>
        <View style={{ gap: 14, paddingBottom: 8 }}>
          <Text style={styles.sheetTitle}>Nuevo pendiente</Text>
          <Field label="Descripción" placeholder="Qué falta o qué está mal…" value={nuevoPunch} onChangeText={setNuevoPunch} multiline />
          <Field label="Área (opcional)" placeholder="Ej. Depto 12B · Living" value={nuevoArea} onChangeText={setNuevoArea} />
          <PrimaryButton label="Agregar pendiente" icon="plus" onPress={() => agregarPunch(false)} disabled={busy === 'punch-add'} />
          <GhostButton label="Tomar foto y agregar" onPress={() => agregarPunch(true)} />
        </View>
      </BottomSheet>

      {toast ? <Toast message={toast} onDone={() => setToast('')} /> : null}
    </Screen>
  )
}

function DoneLine({ text, tone }: { text: string; tone?: 'green' }) {
  return (
    <View style={styles.doneLine}>
      <Icon name="check" size={16} color={color.green} strokeWidth={2.4} />
      <Text style={[styles.doneText, tone === 'green' && { color: color.green }]}>{text}</Text>
    </View>
  )
}

function SmallBtn({ label, onPress, tone, loading, disabled }: {
  label: string; onPress: () => void; tone: 'gold' | 'ghost'; loading?: boolean; disabled?: boolean
}) {
  return (
    <Pressable onPress={onPress} disabled={loading || disabled}
      style={({ pressed }) => [styles.smallBtn, tone === 'gold' ? styles.smallGold : styles.smallGhost, (loading || disabled) && { opacity: 0.4 }, pressed && { opacity: 0.7 }]}>
      <Text style={[styles.smallText, tone === 'gold' ? { color: color.onGold } : { color: color.muted }]}>{loading ? '…' : label}</Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingBottom: 150 },
  acciones: { flexDirection: 'row', gap: 20, paddingTop: 14, paddingBottom: 6 },
  accBtn: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 6 },
  accText: { fontFamily: font.bodyMed, fontSize: size.secondary, color: color.muted },
  block: { marginTop: 18 },
  section: { marginTop: space.gapXl, marginBottom: 10 },
  hint: { fontFamily: font.body, fontSize: size.secondary, color: color.muted, lineHeight: size.secondary * 1.5 },

  doneLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  doneText: { fontFamily: font.bodyMed, fontSize: size.body, color: color.ink2 },

  itemRow: {},
  itemMain: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 14 },
  itemName: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },
  itemMeta: { fontFamily: font.body, fontSize: size.status, color: color.mutedStrong, marginTop: 3 },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingLeft: 2 },
  thumb: { width: 44, height: 44, borderRadius: 8 },
  addThumb: { width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: color.gold, alignItems: 'center', justifyContent: 'center' },

  smallBtn: { height: 40, minWidth: 88, paddingHorizontal: 14, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  smallGold: { backgroundColor: color.gold },
  smallGhost: { borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.2)' },
  smallText: { fontFamily: font.bodySemi, fontSize: size.secondary },

  punchTools: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6 },
  toolText: { fontFamily: font.bodyMed, fontSize: size.status, color: color.muted },
  punchRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  punchThumb: { width: 56, height: 56, borderRadius: 8 },
  punchDesc: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },

  sheetTitle: { fontFamily: font.titleSemi, fontSize: size.sheetTitle, color: color.ink },
  sheetMeta: { fontFamily: font.body, fontSize: 14, color: color.muted, marginTop: 4 },
  sheetPhoto: { width: '100%', height: 160, borderRadius: 14, marginTop: 14, backgroundColor: color.stripeA },
  sheetNota: { fontFamily: font.body, fontSize: size.body, color: color.ink2, marginTop: 12, marginBottom: 8, lineHeight: size.body * 1.5 },
})
