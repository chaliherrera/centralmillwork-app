import { LogOut, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import type { UserRole } from '@/types'

const ROL_LABEL: Record<UserRole, string> = {
  ADMIN:              'Admin',
  PROCUREMENT:        'Procurement',
  PRODUCTION:         'Production',
  PROJECT_MANAGEMENT: 'Project Manager',
  CONTABILIDAD:       'Accounting',
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
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6">
      <h1 className="text-lg font-semibold text-forest-700">{title}</h1>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 pl-3 border-l border-gray-200">
          <div className="w-8 h-8 bg-forest-500 rounded-full flex items-center justify-center">
            <User size={16} className="text-white" />
          </div>
          {user && (
            <div className="hidden md:block">
              <p className="text-xs font-medium text-gray-800 leading-none">{user.nombre}</p>
              <p className="text-xs text-gray-500 mt-0.5">{ROL_LABEL[user.rol]}</p>
            </div>
          )}
          <button
            className="p-1.5 text-gray-400 hover:text-red-500 transition-colors ml-1"
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
