import React, { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, TextInput, Image,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { scheduleService, InstallProyecto, PunchItem } from '../services/schedule'

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

export default function InstallDetailScreen({ proyecto, onBack, onChanged }: Props) {
  const [hitos, setHitos] = useState<HitoEstado[]>(proyecto.hitos)
  const [punch, setPunch] = useState<PunchItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [nuevoPunch, setNuevoPunch] = useState('')
  const [nuevoArea, setNuevoArea] = useState('')
  const [firmaCliente, setFirmaCliente] = useState(proyecto.cliente || '')

  const done = (codigo: string) => hitos.find((h) => h.codigo === codigo)?.fecha_real ?? null

  const recargar = useCallback(async () => {
    try {
      const [plan, punchList] = await Promise.all([
        scheduleService.getPlan(proyecto.proyecto_id),
        scheduleService.getPunch(proyecto.proyecto_id),
      ])
      if (plan?.hitos) {
        setHitos(plan.hitos.map((h: any) => ({ codigo: h.codigo, fecha_real: h.fecha_real })))
      }
      setPunch(punchList)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudieron cargar los datos')
    } finally {
      setLoading(false)
    }
  }, [proyecto.proyecto_id])

  useEffect(() => { recargar() }, [recargar])

  // ── Check-in (I-04) / Avance (I-05) ────────────────────────────────────────
  const registrarFoto = async (codigo: 'I-04' | 'I-05', etiqueta: string) => {
    const uri = await tomarFoto()
    if (!uri) return
    setBusy(codigo)
    try {
      await scheduleService.registrarConFoto(proyecto.proyecto_id, codigo, uri)
      await recargar()
      onChanged()
      Alert.alert('Listo', `${etiqueta} registrado con foto.`)
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || `No se pudo registrar ${etiqueta}`)
    } finally {
      setBusy(null)
    }
  }

  // ── Punch list ─────────────────────────────────────────────────────────────
  const agregarPunch = async (conFoto: boolean) => {
    const desc = nuevoPunch.trim()
    if (!desc) { Alert.alert('Falta descripción', 'Describí el pendiente.'); return }
    let uri: string | null = null
    if (conFoto) { uri = await tomarFoto(); if (!uri) return }
    setBusy('punch-add')
    try {
      await scheduleService.crearPunch(proyecto.proyecto_id, desc, nuevoArea.trim() || undefined, uri || undefined)
      setNuevoPunch(''); setNuevoArea('')
      await recargar()
      onChanged()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo agregar el pendiente')
    } finally {
      setBusy(null)
    }
  }

  const resolverPunch = async (item: PunchItem) => {
    const uri = await tomarFoto() // foto de resuelto (opcional: si cancela, resuelve sin foto)
    setBusy(`punch-${item.id}`)
    try {
      await scheduleService.resolverPunch(item.id, uri || undefined)
      await recargar()
      onChanged()
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo resolver')
    } finally {
      setBusy(null)
    }
  }

  // ── Sign-off (I-07) ────────────────────────────────────────────────────────
  const abiertos = punch.filter((p) => p.estado === 'abierto').length
  const puedeEntregar = !!done('I-04') && abiertos === 0

  const hacerSignoff = () => {
    Alert.alert(
      'Confirmar entrega',
      `Vas a registrar el sign-off del cliente. Esto marca el proyecto como ENTREGADO.\n\n¿Continuar?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            const uri = await tomarFoto() // firma/foto opcional
            setBusy('signoff')
            try {
              await scheduleService.signoff(proyecto.proyecto_id, firmaCliente.trim() || undefined, uri || undefined)
              await recargar()
              onChanged()
              Alert.alert('¡Entregado!', 'Sign-off del cliente registrado. Proyecto ENTREGADO.')
            } catch (err: any) {
              Alert.alert('Error', err?.response?.data?.message || 'No se pudo registrar el sign-off')
            } finally {
              setBusy(null)
            }
          },
        },
      ]
    )
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

        <ScrollView contentContainerStyle={styles.content}>
          {/* 1. Check-in */}
          <StepCard n="1" titulo="Check-in en obra" hito="I-04"
            hecho={done('I-04')} sub="Foto de llegada a la obra">
            {done('I-04') ? (
              <DoneRow fecha={done('I-04')!} />
            ) : (
              <ActionBtn label="📷 Tomar foto y hacer check-in" loading={busy === 'I-04'}
                onPress={() => registrarFoto('I-04', 'Check-in')} />
            )}
          </StepCard>

          {/* 2. Avance */}
          <StepCard n="2" titulo="Avance de instalación" hito="I-05"
            hecho={done('I-05')} sub="Registrá el progreso con foto (podés hacerlo varias veces)">
            {done('I-05') && <DoneRow fecha={done('I-05')!} extra="Último avance" />}
            <ActionBtn label="📷 Registrar avance con foto" loading={busy === 'I-05'}
              disabled={!done('I-04')}
              onPress={() => registrarFoto('I-05', 'Avance')} />
            {!done('I-04') && <Text style={styles.gateHint}>Primero hacé el check-in.</Text>}
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
                  <View style={styles.punchThumbs}>
                    {item.foto_problema_url ? <Image source={{ uri: item.foto_problema_url }} style={styles.punchThumb} /> : null}
                    {item.foto_resuelto_url ? <Image source={{ uri: item.foto_resuelto_url }} style={styles.punchThumb} /> : null}
                  </View>
                </View>
                {item.estado === 'resuelto' ? (
                  <Text style={styles.punchResuelto}>✓ Resuelto</Text>
                ) : (
                  <TouchableOpacity onPress={() => resolverPunch(item)} disabled={busy === `punch-${item.id}`} style={styles.resolverBtn}>
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
                <ActionBtn label="✍️ Registrar entrega (foto de firma)" loading={busy === 'signoff'}
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
})
