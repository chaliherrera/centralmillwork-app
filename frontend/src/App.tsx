import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import MainLayout from '@/components/layout/MainLayout'
import Login from '@/pages/Login'
import Dashboard from '@/pages/Dashboard'
import Proyectos from '@/pages/Proyectos'
import ProyectoDetalle from '@/pages/ProyectoDetalle'
import OrdenesCompra from '@/pages/OrdenesCompra'
import Materiales from '@/pages/Materiales'
import Mtos from '@/pages/Mtos'
import ReporteComprasJunJul from '@/pages/ReporteComprasJunJul'
import ReporteOP from '@/pages/ReporteOP'
import Recepciones from '@/pages/Recepciones'
import Proveedores from '@/pages/Proveedores'
import Tareas from '@/pages/Tareas'
import Usuarios from '@/pages/Usuarios'
import Produccion from '@/pages/produccion/Produccion'
import Muestras from '@/pages/Muestras'
import Estimacion from '@/pages/Estimacion'
import Ingenieria from '@/pages/Ingenieria'
import ProjectMgmt from '@/pages/ProjectMgmt'
import Schedule from '@/pages/Schedule'
import ScheduleProyecto from '@/pages/ScheduleProyecto'
import Finanzas from '@/pages/Finanzas'
import Logistica from '@/pages/Logistica'
import Field from '@/pages/Field'
import KioskApp from '@/pages/kiosk/KioskApp'
import ClientPortal from '@/pages/portal/ClientPortal'
import { Loader2 } from 'lucide-react'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={28} className="animate-spin text-forest-600" />
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  if (user?.rol !== 'ADMIN') return <Navigate to="/" replace />
  return <>{children}</>
}

// VIEWER (agregado 2026-07-17): incluido en Producción y Muestras para
// tener acceso de lectura. Los endpoints WRITE del backend igual lo
// rechazan con 403, así que ver está OK pero no puede modificar nada.
function ProduccionRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'SHOP_MANAGER', 'VIEWER']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

function MuestrasRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'ENGINEERING', 'SHOP_MANAGER', 'PROCUREMENT', 'VIEWER']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

// Estimación = puerta de entrada del schedule. La usa quien arranca los proyectos.
function EstimacionRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'PROJECT_MANAGEMENT']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

function IngenieriaRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'ENGINEERING', 'PROJECT_MANAGEMENT']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

function PmRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'PROJECT_MANAGEMENT']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

// Schedule = la columna vertebral. Vista de cartera (por proyecto). La ven quienes
// dirigen el flujo: PM, dirección, taller e ingeniería. Read-only; las escrituras
// las enforce el backend por endpoint (VIEWER, por ej., ve pero no modifica).
function ScheduleRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'PROJECT_MANAGEMENT', 'SHOP_MANAGER', 'ENGINEERING', 'VIEWER']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

function FinanzasRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'CONTABILIDAD']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

function LogisticaRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'LOGISTICA', 'PROJECT_MANAGEMENT']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

function FieldRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'FIELD', 'ENGINEERING', 'PROJECT_MANAGEMENT']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

// Tareas = buzón de Muestras por rol. Cada rol ve sus tareas (scoping en el backend).
function TareasRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth()
  const allowed = ['ADMIN', 'PROCUREMENT', 'SHOP_MANAGER', 'ENGINEERING', 'PROJECT_MANAGEMENT']
  if (!user || !allowed.includes(user.rol)) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      {/* Kiosko de producción — sub-app autónoma con su propio AuthContext.
          NO pasa por ProtectedRoute (auth del sistema) ni renderiza el sidebar. */}
      <Route path="/kiosk/*" element={<KioskApp />} />

      {/* Portal de cliente — público, autorizado por token en la URL.
          Sin ProtectedRoute ni sidebar. */}
      <Route path="/portal/:token" element={<ClientPortal />} />

      <Route element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
        <Route index element={<Dashboard />} />
        <Route path="schedule"         element={<ScheduleRoute><Schedule /></ScheduleRoute>} />
        <Route path="schedule/:id"     element={<ScheduleRoute><ScheduleProyecto /></ScheduleRoute>} />
        <Route path="proyectos"        element={<Proyectos />} />
        <Route path="proyectos/:id"    element={<ProyectoDetalle />} />
        <Route path="ordenes-compra/*" element={<OrdenesCompra />} />
        <Route path="materiales/*"     element={<Materiales />} />
        <Route path="mtos"             element={<Mtos />} />
        <Route path="reportes/compras-jun-jul" element={<ReporteComprasJunJul />} />
        <Route path="reportes/op/:numero"      element={<ReporteOP />} />
        <Route path="recepciones/*"    element={<Recepciones />} />
        <Route path="proveedores/*"    element={<Proveedores />} />
        <Route path="produccion/*"     element={<ProduccionRoute><Produccion /></ProduccionRoute>} />
        <Route path="muestras"         element={<MuestrasRoute><Muestras /></MuestrasRoute>} />
        <Route path="estimados"        element={<EstimacionRoute><Estimacion /></EstimacionRoute>} />
        <Route path="ingenieria"       element={<IngenieriaRoute><Ingenieria /></IngenieriaRoute>} />
        {/* Plan de Ingeniería ahora vive dentro de /pm (es herramienta del PM). Redirect por links viejos. */}
        <Route path="ingenieria-plan"  element={<Navigate to="/pm" replace />} />
        <Route path="pm"               element={<PmRoute><ProjectMgmt /></PmRoute>} />
        <Route path="finanzas"         element={<FinanzasRoute><Finanzas /></FinanzasRoute>} />
        <Route path="logistica"        element={<LogisticaRoute><Logistica /></LogisticaRoute>} />
        <Route path="field"            element={<FieldRoute><Field /></FieldRoute>} />
        <Route path="tareas"           element={<TareasRoute><Tareas /></TareasRoute>} />
        <Route path="usuarios"         element={<AdminRoute><Usuarios /></AdminRoute>} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
