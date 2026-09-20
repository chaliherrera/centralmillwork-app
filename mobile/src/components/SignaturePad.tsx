import React, { useRef } from 'react'
import { Modal, View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Signature from 'react-native-signature-canvas'
import * as FileSystem from 'expo-file-system/legacy'

interface Props {
  visible: boolean
  onCancel: () => void
  onSave: (fileUri: string) => void
  titulo?: string
}

// Estilo del lienzo (el componente usa una WebView por dentro). Ocultamos su
// footer propio y usamos botones nativos.
const webStyle = `
  .m-signature-pad { box-shadow: none; border: none; }
  .m-signature-pad--body { border: 1px dashed #C18A2D; border-radius: 10px; }
  .m-signature-pad--footer { display: none; }
  body, html { background: #F4F5F2; }
`

export default function SignaturePad({ visible, onCancel, onSave, titulo }: Props) {
  const ref = useRef<any>(null)
  const [saving, setSaving] = React.useState(false)

  // sig = "data:image/png;base64,...." → se guarda como PNG en documentDirectory
  // para subirlo como cualquier foto (el SO no purga documentDirectory).
  const handleOK = async (sig: string) => {
    try {
      setSaving(true)
      const base64 = sig.replace(/^data:image\/\w+;base64,/, '')
      const uri = `${FileSystem.documentDirectory}firma_${Date.now()}.png`
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 })
      onSave(uri)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onCancel}><Text style={styles.cancel}>Cancelar</Text></TouchableOpacity>
          <Text style={styles.title}>{titulo ?? 'Firma del cliente'}</Text>
          <View style={{ width: 64 }} />
        </View>

        <View style={styles.canvas}>
          <Signature
            ref={ref}
            onOK={handleOK}
            webStyle={webStyle}
            backgroundColor="#F4F5F2"
            penColor="#1F2419"
            descriptionText=""
          />
        </View>

        <View style={styles.actions}>
          <TouchableOpacity style={[styles.btn, styles.btnGhost]} onPress={() => ref.current?.clearSignature()} disabled={saving}>
            <Text style={styles.btnGhostText}>Borrar</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.btn, styles.btnGreen]} onPress={() => ref.current?.readSignature()} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.btnText}>Guardar firma</Text>}
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F4F5F2' },
  header: { backgroundColor: '#2c3126', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13 },
  cancel: { color: '#fff', fontSize: 14, width: 64 },
  title: { color: '#C18A2D', fontSize: 15, fontWeight: '700' },
  canvas: { flex: 1, margin: 16 },
  actions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  btn: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnGhost: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#C8C5BC' },
  btnGhostText: { color: '#5A5F52', fontWeight: '700' },
  btnGreen: { backgroundColor: '#16A34A' },
  btnText: { color: '#fff', fontWeight: '800' },
})
