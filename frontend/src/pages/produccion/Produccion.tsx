import { Routes, Route, Navigate, NavLink } from 'react-router-dom'
import { LayoutDashboard, ClipboardList, UsersRound, Clock4, Package } from 'lucide-react'
import clsx from 'clsx'
import MapaTaller     from './MapaTaller'
import Ordenes        from './Ordenes'
import CrearOrden     from './CrearOrden'
import DetalleOrden   from './DetalleOrden'
import PersonalTaller from './PersonalTaller'
import ReportesHoras  from './ReportesHoras'
import Disponibles    from './Disponibles'

const TABS = [
  { to: '',           label: 'Mapa',           icon: LayoutDashboard, end: true  },
  { to: 'disponibles',label: 'Disponibles',    icon: Package,         end: true  },
  { to: 'ordenes',    label: 'Órdenes',        icon: ClipboardList,   end: false },
  { to: 'personal',   label: 'Personal',       icon: UsersRound,      end: true  },
  { to: 'horas',      label: 'Horas',          icon: Clock4,          end: true  },
]

export default function Produccion() {
  return (
    <div className="-mx-6 -my-6">
      {/* Sub-nav del módulo — estilo blueprint */}
      <nav
        className="flex items-center gap-2 px-8 pt-[14px]"
        style={{ backgroundColor: '#F6F4EE', borderBottom: '1px solid #ECE7DC' }}
      >
        {TABS.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) => clsx(
              'flex items-center gap-[7px] px-3.5 py-2.5 text-[13.5px] -mb-px transition-colors',
              isActive ? 'font-semibold' : 'font-medium'
            )}
            style={({ isActive }) => ({
              color: isActive ? '#1F1B14' : '#6B6356',
              borderBottom: `2px solid ${isActive ? '#A4842C' : 'transparent'}`,
            })}
          >
            <tab.icon size={15} />
            {tab.label}
          </NavLink>
        ))}
      </nav>

      <div className="px-8 py-5">
        <Routes>
          <Route index                    element={<MapaTaller />} />
          <Route path="disponibles"       element={<Disponibles />} />
          <Route path="ordenes"           element={<Ordenes />} />
          <Route path="ordenes/nueva"     element={<CrearOrden />} />
          <Route path="ordenes/:id"       element={<DetalleOrden />} />
          <Route path="personal"          element={<PersonalTaller />} />
          <Route path="horas"             element={<ReportesHoras />} />
          <Route path="*" element={<Navigate to="" replace />} />
        </Routes>
      </div>
    </div>
  )
}
