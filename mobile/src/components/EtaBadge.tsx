import { Text, View, StyleSheet } from 'react-native'

export function getEtaInfo(eta: string | null | undefined) {
  if (!eta) return { label: 'SIN ETA', color: '#9A9A9A', bg: '#F0F0F0' }
  // Backend devuelve DATE columns como ISO datetime ("2026-05-15T00:00:00.000Z").
  // Tomamos los primeros 10 chars para normalizar a "YYYY-MM-DD" y parsear como
  // medianoche local, así el diff con `today` (medianoche local) queda en días enteros.
  const etaDate = new Date(eta.slice(0, 10) + 'T00:00:00')
  if (isNaN(etaDate.getTime())) return { label: 'SIN ETA', color: '#9A9A9A', bg: '#F0F0F0' }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diffDays = Math.round((etaDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
  if (diffDays < 0) return { label: `VENCIDO ${Math.abs(diffDays)}D`, color: '#fff', bg: '#C0392B' }
  if (diffDays <= 2) return { label: `VENCE EN ${diffDays}D`, color: '#7A5500', bg: '#F4D03F' }
  return { label: `EN ${diffDays}D`, color: '#1B5E20', bg: '#A8D08D' }
}

export function EtaBadge({ eta }: { eta: string | null | undefined }) {
  const info = getEtaInfo(eta)
  return (
    <View style={[badgeStyles.badge, { backgroundColor: info.bg }]}>
      <Text style={[badgeStyles.text, { color: info.color }]}>{info.label}</Text>
    </View>
  )
}

const badgeStyles = StyleSheet.create({
  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 4, alignSelf: 'flex-start' },
  text: { fontSize: 10, fontWeight: '700', letterSpacing: 0.4 },
})
