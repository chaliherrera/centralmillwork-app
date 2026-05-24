import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard, FolderOpen, ShoppingCart,
  Package, Truck, Users, ChevronLeft, ChevronRight, ShieldCheck,
  Inbox,
} from 'lucide-react'
import { useState } from 'react'
import clsx from 'clsx'
import { useAuth } from '@/context/AuthContext'
import { useTheme } from '@/context/ThemeContext'
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
  { to: '/tareas',         label: 'Tareas',             icon: Inbox,           roles: ['ADMIN'] },
  { to: '/usuarios',       label: 'Usuarios',           icon: ShieldCheck,     roles: ['ADMIN'] },
]

export default function Sidebar() {
  const { user } = useAuth()
  const { theme, setTheme } = useTheme()
  const [collapsed, setCollapsed] = useState(false)
  const isGlass = theme === 'glass'

  const visibleItems = NAV_ITEMS.filter(
    (item) => !user || item.roles.includes(user.rol)
  )

  return (
    <aside
      className={clsx(
        'flex flex-col h-full text-white transition-all duration-200',
        collapsed ? 'w-16' : 'w-60',
        isGlass ? '' : 'bg-forest-700',
      )}
      style={isGlass ? {
        background: 'rgba(20,18,14,0.55)',
        backdropFilter: 'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
        borderRight: '0.5px solid rgba(255,255,250,0.10)',
      } : undefined}
    >
      {/* Logo */}
      <div className={clsx(
        'flex items-center justify-between h-16 px-4',
        isGlass ? 'border-b border-[rgba(255,255,250,0.08)]' : 'border-b border-forest-600',
      )}>
        {!collapsed && (
          <div className="flex items-center overflow-hidden">
            <img
              src="/logo_cm_sidebar.png"
              alt="Central Millwork"
              className="h-9 w-auto object-contain"
            />
          </div>
        )}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className={clsx(
            'p-1.5 rounded-md transition-colors ml-auto',
            isGlass ? 'hover:bg-[rgba(255,255,250,0.08)]' : 'hover:bg-forest-600',
          )}
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
                  ? (isGlass
                      ? 'text-white'
                      : 'bg-gold-500 text-white shadow-sm')
                  : (isGlass
                      ? 'text-[rgba(255,255,250,0.78)] hover:bg-[rgba(255,255,250,0.06)] hover:text-white'
                      : 'text-forest-100 hover:bg-forest-600 hover:text-white'),
              )
            }
            style={({ isActive }: { isActive: boolean }) =>
              isActive && isGlass
                ? {
                    background: 'rgba(255,255,250,0.10)',
                    border: '0.5px solid rgba(255,255,250,0.18)',
                    boxShadow: 'inset 1px 1.5px 1px rgba(255,255,255,0.18)',
                  }
                : undefined
            }
          >
            <Icon size={18} className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className={clsx(
        'p-4 space-y-3',
        isGlass ? 'border-t border-[rgba(255,255,250,0.08)]' : 'border-t border-forest-600',
      )}>
        {/* Theme toggle */}
        {!collapsed && (
          <div
            role="group"
            aria-label="Tema visual"
            className={clsx(
              'flex items-center gap-0 rounded-full p-0.5 text-[11px] font-medium',
              isGlass ? 'bg-[rgba(255,255,250,0.06)]' : 'bg-forest-600',
            )}
          >
            <button
              onClick={() => setTheme('paper')}
              className={clsx(
                'flex-1 py-1 rounded-full transition-colors',
                theme === 'paper'
                  ? 'bg-gold-500 text-white shadow-sm'
                  : (isGlass ? 'text-[rgba(255,255,250,0.55)] hover:text-white' : 'text-forest-200 hover:text-white'),
              )}
            >
              Paper
            </button>
            <button
              onClick={() => setTheme('glass')}
              className={clsx(
                'flex-1 py-1 rounded-full transition-colors',
                theme === 'glass'
                  ? 'bg-gold-500 text-white shadow-sm'
                  : (isGlass ? 'text-[rgba(255,255,250,0.55)] hover:text-white' : 'text-forest-200 hover:text-white'),
              )}
            >
              Glass
            </button>
          </div>
        )}

        {!collapsed && (
          <p className={clsx(
            'text-xs text-center',
            isGlass ? 'text-[rgba(255,255,250,0.35)]' : 'text-forest-300',
          )}>v1.0.0 · 2026</p>
        )}
      </div>
    </aside>
  )
}
