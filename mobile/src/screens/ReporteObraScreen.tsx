import React, { useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ActivityIndicator, Alert, Image, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as ImagePicker from 'expo-image-picker'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { scheduleService } from '../services/schedule'
import type { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function ReporteObraScreen() {
  const nav = useNavigation<Nav>()
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
    } finally {
      setEnviando(false)
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => nav.goBack()}><Text style={styles.back}>← Volver</Text></TouchableOpacity>
        <Text style={styles.hTitle}>Reportar daño / faltante</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.proj}>{params.codigo} · {params.nombre}</Text>
        <View style={styles.aviso}>
          <Text style={styles.avisoText}>Esto crea una tarea en el escritorio del PM del proyecto (con la foto). No entra a la punch list.</Text>
        </View>

        <Text style={styles.label}>¿Qué pasó?</Text>
        <TextInput
          value={descripcion} onChangeText={setDescripcion} multiline
          placeholder="Ej: Puerta del ítem 04 llegó rayada, falta 1 tirador…"
          placeholderTextColor="#999" style={styles.input}
        />

        {foto ? (
          <Image source={{ uri: foto }} style={styles.preview} />
        ) : null}
        <TouchableOpacity style={styles.fotoBtn} onPress={tomarFoto}>
          <Text style={styles.fotoBtnText}>{foto ? '📷 Cambiar foto' : '📷 Agregar foto (opcional)'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={[styles.enviar, enviando && { opacity: 0.6 }]} onPress={enviar} disabled={enviando}>
          {enviando ? <ActivityIndicator color="#fff" /> : <Text style={styles.enviarText}>Enviar al PM</Text>}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#2c3126' },
  header: { backgroundColor: '#2c3126', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 13 },
  back: { color: '#fff', fontSize: 14 },
  hTitle: { color: '#C18A2D', fontSize: 15, fontWeight: '700' },
  content: { backgroundColor: '#F4F5F2', flexGrow: 1, padding: 18, borderTopLeftRadius: 16, borderTopRightRadius: 16 },
  proj: { fontFamily: 'Courier', fontSize: 13, fontWeight: '700', color: '#2c3126', marginBottom: 12 },
  aviso: { backgroundColor: '#F0F7E8', borderWidth: 1, borderColor: '#B8D89A', borderRadius: 10, padding: 11, marginBottom: 16 },
  avisoText: { fontSize: 12, color: '#2f6a12', lineHeight: 17 },
  label: { fontSize: 13, fontWeight: '700', color: '#2c3126', marginBottom: 6 },
  input: { backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0DFD9', padding: 12, fontSize: 14, color: '#1F2419', minHeight: 96, textAlignVertical: 'top' },
  preview: { width: '100%', height: 180, borderRadius: 10, marginTop: 12 },
  fotoBtn: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#C8C5BC', borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 12 },
  fotoBtnText: { color: '#5A5F52', fontWeight: '700', fontSize: 13 },
  enviar: { backgroundColor: '#C18A2D', borderRadius: 10, paddingVertical: 15, alignItems: 'center', marginTop: 20 },
  enviarText: { color: '#fff', fontWeight: '800', fontSize: 15 },
})
