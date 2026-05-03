import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth } from '../context/AuthContext'

export default function LoginScreen() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    if (!email || !password) {
      Alert.alert('Faltan datos', 'Email y contraseña son obligatorios')
      return
    }
    setLoading(true)
    try {
      await login(email.trim(), password)
    } catch (err: any) {
      const msg = err?.response?.data?.message || 'No se pudo iniciar sesión'
      Alert.alert('Error', msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <View style={styles.content}>
          <Text style={styles.brand}>CENTRAL MILLWORK</Text>
          <Text style={styles.subtitle}>Sistema de Gestión de Compras</Text>

          <View style={styles.form}>
            <Text style={styles.label}>Email</Text>
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder="tu@centralmillwork.com"
              placeholderTextColor="#999"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              editable={!loading}
            />

            <Text style={styles.label}>Contraseña</Text>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor="#999"
              secureTextEntry
              style={styles.input}
              editable={!loading}
            />

            <TouchableOpacity
              onPress={handleLogin}
              disabled={loading}
              style={[styles.button, loading && styles.buttonDisabled]}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Iniciar sesión</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footer}>Versión 1.0 · 2026</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#2c3126' },
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  brand: { color: '#C18A2D', fontSize: 26, fontWeight: '800', textAlign: 'center', letterSpacing: 2 },
  subtitle: { color: '#E8C684', fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 40, letterSpacing: 1 },
  form: { backgroundColor: '#fff', borderRadius: 14, padding: 24, gap: 6 },
  label: { color: '#2c3126', fontSize: 13, fontWeight: '600', marginTop: 10 },
  input: {
    borderWidth: 1, borderColor: '#E0DFD9', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#1F2419',
    backgroundColor: '#FAFAF7', marginTop: 4,
  },
  button: {
    backgroundColor: '#C18A2D', borderRadius: 8,
    paddingVertical: 14, alignItems: 'center', marginTop: 22,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  footer: { color: '#E8C684', fontSize: 11, textAlign: 'center', marginTop: 30, opacity: 0.7 },
})
