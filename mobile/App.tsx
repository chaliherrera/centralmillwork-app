import React, { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import OCsListScreen from './src/screens/OCsListScreen'
import OCDetailScreen from './src/screens/OCDetailScreen'
import { OrdenCompra } from './src/services/ordenesCompra'

function RootNavigator() {
  const { user, loading, logout } = useAuth()
  const [selectedOc, setSelectedOc] = useState<OrdenCompra | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2c3126' }}>
        <ActivityIndicator size="large" color="#C18A2D" />
      </View>
    )
  }

  if (!user) return <LoginScreen />

  if (selectedOc) {
    return (
      <OCDetailScreen
        oc={selectedOc}
        onBack={() => setSelectedOc(null)}
        onSaved={() => {
          setSelectedOc(null)
          setRefreshKey((k) => k + 1)
        }}
      />
    )
  }

  return (
    <OCsListScreen
      key={refreshKey}
      onSelect={(oc) => setSelectedOc(oc)}
      onLogout={logout}
    />
  )
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="light" />
        <RootNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  )
}
