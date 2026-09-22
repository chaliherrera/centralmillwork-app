import React from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { areasParaRol } from '../config/modulos'
import type { RootStackParamList } from '../navigation/types'
import { Screen, Glass, Icon, SectionHeader, EmptyState, color, font, size, space } from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin', PROCUREMENT: 'Compras', PRODUCTION: 'Producción',
  PROJECT_MANAGEMENT: 'Project Manager', ESTIMADOS: 'Estimados', CONTABILIDAD: 'Contabilidad',
  SHOP_MANAGER: 'Jefe de taller', ENGINEERING: 'Ingeniería',
  LOGISTICA: 'Logística', FIELD: 'Campo', VIEWER: 'Consulta',
}

function saludo(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}
function fechaLarga(): string {
  const s = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })
  return s.charAt(0).toUpperCase() + s.slice(1).replace(',', '')
}

export default function HomeScreen() {
  const { user, logout } = useAuth()
  const navigation = useNavigation<Nav>()
  const areas = areasParaRol(user?.rol)
  const primerNombre = user?.nombre?.split(' ')[0] ?? ''

  const abrirArea = (a: (typeof areas)[number]) => {
    if (a.modulos.length === 1) navigation.navigate(a.modulos[0].route as any)
    else navigation.navigate('AreaHub', { area: a.area.key })
  }

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.fecha}>{fechaLarga()}</Text>
        <Text style={styles.hola}>{saludo()},{'\n'}{primerNombre}</Text>
        <Text style={styles.rol}>{ROL_LABEL[user?.rol ?? ''] ?? user?.rol}</Text>

        {areas.length === 0 ? (
          <EmptyState title="Sin áreas habilitadas" line="Tu rol no tiene herramientas en el móvil todavía." />
        ) : (
          <>
            <SectionHeader title="¿Qué necesitás hacer?" style={{ marginTop: space.gapXl, marginBottom: 16 }} />
            <View style={styles.grid}>
              {areas.map(({ area, modulos }) => (
                <Pressable key={area.key} onPress={() => abrirArea({ area, modulos })} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.8, transform: [{ scale: 0.98 }] }]}>
                  <Glass recipe="floating" radius={24} highlight style={{ flex: 1 }}>
                    <View style={styles.tileBody}>
                      <View style={styles.tileTop}>
                        <Icon name={area.icon} size={30} color={color.gold} strokeWidth={1.7} />
                        <Text style={styles.count}>{modulos.length}</Text>
                      </View>
                      <View>
                        <Text style={styles.tileLabel}>{area.label}</Text>
                        <Text style={styles.tileDesc} numberOfLines={2}>{area.descripcion}</Text>
                      </View>
                    </View>
                  </Glass>
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Cerrar sesión al pie */}
      <Pressable onPress={logout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.6 }]}>
        <Icon name="user" size={20} color={color.muted} strokeWidth={1.8} />
        <Text style={styles.logoutText}>Cerrar sesión</Text>
      </Pressable>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingTop: 24, paddingBottom: 24 },
  fecha: { fontFamily: font.body, fontSize: 14, color: color.muted },
  hola: { fontFamily: font.titleSemi, fontSize: 32, lineHeight: 37, color: color.ink, letterSpacing: -0.4, marginTop: 8 },
  rol: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: color.gold, marginTop: 10 },
  grid: { flexDirection: 'row', gap: 14 },
  tile: { flex: 1, aspectRatio: 0.92 },
  tileBody: { flex: 1, padding: 18, justifyContent: 'space-between' },
  tileTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  count: { fontFamily: font.titleSemi, fontSize: 20, color: color.ink2 },
  tileLabel: { fontFamily: font.bodySemi, fontSize: 19, color: color.ink },
  tileDesc: { fontFamily: font.body, fontSize: 12.5, color: color.ink2, marginTop: 5, lineHeight: 17 },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: space.margin, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.line },
  logoutText: { fontFamily: font.bodyMed, fontSize: size.body, color: color.muted },
})
