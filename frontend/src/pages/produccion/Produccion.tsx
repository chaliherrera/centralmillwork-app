import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, UsersRound, Clock4 } from 'lucide-react'
import clsx from 'clsx'
import MapaTaller     from './MapaTaller'
import Ordenes        from './Ordenes'
import CrearOrden     from './CrearOrden'
import DetalleOrden   from './DetalleOrden'
import PersonalTaller from './PersonalTaller'
import ReportesHoras  from './ReportesHoras'

const TABS = [
  { to: '',           label: 'Mapa',           icon: LayoutDashboard, end: true  },
  { to: 'ordenes',    label: 'Órdenes',        icon: ClipboardList,   end: false },
  { to: 'personal',   label: 'Personal',       icon: UsersRound,      end: true  },
  { to: 'horas',      label: 'Horas',          icon: Clock4,          end: true  },
]

export default function Produccion() {
  return (
    <div className="space-y-4">
      {/* Sub-nav del módulo */}
      <nav className="flex items-center gap-1 border-b border-gray-200">
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => clsx(
              'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              isActive
                ? 'border-gold-500 text-forest-700'
                : 'border-transparent text-gray-500 hover:text-forest-700 hover:border-gray-300'
            )}
          >
            <tab.icon size={16} />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <Routes>
        <Route index                    element={<MapaTaller />} />
        <Route path="ordenes"           element={<Ordenes />} />
        <Route path="ordenes/nueva"     element={<CrearOrden />} />
        <Route path="ordenes/:id"       element={<DetalleOrden />} />
        <Route path="personal"          element={<PersonalTaller />} />
        <Route path="horas"             element={<ReportesHoras />} />
        <Route path="*" element={<Navigate to="" replace />} />
      </Routes>
    </div>
  )
}
