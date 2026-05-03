import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'

export default function HomeScreen() {
  const { user, logout } = useAuth()

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.brand}>CENTRAL MILLWORK</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.welcome}>Hola, {user?.nombre}</Text>
        <Text style={styles.role}>Rol: {user?.rol}</Text>

        <View style={styles.placeholder}>
          <Text style={styles.placeholderTitle}>App móvil v1</Text>
          <Text style={styles.placeholderText}>
            Pronto vas a poder ver y registrar recepciones desde acá.
          </Text>
        </View>

        <TouchableOpacity onPress={logout} style={styles.logoutBtn}>
          <Text style={styles.logoutText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F4F5F2' },
  header: {
    backgroundColor: '#2c3126', paddingVertical: 16, paddingHorizontal: 20,
    alignItems: 'center',
  },
  brand: { color: '#C18A2D', fontSize: 16, fontWeight: '800', letterSpacing: 2 },
  content: { flex: 1, padding: 24 },
  welcome: { fontSize: 22, fontWeight: '700', color: '#2c3126', marginTop: 20 },
  role: { fontSize: 14, color: '#5A5F52', marginTop: 4, marginBottom: 30 },
  placeholder: {
    backgroundColor: '#fff', padding: 20, borderRadius: 10,
    borderLeftWidth: 4, borderLeftColor: '#C18A2D',
  },
  placeholderTitle: { fontSize: 15, fontWeight: '700', color: '#2c3126', marginBottom: 6 },
  placeholderText: { fontSize: 14, color: '#5A5F52', lineHeight: 20 },
  logoutBtn: {
    marginTop: 'auto', backgroundColor: '#fff', padding: 14, borderRadius: 8,
    alignItems: 'center', borderWidth: 1, borderColor: '#E0DFD9',
  },
  logoutText: { color: '#5A5F52', fontWeight: '600' },
})
