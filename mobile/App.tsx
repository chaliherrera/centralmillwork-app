import React, { useEffect } from 'react'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { AuthProvider } from './src/context/AuthContext'
import RootNavigator from './src/navigation/RootNavigator'
import { startOutboxWorker } from './src/services/outbox'

// networkMode 'offlineFirst': sirve del cache si no hay red (consulta offline).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      staleTime: 30_000,
      gcTime: 1000 * 60 * 60 * 24, // 24 h — retener en cache para uso offline
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
})

// Persiste el cache de consultas entre reinicios (Materiales, Control MTO, OCs,
// Proyectos, cola de instalación) → consultables sin señal al abrir la app.
const persister = createAsyncStoragePersister({ storage: AsyncStorage })

export default function App() {
  // Worker de la cola offline: reenvía las escrituras de obra al recuperar señal.
  useEffect(() => { startOutboxWorker() }, [])

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{ persister, maxAge: 1000 * 60 * 60 * 24 }}
      >
        <AuthProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </AuthProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  )
}
