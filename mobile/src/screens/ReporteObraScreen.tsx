import React, { useState } from 'react'
import { View, Text, StyleSheet, Alert, Image, ScrollView, Pressable } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { scheduleService } from '../services/schedule'
import type { RootStackParamList } from '../navigation/types'
import { Screen, Toolbar, Field, PrimaryButton, Icon, color, font, size, space } from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function ReporteObraScreen() {
  const nav = useNavigation<Nav>()
  const insets = useSafeAreaInsets()
  const { params } = useRoute<RouteProp<RootStackParamList, 'ReporteObra'>>()
  const [descripcion, setDescripcion] = useState('')
  const [foto, setFoto] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  const tomarFoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync()
    if (!perm.granted) { Alert.alert('Permiso denegado', 'Necesitás permitir la cámara.'); return }
    const r = await ImagePicker.launchCameraAsync({ quality: 0.7 })
    if (!r.canceled && r.assets?.[0]?.uri) setFoto(r.assets[0].uri)
  }

  const enviar = async () => {
    const desc = descripcion.trim()
    if (!desc) { Alert.alert('Falta descripción', 'Describí el daño o faltante.'); return }
    setEnviando(true)
    try {
      const r = await scheduleService.reporteObra(params.proyectoId, desc, foto || undefined)
      Alert.alert(
        r.queued ? 'Guardado sin señal' : 'Enviado',
        r.queued ? 'El reporte se enviará al PM al reconectar.' : `El reporte se envió al PM de ${params.codigo}.`,
        [{ text: 'OK', onPress: () => nav.goBack() }]
      )
    } catch (err: any) {
      Alert.alert('Error', err?.response?.data?.message || 'No se pudo enviar el reporte')
    } finally { setEnviando(false) }
  }

  return (
    <Screen edges={['bottom']}>
      <Toolbar title="Reportar daño" subtitle={`${params.codigo} · ${params.nombre}`} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 62 }]} showsVerticalScrollIndicator={false}>
        <Text style={styles.aviso}>Esto crea una tarea en el escritorio del PM del proyecto (con la foto). No entra a la punch list.</Text>

        <Field label="¿Qué pasó?" value={descripcion} onChangeText={setDescripcion} multiline
          placeholder="Ej. Puerta del ítem 04 llegó rayada, falta 1 tirador…" style={{ marginTop: 20 }} />

        {foto ? <Image source={{ uri: foto }} style={styles.preview} /> : null}
        <Pressable onPress={tomarFoto} style={({ pressed }) => [styles.fotoBtn, pressed && { opacity: 0.6 }]}>
          <Icon name="camera" size={18} color={color.muted} strokeWidth={1.8} />
          <Text style={styles.fotoText}>{foto ? 'Cambiar foto' : 'Agregar foto (opcional)'}</Text>
        </Pressable>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <PrimaryButton label="Enviar al PM" icon="alert" onPress={enviar} loading={enviando} tall />
      </View>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingBottom: 40 },
  aviso: { fontFamily: font.body, fontSize: size.secondary, color: color.muted, lineHeight: size.secondary * 1.55, marginTop: 14 },
  preview: { width: '100%', height: 180, borderRadius: 14, marginTop: 16, backgroundColor: color.stripeA },
  fotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 52, marginTop: 14, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2, borderColor: 'rgba(245,240,232,0.14)' },
  fotoText: { fontFamily: font.bodyMed, fontSize: size.body, color: color.muted },
  footer: { paddingHorizontal: space.margin, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
})
