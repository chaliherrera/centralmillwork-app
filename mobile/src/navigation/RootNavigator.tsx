import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from './types'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import OCsListScreen from '../screens/OCsListScreen'
import OCDetailScreen from '../screens/OCDetailScreen'
import SearchScreen from '../screens/SearchScreen'
import InstallListScreen from '../screens/InstallListScreen'
import InstallDetailScreen from '../screens/InstallDetailScreen'
import MaterialesMtoScreen from '../screens/MaterialesMtoScreen'
import ControlMtoScreen from '../screens/ControlMtoScreen'
import OrdenesCompraScreen from '../screens/OrdenesCompraScreen'
import ProyectosScreen from '../screens/ProyectosScreen'
import ReporteObraScreen from '../screens/ReporteObraScreen'
import PlanosScreen from '../screens/PlanosScreen'
import GenerarOCScreen from '../screens/GenerarOCScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()
type Nav = NativeStackNavigationProp<RootStackParamList>

// ── Adaptadores: las pantallas existentes usan props (onBack/onSelect/…); acá se
// las conecta a React Navigation sin modificarlas (traen su propio header). ────
function RecepcionesRoute() {
  const nav = useNavigation<Nav>()
  const { logout } = useAuth()
  return <OCsListScreen onSelect={(oc) => nav.navigate('OCDetail', { oc })} onLogout={logout} />
}
function OCDetailRoute() {
  const nav = useNavigation<Nav>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'OCDetail'>>()
  return <OCDetailScreen oc={params.oc} onBack={() => nav.goBack()} onSaved={() => nav.goBack()} />
}
function BuscarRoute() {
  const nav = useNavigation<Nav>()
  return <SearchScreen onBack={() => nav.goBack()} />
}
function InstalacionRoute() {
  const nav = useNavigation<Nav>()
  return <InstallListScreen onSelect={(p) => nav.navigate('InstallDetail', { proyecto: p })} onBack={() => nav.goBack()} />
}
function InstallDetailRoute() {
  const nav = useNavigation<Nav>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'InstallDetail'>>()
  return <InstallDetailScreen proyecto={params.proyecto} onBack={() => nav.goBack()} onChanged={() => {}} />
}

// Header nativo tematizado (para las pantallas nuevas de la consola Admin).
const HEADER = {
  headerStyle: { backgroundColor: '#2c3126' },
  headerTintColor: '#E8C684',
  headerTitleStyle: { fontWeight: '700' as const },
}

export default function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#2c3126' }}>
        <ActivityIndicator size="large" color="#C18A2D" />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={LoginAsHome} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator>
          {/* Home y pantallas con header propio: sin header nativo */}
          <Stack.Group screenOptions={{ headerShown: false }}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen name="Recepciones" component={RecepcionesRoute} />
            <Stack.Screen name="OCDetail" component={OCDetailRoute} />
            <Stack.Screen name="Buscar" component={BuscarRoute} />
            <Stack.Screen name="Instalacion" component={InstalacionRoute} />
            <Stack.Screen name="InstallDetail" component={InstallDetailRoute} />
            <Stack.Screen name="ReporteObra" component={ReporteObraScreen} />
          </Stack.Group>
          {/* Consola Admin + planos (nuevas): header nativo tematizado */}
          <Stack.Group screenOptions={HEADER}>
            <Stack.Screen name="MaterialesMto" component={MaterialesMtoScreen} options={{ title: 'Materiales MTO' }} />
            <Stack.Screen name="ControlMto" component={ControlMtoScreen} options={{ title: 'Control MTO' }} />
            <Stack.Screen name="OrdenesCompra" component={OrdenesCompraScreen} options={{ title: 'Órdenes de Compra' }} />
            <Stack.Screen name="GenerarOC" component={GenerarOCScreen} options={{ title: 'Generar OC' }} />
            <Stack.Screen name="Proyectos" component={ProyectosScreen} options={{ title: 'Proyectos' }} />
            <Stack.Screen name="PlanosObra" component={PlanosScreen} options={{ title: 'Planos' }} />
          </Stack.Group>
        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}

// LoginScreen no toma props de navegación (usa AuthContext.login); se monta como
// única pantalla mientras no hay sesión.
function LoginAsHome() { return <LoginScreen /> }
