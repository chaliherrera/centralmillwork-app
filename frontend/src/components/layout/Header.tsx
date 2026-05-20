import { LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import NotificacionesPanel from './NotificacionesPanel'
import type { UserRole } from '@/types'

const ROL_LABEL: Record<UserRole, string> = {
  ADMIN:              'Admin',
  PROCUREMENT:        'Procurement',
  PRODUCTION:         'Production',
  PROJECT_MANAGEMENT: 'Project Manager',
  CONTABILIDAD:       'Accounting',
  SHOP_MANAGER:       'Shop Manager',
}

interface HeaderProps { title: string }

export default function Header({ title }: HeaderProps) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <header
      className="flex items-center justify-between px-8 py-[18px] bg-white"
      style={{ borderBottom: '1px solid #ECE7DC' }}
    >
      <h1 className="text-[18px] font-semibold tracking-[-0.2px]" style={{ color: '#1F1B14' }}>
        {title}
      </h1>

      <div className="flex items-center gap-[22px]">
        {/* Campana de notificaciones — solo visible para ADMIN y SHOP_MANAGER */}
        <NotificacionesPanel />

        <div className="flex items-center gap-2.5">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center"
            style={{ backgroundColor: '#F1EEE6', color: '#6B6356' }}
          >
            <User size={14} />
          </div>
          {user && (
            <div className="hidden md:block leading-tight">
              <p className="text-[13px] font-semibold" style={{ color: '#1F1B14' }}>{user.nombre}</p>
              <p className="text-[11px] mt-0.5" style={{ color: '#6B6356' }}>{ROL_LABEL[user.rol]}</p>
            </div>
          )}
          <button
            className="p-1.5 ml-1 transition-colors"
            style={{ color: '#6B6356' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#B53A3A')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#6B6356')}
            title="Cerrar sesión"
            onClick={handleLogout}
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </header>
  )
}
