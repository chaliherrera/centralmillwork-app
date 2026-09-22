import React from 'react'
import { View, ActivityIndicator } from 'react-native'
import { NavigationContainer, useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import { createNativeStackNavigator, NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import type { RootStackParamList } from './types'
import { color } from '../theme'

import LoginScreen from '../screens/LoginScreen'
import HomeScreen from '../screens/HomeScreen'
import AreaHubScreen from '../screens/AreaHubScreen'
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
import NuevaCompraScreen from '../screens/NuevaCompraScreen'

const Stack = createNativeStackNavigator<RootStackParamList>()
type Nav = NativeStackNavigationProp<RootStackParamList>

// Adaptadores: algunas pantallas existentes usan props (onBack/onSelect). Traen su
// propio header de vidrio, así que van sin header nativo.
function RecepcionesRoute() {
  const nav = useNavigation<Nav>()
  return <OCsListScreen onSelect={(oc) => nav.navigate('OCDetail', { oc })} onBack={() => nav.goBack()} />
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

export default function RootNavigator() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: color.bg }}>
        <ActivityIndicator size="large" color={color.gold} />
      </View>
    )
  }

  return (
    <NavigationContainer>
      {!user ? (
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen name="Home" component={LoginScreen as any} />
        </Stack.Navigator>
      ) : (
        // Todas las pantallas traen su propia toolbar de vidrio → sin header nativo.
        <Stack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.bg } }}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="AreaHub" component={AreaHubScreen} />
          <Stack.Screen name="Recepciones" component={RecepcionesRoute} />
          <Stack.Screen name="OCDetail" component={OCDetailRoute} />
          <Stack.Screen name="Buscar" component={BuscarRoute} />
          <Stack.Screen name="Instalacion" component={InstalacionRoute} />
          <Stack.Screen name="InstallDetail" component={InstallDetailRoute} />
          <Stack.Screen name="ReporteObra" component={ReporteObraScreen} />
          <Stack.Screen name="NuevaCompra" component={NuevaCompraScreen} />
          <Stack.Screen name="MaterialesMto" component={MaterialesMtoScreen} />
          <Stack.Screen name="ControlMto" component={ControlMtoScreen} />
          <Stack.Screen name="OrdenesCompra" component={OrdenesCompraScreen} />
          <Stack.Screen name="GenerarOC" component={GenerarOCScreen} />
          <Stack.Screen name="Proyectos" component={ProyectosScreen} />
          <Stack.Screen name="PlanosObra" component={PlanosScreen} />
        </Stack.Navigator>
      )}
    </NavigationContainer>
  )
}
