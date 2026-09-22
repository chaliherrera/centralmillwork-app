import React from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useAuth } from '../context/AuthContext'
import { AREAS, modulosDeArea } from '../config/modulos'
import type { RootStackParamList } from '../navigation/types'
import { Screen, Toolbar, Icon, EmptyState, color, font, size, space } from '../ui'

type Nav = NativeStackNavigationProp<RootStackParamList>

export default function AreaHubScreen() {
  const insets = useSafeAreaInsets()
  const nav = useNavigation<Nav>()
  const { params } = useRoute<RouteProp<RootStackParamList, 'AreaHub'>>()
  const { user } = useAuth()
  const area = AREAS.find((a) => a.key === params.area)
  const modulos = modulosDeArea(params.area, user?.rol)

  return (
    <Screen edges={['bottom']}>
      <Toolbar title={area?.label ?? 'Área'} subtitle={area?.descripcion} onBack={() => nav.goBack()} />
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + 62 }]} showsVerticalScrollIndicator={false}>
        {modulos.length === 0 ? (
          <EmptyState title="Sin herramientas" line="Tu rol no tiene módulos en esta área." />
        ) : modulos.map((m) => (
          <Pressable key={m.id} onPress={() => nav.navigate(m.route as any)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}>
            <View style={styles.iconWrap}>
              <Icon name={m.icon} size={22} color={color.gold} strokeWidth={1.8} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.rowTitle}>{m.label}</Text>
              <Text style={styles.rowMeta}>{m.descripcion}</Text>
            </View>
            {m.offline === 'online' ? <Text style={styles.needNet}>requiere red</Text> : null}
            <Icon name="chevron" size={16} color="#6E665C" strokeWidth={1.8} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.margin, paddingBottom: 40 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, minHeight: 72, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.line },
  iconWrap: { width: 30, alignItems: 'center' },
  rowTitle: { fontFamily: font.bodyMed, fontSize: size.row, color: color.ink },
  rowMeta: { fontFamily: font.body, fontSize: size.secondary, color: color.mutedStrong, marginTop: 3 },
  needNet: { fontFamily: font.kickerMed, fontSize: 10, letterSpacing: 0.5, textTransform: 'uppercase', color: color.mutedStrong },
})
