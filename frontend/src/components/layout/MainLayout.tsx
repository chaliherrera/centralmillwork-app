import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'
import { useTheme } from '@/context/ThemeContext'

const pageTitles: Record<string, string> = {
  '/':                'Dashboard',
  '/proyectos':       'Proyectos',
  '/ordenes-compra':  'Órdenes de Compra',
  '/materiales':      'Materiales MTO',
  '/recepciones':     'Recepciones',
  '/proveedores':     'Proveedores',
  '/tareas':          'Tareas',
  '/cotizaciones':    'Solicitudes de Cotización',
  '/produccion':      'Producción',
  '/muestras':        'Muestras',
  '/usuarios':        'Usuarios',
}

export default function MainLayout() {
  const { pathname } = useLocation()
  const { theme } = useTheme()
  const base = '/' + pathname.split('/')[1]
  const title = pageTitles[base] ?? 'Central Millwork'
  const isGlass = theme === 'glass'
  const isTareas = base === '/tareas'

  // Solo /tareas usa el mesh transparente en modo glass. Las demas paginas
  // siguen siendo paper aunque el theme este en glass — opt-in por pagina.
  const useGlassChrome = isGlass && isTareas

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={title} glass={useGlassChrome} />
        <main
          className={useGlassChrome ? 'flex-1 overflow-y-auto' : 'flex-1 overflow-y-auto bg-gray-50'}
          style={useGlassChrome ? { background: 'transparent' } : undefined}
        >
          <div className="max-w-[1400px] mx-auto px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
