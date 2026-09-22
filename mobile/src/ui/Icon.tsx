// Íconos de trazo uniforme (SISTEMA_DE_DISENO.md §Assets): stroke 1.7–2, remates
// redondeados, sin relleno. Reemplazan los emojis. Un solo componente <Icon/>.
import React from 'react'
import Svg, { Circle, Line, Path, Polyline, Rect } from 'react-native-svg'
import { color as C } from '../theme/tokens'

export type IconName =
  | 'chevron' | 'back' | 'chevronDown' | 'search' | 'check' | 'plus' | 'x'
  | 'home' | 'project' | 'doc' | 'user' | 'camera' | 'alert' | 'punch'
  | 'download' | 'refresh' | 'hammer' | 'truck' | 'image' | 'cloudOff' | 'pin'

interface Props { name: IconName; size?: number; color?: string; strokeWidth?: number }

export default function Icon({ name, size = 22, color = C.gold, strokeWidth = 1.8 }: Props) {
  const p = { stroke: color, strokeWidth, fill: 'none', strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  return (
    <Svg width={size} height={size} viewBox="0 0 22 22">
      {render(name, p)}
    </Svg>
  )
}

function render(name: IconName, p: any) {
  switch (name) {
    case 'chevron':
      return <Polyline points="8,4 14,11 8,18" {...p} />
    case 'back':
      return <Polyline points="14,4 8,11 14,18" {...p} />
    case 'chevronDown':
      return <Polyline points="4,8 11,14 18,8" {...p} />
    case 'search':
      return <>
        <Circle cx={9} cy={9} r={6} {...p} />
        <Line x1={13.5} y1={13.5} x2={18.5} y2={18.5} {...p} />
      </>
    case 'check':
      return <Polyline points="3,11 8,16 19,5" {...p} />
    case 'plus':
      return <>
        <Line x1={11} y1={4} x2={11} y2={18} {...p} />
        <Line x1={4} y1={11} x2={18} y2={11} {...p} />
      </>
    case 'x':
      return <>
        <Line x1={5} y1={5} x2={17} y2={17} {...p} />
        <Line x1={17} y1={5} x2={5} y2={17} {...p} />
      </>
    case 'home':
      return <Polyline points="3,9.5 11,3 19,9.5 19,19 3,19 3,9.5" {...p} />
    case 'project':
      return <>
        <Rect x={2.5} y={4} width={17} height={14} rx={1.5} {...p} />
        <Line x1={2.5} y1={8.5} x2={19.5} y2={8.5} {...p} />
      </>
    case 'doc':
      return <>
        <Rect x={4} y={2.5} width={14} height={17} rx={1.5} {...p} />
        <Line x1={7.5} y1={8} x2={14.5} y2={8} {...p} />
        <Line x1={7.5} y1={12} x2={12} y2={12} {...p} />
      </>
    case 'user':
      return <>
        <Circle cx={11} cy={8} r={3.6} {...p} />
        <Path d="M4.5 19c1.4-3.4 4-5 6.5-5s5.1 1.6 6.5 5" {...p} />
      </>
    case 'camera':
      return <>
        <Path d="M3 7.5h3l1.5-2h7L15 7.5h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1z" {...p} />
        <Circle cx={11} cy={12} r={3.2} {...p} />
      </>
    case 'alert':
      return <>
        <Path d="M11 3 20 18 2 18Z" {...p} />
        <Line x1={11} y1={9} x2={11} y2={13} {...p} />
        <Line x1={11} y1={15.5} x2={11} y2={15.6} {...p} />
      </>
    case 'punch':
      return <Polyline points="3,11 8,16 19,5" {...p} />
    case 'download':
      return <>
        <Line x1={11} y1={3} x2={11} y2={14} {...p} />
        <Polyline points="6,10 11,15 16,10" {...p} />
        <Line x1={4} y1={18.5} x2={18} y2={18.5} {...p} />
      </>
    case 'refresh':
      return <>
        <Path d="M18 7a8 8 0 1 0 1.5 5" {...p} />
        <Polyline points="18,2 18,7 13,7" {...p} />
      </>
    case 'hammer':
      return <>
        <Path d="M4 18 12 10" {...p} />
        <Path d="M10 8l4-4 5 5-4 4-5-5z" {...p} />
      </>
    case 'truck':
      return <>
        <Rect x={2} y={6} width={11} height={9} rx={1} {...p} />
        <Path d="M13 9h4l3 3v3h-7V9z" {...p} />
        <Circle cx={6} cy={17} r={1.6} {...p} />
        <Circle cx={16} cy={17} r={1.6} {...p} />
      </>
    case 'image':
      return <>
        <Rect x={3} y={4} width={16} height={14} rx={1.5} {...p} />
        <Circle cx={8} cy={9} r={1.6} {...p} />
        <Polyline points="5,16 10,11 14,15 17,12 19,14" {...p} />
      </>
    case 'cloudOff':
      return <>
        <Path d="M6 16a4 4 0 0 1-.5-7.9A5 5 0 0 1 15 7" {...p} />
        <Path d="M17 10a3.5 3.5 0 0 1 0 6H9" {...p} />
        <Line x1={3} y1={3} x2={19} y2={19} {...p} />
      </>
    case 'pin':
      return <>
        <Path d="M11 20s6-5.3 6-10a6 6 0 1 0-12 0c0 4.7 6 10 6 10z" {...p} />
        <Circle cx={11} cy={10} r={2.2} {...p} />
      </>
    default:
      return null
  }
}
