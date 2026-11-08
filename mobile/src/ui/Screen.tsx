// Contenedor base de pantalla: fondo oscuro único + safe area. `pad` aplica el
// margen lateral estándar de 24px. Sin tarjetas — el contenido va plano encima.
import React from 'react'
import { View, ViewStyle, StatusBar } from 'react-native'
import { SafeAreaView, Edge } from 'react-native-safe-area-context'
import { color, space } from '../theme/tokens'

interface Props {
  children: React.ReactNode
  pad?: boolean
  edges?: Edge[]
  style?: ViewStyle
}

export default function Screen({ children, pad = false, edges = ['top', 'bottom'], style }: Props) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: color.bg }} edges={edges}>
      <StatusBar barStyle="light-content" />
      <View style={[{ flex: 1, paddingHorizontal: pad ? space.margin : 0 }, style]}>
        {children}
      </View>
    </SafeAreaView>
  )
}
