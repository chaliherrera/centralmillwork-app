import React from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './src/context/AuthContext'
import RootNavigator from './src/navigation/RootNavigator'

// networkMode 'offlineFirst': sirve del cache si no hay red (base para consulta
// offline; la persistencia entre reinicios se agrega en Fase 1 con un persister).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

export default function App() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  )
}
