import React, { useRef } from 'react'
import { Modal, View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Signature from 'react-native-signature-canvas'
import * as FileSystem from 'expo-file-system/legacy'
import { color, font, size, space } from '../theme/tokens'
import { PrimaryButton } from '../ui/controls'

interface Props {
  visible: boolean
  onCancel: () => void
  onSave: (fileUri: string) => void
  titulo?: string
}

// El cliente firma en una "hoja" clara (tinta oscura) dentro de la pantalla oscura:
// una firma se lee sobre papel. Ocultamos el footer propio del componente.
const PAPER = '#FBF9F4'
const webStyle = `
  .m-signature-pad { box-shadow: none; border: none; background: ${PAPER}; }
  .m-signature-pad--body { border: none; }
  .m-signature-pad--footer { display: none; }
  body, html { background: ${PAPER}; }
`

export default function SignaturePad({ visible, onCancel, onSave, titulo }: Props) {
  const ref = useRef<any>(null)
  const [saving, setSaving] = React.useState(false)

  const handleOK = async (sig: string) => {
    try {
      setSaving(true)
      const base64 = sig.replace(/^data:image\/\w+;base64,/, '')
      const uri = `${FileSystem.documentDirectory}firma_${Date.now()}.png`
      await FileSystem.writeAsStringAsync(uri, base64, { encoding: FileSystem.EncodingType.Base64 })
      onSave(uri)
    } finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel}>
      <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={8}><Text style={styles.cancel}>Cancelar</Text></Pressable>
          <Text style={styles.title}>{titulo ?? 'Firma del cliente'}</Text>
          <Pressable onPress={() => ref.current?.clearSignature()} hitSlop={8} disabled={saving}><Text style={styles.clear}>Borrar</Text></Pressable>
        </View>

        <Text style={styles.hint}>El cliente firma abajo para confirmar la entrega.</Text>

        <View style={styles.canvas}>
          <Signature ref={ref} onOK={handleOK} webStyle={webStyle} backgroundColor={PAPER} penColor="#1F2419" descriptionText="" />
        </View>

        <View style={styles.actions}>
          <PrimaryButton label="Guardar firma" icon="check" onPress={() => ref.current?.readSignature()} loading={saving} tall />
        </View>
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: color.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.margin, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  cancel: { fontFamily: font.bodyMed, fontSize: size.body, color: color.muted },
  clear: { fontFamily: font.bodyMed, fontSize: size.body, color: color.muted },
  title: { fontFamily: font.titleSemi, fontSize: size.section, color: color.ink },
  hint: { fontFamily: font.body, fontSize: size.secondary, color: color.muted, paddingHorizontal: space.margin, paddingTop: 14, paddingBottom: 6 },
  canvas: { flex: 1, margin: space.margin, marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: PAPER },
  actions: { paddingHorizontal: space.margin, paddingBottom: 12 },
})
