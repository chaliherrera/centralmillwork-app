// Bottom sheet de vidrio (SISTEMA_DE_DISENO.md §4). Scrim con fade + sheet que
// sube desde abajo (300ms). El contenido de arriba sigue visible, atenuado.
import React, { useEffect, useRef } from 'react'
import { Animated, Modal, Pressable, View, StyleSheet, Easing } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { color, glass, motion, radius, space } from '../theme/tokens'
import { GlassFill } from './Glass'

export default function BottomSheet({ visible, onClose, children }: {
  visible: boolean; onClose: () => void; children: React.ReactNode
}) {
  const insets = useSafeAreaInsets()
  const y = useRef(new Animated.Value(1)).current   // 1 = abajo (oculto), 0 = arriba
  const fade = useRef(new Animated.Value(0)).current

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: motion.scrim, useNativeDriver: true }),
        Animated.timing(y, { toValue: 0, duration: motion.sheet, easing: Easing.bezier(0.22, 0.8, 0.3, 1), useNativeDriver: true }),
      ]).start()
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: glass.scrim, opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            s.sheet,
            { paddingBottom: Math.max(insets.bottom, 20) + 10, transform: [{ translateY: y.interpolate({ inputRange: [0, 1], outputRange: [0, 600] }) }] },
          ]}
        >
          <GlassFill recipe="sheet" />
          <View style={s.grabber} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  )
}

const s = StyleSheet.create({
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopLeftRadius: radius.glass, borderTopRightRadius: radius.glass, overflow: 'hidden',
    borderTopWidth: StyleSheet.hairlineWidth * 2, borderColor: glass.sheet.border,
    paddingHorizontal: space.margin, paddingTop: 12,
    shadowColor: '#000', shadowOpacity: 0.55, shadowRadius: 50, shadowOffset: { width: 0, height: -18 }, elevation: 20,
  },
  grabber: { width: 44, height: 5, borderRadius: 3, backgroundColor: 'rgba(245,240,232,0.3)', alignSelf: 'center', marginBottom: 18 },
})
