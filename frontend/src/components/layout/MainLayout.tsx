import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles: Record<string, string> = {
  '/':                'Dashboard',
  '/proyectos':       'Proyectos',
  '/ordenes-compra':  'Órdenes de Compra',
  '/materiales':      'Materiales MTO',
  '/recepciones':     'Recepciones',
  '/proveedores':     'Proveedores',
  '/cotizaciones':    'Solicitudes de Cotización',
}

export default function MainLayout() {
  const { pathname } = useLocation()
  const base = '/' + pathname.split('/')[1]
  const title = pageTitles[base] ?? 'Central Millwork'

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header title={title} />
        <main className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-[1400px] mx-auto px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
