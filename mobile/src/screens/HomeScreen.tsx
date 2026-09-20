import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { modulosParaRol, Modulo } from '../config/modulos'
import type { RootStackParamList } from '../navigation/types'

type Nav = NativeStackNavigationProp<RootStackParamList>

// Etiqueta corta del rol para el saludo.
const ROL_LABEL: Record<string, string> = {
  ADMIN: 'Admin', PROCUREMENT: 'Compras', PRODUCTION: 'Producción',
  PROJECT_MANAGEMENT: 'Project Manager', CONTABILIDAD: 'Contabilidad',
  SHOP_MANAGER: 'Jefe de taller', ENGINEERING: 'Ingeniería',
  LOGISTICA: 'Logística', FIELD: 'Campo', VIEWER: 'Consulta',
}

export default function HomeScreen() {
  const { user, logout } = useAuth()
  const navigation = useNavigation<Nav>()
  const modulos = modulosParaRol(user?.rol)
  const primerNombre = user?.nombre?.split(' ')[0] ?? ''

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>CENTRAL MILLWORK</Text>
          <Text style={styles.who}>{user?.nombre} · {ROL_LABEL[user?.rol ?? ''] ?? user?.rol}</Text>
        </View>
        <TouchableOpacity onPress={logout}><Text style={styles.salir}>Salir</Text></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hola}>Hola, {primerNombre}</Text>
        <Text style={styles.sub}>¿Qué necesitás hacer?</Text>

        {modulos.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Tu rol no tiene módulos habilitados en el móvil todavía.</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {modulos.map((m) => (
              <Tile key={m.id} m={m} onPress={() => navigation.navigate(m.route as any)} />
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}

function Tile({ m, onPress }: { m: Modulo; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={onPress} activeOpacity={0.75}>
      {m.offline === 'online' && (
        <View style={styles.lock}><Text style={styles.lockText}>requiere red</Text></View>
      )}
      <Text style={styles.tileIcon}>{m.icon}</Text>
      <Text style={styles.tileLabel}>{m.label}</Text>
      <Text style={styles.tileDesc}>{m.descripcion}</Text>
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#2c3126' },
  header: {
    backgroundColor: '#2c3126', paddingVertical: 14, paddingHorizontal: 18,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  brand: { color: '#C18A2D', fontSize: 14, fontWeight: '800', letterSpacing: 2 },
  who: { color: '#E8C684', fontSize: 11, marginTop: 3, opacity: 0.9 },
  salir: { color: '#fff', fontSize: 13, opacity: 0.8 },
  content: { backgroundColor: '#F4F5F2', flexGrow: 1, padding: 20, paddingTop: 22, borderTopLeftRadius: 18, borderTopRightRadius: 18 },
  hola: { fontSize: 24, fontWeight: '800', color: '#2c3126', letterSpacing: -0.3 },
  sub: { fontSize: 14, color: '#5A5F52', marginTop: 3, marginBottom: 18 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tile: {
    width: '48%', backgroundColor: '#fff', borderRadius: 14, padding: 15, marginBottom: 12,
    borderWidth: 1, borderColor: '#E0DFD9', minHeight: 108,
  },
  tileIcon: { fontSize: 24 },
  tileLabel: { fontSize: 14.5, fontWeight: '800', color: '#2c3126', marginTop: 10, lineHeight: 18 },
  tileDesc: { fontSize: 11, color: '#5A5F52', marginTop: 3 },
  lock: { position: 'absolute', top: 10, right: 10, backgroundColor: '#EFE7D2', borderRadius: 999, paddingHorizontal: 7, paddingVertical: 2 },
  lockText: { fontSize: 8.5, fontWeight: '800', color: '#7d5c00', letterSpacing: 0.3 },
  empty: { backgroundColor: '#fff', borderRadius: 12, padding: 20, borderLeftWidth: 4, borderLeftColor: '#C18A2D' },
  emptyText: { fontSize: 14, color: '#5A5F52', lineHeight: 20 },
})
