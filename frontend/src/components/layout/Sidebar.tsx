import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, ShoppingCart,
  Package, Truck, Users, ChevronLeft, ChevronRight, ShieldCheck,
  Factory,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import type { UserRole } from '@/types'

interface NavItem {
  to: string
  label: string
  icon: React.ElementType
  roles: UserRole[]
}

const NAV_ITEMS: NavItem[] = [
  { to: '/',               label: 'Dashboard',         icon: LayoutDashboard, roles: ['ADMIN','PROCUREMENT','PROJECT_MANAGEMENT','PRODUCTION'] },
  { to: '/proyectos',      label: 'Proyectos',          icon: FolderOpen,      roles: ['ADMIN','PROCUREMENT','PROJECT_MANAGEMENT'] },
  { to: '/ordenes-compra', label: 'Órdenes de Compra',  icon: ShoppingCart,    roles: ['ADMIN','PROCUREMENT','PROJECT_MANAGEMENT','PRODUCTION','CONTABILIDAD'] },
  { to: '/materiales',     label: 'Materiales MTO',     icon: Package,         roles: ['ADMIN','PROCUREMENT','PROJECT_MANAGEMENT','PRODUCTION'] },
  { to: '/recepciones',    label: 'Recepciones',        icon: Truck,           roles: ['ADMIN','PROCUREMENT','PRODUCTION'] },
  { to: '/proveedores',    label: 'Proveedores',        icon: Users,           roles: ['ADMIN','PROCUREMENT'] },
  { to: '/produccion',     label: 'Producción',         icon: Factory,         roles: ['ADMIN','SHOP_MANAGER'] },
  { to: '/usuarios',       label: 'Usuarios',           icon: ShieldCheck,     roles: ['ADMIN'] },
]

export default function Sidebar() {
  const { user } = useAuth()
  const [collapsed, setCollapsed] = useState(false)

  const visibleItems = NAV_ITEMS.filter(
    (item) => !user || item.roles.includes(user.rol)
  )

  return (
    <aside
      className={clsx(
        'flex flex-col h-full transition-all duration-200',
        collapsed ? 'w-16' : 'w-[232px]'
      )}
      style={{ backgroundColor: '#1C1A17', color: '#C9C3B8' }}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-5 border-b" style={{ borderColor: 'rgba(201,195,184,0.08)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2 overflow-hidden">
            <div
              className="w-[22px] h-[22px] rounded-full shrink-0"
              style={{
                background: 'conic-gradient(from 220deg, #E5732E 0 75%, transparent 75% 100%)',
                WebkitMask: 'radial-gradient(circle, transparent 38%, #000 39%)',
                mask:        'radial-gradient(circle, transparent 38%, #000 39%)',
              }}
            />
            <span className="text-[13px] font-medium tracking-[0.3px] whitespace-nowrap">central millwork</span>
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md transition-colors ml-auto"
          style={{ color: '#7A736A' }}
          onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#2A2520')}
          onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-5 space-y-0.5 px-3 overflow-y-auto">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-md transition-colors duration-100',
                'text-[13.5px]',
                isActive ? 'font-semibold' : 'font-medium'
              )
            }
            style={({ isActive }) => ({
              backgroundColor: isActive ? '#A4842C' : 'transparent',
              color: isActive ? '#FFFFFF' : '#C9C3B8',
            })}
            onMouseEnter={(e) => {
              if (!e.currentTarget.classList.contains('font-semibold')) {
                e.currentTarget.style.backgroundColor = '#2A2520'
                e.currentTarget.style.color = '#FFFFFF'
              }
            }}
            onMouseLeave={(e) => {
              if (!e.currentTarget.classList.contains('font-semibold')) {
                e.currentTarget.style.backgroundColor = 'transparent'
                e.currentTarget.style.color = '#C9C3B8'
              }
            }}
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t" style={{ borderColor: 'rgba(201,195,184,0.08)' }}>
        {!collapsed && (
          <p className="text-[11px] text-center" style={{ color: '#7A736A' }}>v1.0.0 · 2026</p>
        )}
      </div>
    </aside>
  )
}
