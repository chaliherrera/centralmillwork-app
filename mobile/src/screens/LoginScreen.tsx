import React, { useState } from 'react'
import { View, Text, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { useAuth } from '../context/AuthContext'
import { Screen, Field, PrimaryButton, color, font, space } from '../ui'

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
    <Screen>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.flex}>
        <View style={styles.content}>
          <Text style={styles.kicker}>Central Millwork</Text>
          <Text style={styles.title}>App de campo</Text>
          <Text style={styles.sub}>Ingresá con tu cuenta para arrancar.</Text>

          <View style={styles.form}>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              placeholder="tu@centralmillwork.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              editable={!loading}
            />
            <Field
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              secureTextEntry
              editable={!loading}
            />
            <PrimaryButton label="Iniciar sesión" onPress={handleLogin} loading={loading} tall style={{ marginTop: 6 }} />
          </View>

          <Text style={styles.footer}>Versión 1.0 · 2026</Text>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { flex: 1, justifyContent: 'center', paddingHorizontal: space.margin },
  kicker: { fontFamily: font.kickerSemi, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', color: color.gold },
  title: { fontFamily: font.titleSemi, fontSize: 32, color: color.ink, letterSpacing: -0.4, marginTop: 8 },
  sub: { fontFamily: font.body, fontSize: 15, color: color.muted, marginTop: 8, marginBottom: 34 },
  form: { gap: 16 },
  footer: { fontFamily: font.body, fontSize: 12, color: color.mutedStrong, textAlign: 'center', marginTop: 34 },
})
