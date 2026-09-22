import React from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { modulosParaRol, RouteName } from '../config/modulos'
import type { RootStackParamList } from '../navigation/types'
import { Screen, Icon, SectionHeader, EmptyState, color, font, size, space } from '../ui'
import type { IconName } from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin', PROCUREMENT: 'Compras', PRODUCTION: 'Producción',
  PROJECT_MANAGEMENT: 'Project Manager', CONTABILIDAD: 'Contabilidad',
  SHOP_MANAGER: 'Jefe de taller', ENGINEERING: 'Ingeniería',
  LOGISTICA: 'Logística', FIELD: 'Campo', VIEWER: 'Consulta',
}

// Módulo → ícono de trazo (reemplaza los emojis de la config).
const ICONS: Record<RouteName, IconName> = {
  Recepciones: 'download', OrdenesCompra: 'doc', MaterialesMto: 'truck',
  ControlMto: 'check', Proyectos: 'project', Instalacion: 'hammer', Buscar: 'search',
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
  const modulos = modulosParaRol(user?.rol)
  const primerNombre = user?.nombre?.split(' ')[0] ?? ''

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.fecha}>{fechaLarga()}</Text>
        <Text style={styles.hola}>{saludo()},{'\n'}{primerNombre}</Text>
        <Text style={styles.rol}>{ROL_LABEL[user?.rol ?? ''] ?? user?.rol}</Text>

        {modulos.length === 0 ? (
          <EmptyState title="Sin módulos habilitados" line="Tu rol no tiene herramientas en el móvil todavía." />
        ) : (
          <>
            <SectionHeader title="¿Qué necesitás hacer?" style={{ marginTop: space.gapXl, marginBottom: 4 }} />
            <View>
              {modulos.map((m) => (
                <Pressable
                  key={m.id}
                  onPress={() => navigation.navigate(m.route as any)}
                  style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                >
                  <View style={styles.iconWrap}>
                    <Icon name={ICONS[m.route]} size={22} color={color.gold} strokeWidth={1.8} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.rowTitle}>{m.label}</Text>
                    <Text style={styles.rowMeta}>{m.descripcion}</Text>
                  </View>
                  {m.offline === 'online' ? <Text style={styles.needNet}>requiere red</Text> : null}
                  <Icon name="chevron" size={16} color="#6E665C" strokeWidth={1.8} />
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Pressable onPress={logout} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.6 }]}>
          <Icon name="user" size={20} color={color.muted} strokeWidth={1.8} />
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingTop: 24, paddingBottom: 60 },
  fecha: { fontFamily: font.body, fontSize: 14, color: color.muted },
  hola: { fontFamily: font.titleSemi, fontSize: 32, lineHeight: 37, color: color.ink, letterSpacing: -0.4, marginTop: 8 },
  rol: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: color.gold, marginTop: 10 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, minHeight: 72,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line,
  },
  iconWrap: { width: 30, alignItems: 'center' },
  rowTitle: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },
  rowMeta: { fontFamily: font.body, fontSize: size.secondary, color: color.mutedStrong, marginTop: 3 },
  needNet: { fontFamily: font.kickerMed, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: color.mutedStrong },
  logout: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: space.gapXl, paddingVertical: 14 },
  logoutText: { fontFamily: font.bodyMed, fontSize: size.body, color: color.muted },
})
