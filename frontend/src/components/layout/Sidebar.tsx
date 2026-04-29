import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, ShoppingCart,
  Package, Truck, Users, ChevronLeft, ChevronRight, ShieldCheck,
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
  { to: '/proyectos',      label: 'Proyectos',          icon: FolderOpen,      roles: ['ADMIN','PROCUREMENT'] },
  { to: '/ordenes-compra', label: 'Órdenes de Compra',  icon: ShoppingCart,    roles: ['ADMIN','PROCUREMENT'] },
  { to: '/materiales',     label: 'Materiales MTO',     icon: Package,         roles: ['ADMIN','PROCUREMENT','PRODUCTION','PROJECT_MANAGEMENT'] },
  { to: '/recepciones',    label: 'Recepciones',        icon: Truck,           roles: ['ADMIN','PROCUREMENT','PRODUCTION','RECEPTION','PROJECT_MANAGEMENT'] },
  { to: '/proveedores',    label: 'Proveedores',        icon: Users,           roles: ['ADMIN','PROCUREMENT'] },
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
        'flex flex-col h-full bg-forest-700 text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-60'
      )}
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-forest-600">
        {!collapsed && (
          <div className="flex items-center overflow-hidden">
            <img
              src="/logo_cm.jpg"
              alt="Central Millwork"
              className="h-9 w-auto object-contain"
            />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="p-1.5 rounded-md hover:bg-forest-600 transition-colors ml-auto"
          title={collapsed ? 'Expandir' : 'Colapsar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 space-y-0.5 px-2 overflow-y-auto">
        {visibleItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-100',
                isActive
                  ? 'bg-gold-500 text-white shadow-sm'
                  : 'text-forest-100 hover:bg-forest-600 hover:text-white'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-forest-600">
        {!collapsed && (
          <p className="text-forest-300 text-xs text-center">v1.0.0 · 2026</p>
        )}
      </div>
    </aside>
  )
}
