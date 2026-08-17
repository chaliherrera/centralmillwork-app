import React, { useState } from 'react'
import { ActivityIndicator, View } from 'react-native'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { AuthProvider, useAuth } from './src/context/AuthContext'
import LoginScreen from './src/screens/LoginScreen'
import OCsListScreen from './src/screens/OCsListScreen'
import OCDetailScreen from './src/screens/OCDetailScreen'
import SearchScreen from './src/screens/SearchScreen'
import InstallListScreen from './src/screens/InstallListScreen'
import InstallDetailScreen from './src/screens/InstallDetailScreen'
import { OrdenCompra } from './src/services/ordenesCompra'
import { InstallProyecto } from './src/services/schedule'

// Screens de la app. State-driven navigation (sin React Navigation) —
// mantiene simple el bundle. Agregado 'search' 2026-07-12, 'install' 2026-08-16.
type Screen = 'ocs' | 'search' | 'install'

function RootNavigator() {
  const { user, loading, logout } = useAuth()
  const [screen, setScreen] = useState<Screen>('ocs')
  const [selectedOc, setSelectedOc] = useState<OrdenCompra | null>(null)
  const [selectedProyecto, setSelectedProyecto] = useState<InstallProyecto | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2c3126' }}>
        <ActivityIndicator size="large" color="#C18A2D" />
      </View>
    )
  }

  if (!user) return <LoginScreen />

  // Detalle de OC — se muestra encima de cualquier screen
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

  if (screen === 'search') {
    return <SearchScreen onBack={() => setScreen('ocs')} />
  }

  if (screen === 'install') {
    // Detalle de una obra en instalación — encima de la lista.
    if (selectedProyecto) {
      return (
        <InstallDetailScreen
          proyecto={selectedProyecto}
          onBack={() => setSelectedProyecto(null)}
          onChanged={() => setRefreshKey((k) => k + 1)}
        />
      )
    }
    return (
      <InstallListScreen
        key={refreshKey}
        onSelect={(p) => setSelectedProyecto(p)}
        onBack={() => { setSelectedProyecto(null); setScreen('ocs') }}
      />
    )
  }

  return (
    <OCsListScreen
      key={refreshKey}
      onSelect={(oc) => setSelectedOc(oc)}
      onLogout={logout}
      onOpenSearch={() => setScreen('search')}
      onOpenInstall={() => setScreen('install')}
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
