import { Text, View, StyleSheet } from 'react-native'
import { color as C, font } from '../theme/tokens'

// Urgencia de ETA → color del vocabulario fijo (coral vencido · dorado por vencer ·
// verde con margen · gris sin ETA). Se muestra como ● + palabra.
export function getEtaInfo(eta: string | null | undefined): { label: string; color: string } {
  if (!eta) return { label: 'Sin ETA', color: C.grey }
  const etaDate = new Date(eta.slice(0, 10) + 'T00:00:00')
  if (isNaN(etaDate.getTime())) return { label: 'Sin ETA', color: C.grey }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((etaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: `Vencido ${Math.abs(diffDays)}d`, color: C.coral }
  if (diffDays <= 2) return { label: `Vence en ${diffDays}d`, color: C.gold }
  return { label: `En ${diffDays}d`, color: C.green }
}

export function EtaBadge({ eta }: { eta: string | null | undefined }) {
  const info = getEtaInfo(eta)
  return (
    <View style={s.row}>
      <View style={[s.dot, { backgroundColor: info.color }]} />
      <Text style={s.text}>{info.label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  text: { fontFamily: font.bodySemi, fontSize: 12.5, color: C.ink },
})
